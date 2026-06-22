/**
 * Seerr Status Poller — Fallback for missing MEDIA_APPROVED webhooks.
 *
 * Seerr only fires the MEDIA_APPROVED webhook if the user has explicitly
 * enabled "Request Approved" under Settings → Notifications → Webhook →
 * Notification Types. Many users miss this, so admin approvals via Seerr UI
 * silently fail to notify the requester.
 *
 * This poller fills that gap by periodically fetching Seerr requests and
 * detecting pending → approved/declined transitions, then sending the same
 * DM that the webhook handler would have sent.
 *
 * Disabled by default. Enable via SEERR_STATUS_POLLING_ENABLED=true.
 * Default interval: 120s. Override via SEERR_STATUS_POLL_INTERVAL_SECONDS.
 *
 * Deduplicates against notify-dedup.json so we never double-DM if a real
 * MEDIA_APPROVED webhook arrives within 48h of the polled detection.
 */

import { fetchRequests } from "../api/seerr.js";
import { updateFromSeerr } from "../utils/requestStore.js";
import { sendRequesterDm, getAdminPendingMsg, removeAdminPendingMsg } from "../seerrWebhook.js";
import { wasRecentlyNotified, markNotified } from "../utils/notifyDedup.js";
import logger from "../utils/logger.js";
import { botState } from "./botState.js";
import { t } from "../utils/botStrings.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

let pollerTimer = null;
const lastSeenStatus = new Map(); // requestId → status

const STATUS_PENDING = 1;
const STATUS_APPROVED = 2;
const STATUS_DECLINED = 3;

export function startSeerrStatusPoller() {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
  }
  lastSeenStatus.clear();

  if (process.env.SEERR_STATUS_POLLING_ENABLED !== "true") {
    logger.info("[SEERR Status Poller] Disabled (set SEERR_STATUS_POLLING_ENABLED=true to enable)");
    return;
  }

  const seerrUrl = process.env.SEERR_URL;
  const apiKey = process.env.SEERR_API_KEY;
  if (!seerrUrl || !apiKey) {
    logger.info("[SEERR Status Poller] Seerr not configured – poller not started");
    return;
  }

  let intervalSec = parseInt(process.env.SEERR_STATUS_POLL_INTERVAL_SECONDS || "120", 10);
  if (!Number.isFinite(intervalSec) || intervalSec < 30) {
    logger.warn(`[SEERR Status Poller] Invalid interval (${intervalSec}s), using 120s minimum`);
    intervalSec = 120;
  }

  logger.info(`[SEERR Status Poller] Starting – polling every ${intervalSec}s`);

  // Seed first: capture current status without firing DMs (avoid spam on restart)
  poll(true).catch((err) =>
    logger.warn(`[SEERR Status Poller] Seed poll error: ${err.message}`)
  );

  pollerTimer = setInterval(() => {
    poll(false).catch((err) =>
      logger.warn(`[SEERR Status Poller] Poll error: ${err.message}`)
    );
  }, intervalSec * 1000);
  if (typeof pollerTimer.unref === "function") pollerTimer.unref();
}

export function stopSeerrStatusPoller() {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
  }
  lastSeenStatus.clear();
  logger.info("[SEERR Status Poller] Stopped");
}

export async function poll(seedOnly) {
  const seerrUrl = process.env.SEERR_URL;
  const apiKey = process.env.SEERR_API_KEY;
  if (!seerrUrl || !apiKey) return;

  const data = await fetchRequests(seerrUrl, apiKey, 100, "all");
  const results = data?.results || [];

  // Keep the request lifecycle store warm. Reuses the already-fetched data — no
  // extra HTTP call. Skipped during seed for parity with the DM-suppression logic.
  if (!seedOnly) updateFromSeerr(results);

  for (const req of results) {
    const reqId = req.id;
    const status = req.status;
    const previousStatus = lastSeenStatus.get(reqId);

    // Seed phase: just record current status, never fire DMs
    if (seedOnly) {
      lastSeenStatus.set(reqId, status);
      continue;
    }

    // First time we see this request after seed: just track it (it's a new request,
    // the MEDIA_PENDING webhook should already have fired the DM)
    if (previousStatus === undefined) {
      lastSeenStatus.set(reqId, status);
      continue;
    }

    if (previousStatus === status) continue;

    // Detect pending → approved/declined transitions
    if (
      previousStatus === STATUS_PENDING &&
      (status === STATUS_APPROVED || status === STATUS_DECLINED)
    ) {
      const tmdbId = req.media?.tmdbId;
      const mediaType = req.media?.mediaType || req.type;
      const eventType = status === STATUS_APPROVED ? "MEDIA_APPROVED" : "MEDIA_DECLINED";
      // Shared key with seerrWebhook.js + seerrApproveDecline.js so the three
      // sources don't fire duplicate DMs for the same approval/decline.
      const dedupKey = `${eventType}-${reqId}`;

      // ── Edit admin embed to show disabled status button ──────────────────
      if (botState.discordClient) {
        const msgRef = getAdminPendingMsg(reqId);
        if (msgRef) {
          try {
            const ch = await botState.discordClient.channels.fetch(msgRef.channelId);
            if (ch) {
              const msg = await ch.messages.fetch(msgRef.messageId);
              if (msg) {
                const label = status === STATUS_APPROVED
                  ? `✅ ${t("admin_status_approved")} (Seerr)`
                  : `❌ ${t("admin_status_declined")} (Seerr)`;
                const style = status === STATUS_APPROVED ? ButtonStyle.Success : ButtonStyle.Danger;
                // Keep link buttons, replace interactive ones with a single disabled status button
                const newButtons = [
                  new ButtonBuilder()
                    .setCustomId("seerr_action_done")
                    .setLabel(label)
                    .setStyle(style)
                    .setDisabled(true),
                ];
                for (const row of msg.components) {
                  for (const comp of row.components) {
                    if (comp.data.style === ButtonStyle.Link) {
                      newButtons.push(ButtonBuilder.from(comp));
                    }
                  }
                }
                await msg.edit({
                  components: [new ActionRowBuilder().addComponents(newButtons)],
                });
                logger.info(
                  `[SEERR Status Poller] ✅ Edited admin embed for request ${reqId} (${label})`
                );
              }
            }
          } catch (editErr) {
            logger.debug(
              `[SEERR Status Poller] Could not edit admin embed for request ${reqId}: ${editErr.message}`
            );
          } finally {
            removeAdminPendingMsg(reqId);
          }
        }
      }

      // ── Send requester DM ─────────────────────────────────────────────────
      if (wasRecentlyNotified("approval", dedupKey)) {
        logger.debug(
          `[SEERR Status Poller] Skipping ${eventType} DM for request ${reqId} (recently notified)`
        );
      } else if (botState.discordClient) {
        // Skip if we have no real title — the webhook + button-click handlers
        // produce richer DMs with proper titles. A bare "TMDB 12345" DM is
        // worse than no DM, so we abort instead.
        const realTitle = req.media?.title;
        if (!realTitle) {
          logger.debug(
            `[SEERR Status Poller] Skipping ${eventType} DM for request ${reqId} — no title resolved (webhook/button-click should cover this)`
          );
          markNotified("approval", dedupKey); // mark anyway so we don't loop
          lastSeenStatus.set(reqId, status);
          continue;
        }
        const synth = {
          subject: realTitle,
          media: { media_type: mediaType, tmdbId },
          request: {
            request_id: reqId,
            requestedBy_settings_discordId: req.requestedBy?.settings?.discordId,
            requestedBy_username:
              req.requestedBy?.username || req.requestedBy?.displayName,
            requestedBy_email: req.requestedBy?.email,
            comment: null,
          },
        };
        try {
          await sendRequesterDm(synth, eventType, {}, botState.discordClient, null, null, { tmdbId });
          markNotified("approval", dedupKey);
          logger.info(
            `[SEERR Status Poller] Detected pending→${
              status === STATUS_APPROVED ? "approved" : "declined"
            } transition for request ${reqId} (TMDB ${tmdbId})`
          );
        } catch (err) {
          logger.warn(
            `[SEERR Status Poller] DM dispatch failed for request ${reqId}: ${err.message}`
          );
        }
      }
    }

    lastSeenStatus.set(reqId, status);
  }

  // Cleanup: drop entries for requests no longer in the latest fetch (e.g. deleted)
  const seenIds = new Set(results.map((r) => r.id));
  for (const id of [...lastSeenStatus.keys()]) {
    if (!seenIds.has(id)) lastSeenStatus.delete(id);
  }
}
