import { approveRequest, declineRequest, fetchRequestById } from "../../api/seerr.js";
import { getSeerrUrl, getSeerrApiKey } from "../helpers.js";
import { t } from "../../utils/botStrings.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import logger from "../../utils/logger.js";
import { botState } from "../botState.js";
import { sendRequesterDm, removeAdminPendingMsg } from "../../seerrWebhook.js";
import { markNotified, wasRecentlyNotified } from "../../utils/notifyDedup.js";

/**
 * Handle approve/decline button clicks on MEDIA_PENDING admin notifications.
 */
export async function handleSeerrApproveDecline(interaction) {
  const [action, requestId] = interaction.customId.split("|");
  const isApprove = action === "seerr_approve";

  const seerrUrl = getSeerrUrl();
  const apiKey = getSeerrApiKey();

  if (!seerrUrl || !apiKey) {
    return interaction.reply({ content: t("command_config_missing"), flags: 64 });
  }

  await interaction.deferUpdate();

  try {
    // ── Pre-flight: check current status before acting ──────────────────────
    const STATUS_PENDING = 1;
    const current = await fetchRequestById(requestId, seerrUrl, apiKey);
    if (current && current.status !== STATUS_PENDING) {
      // Request is no longer pending — disable the buttons and inform the admin
      const statusLabel = (() => {
        switch (current.status) {
          case 2: return t("admin_status_approved");
          case 3: return t("admin_status_declined");
          case 5: return t("admin_status_available");
          default: return t("admin_status_other");
        }
      })();
      const handler = current.modifiedBy?.displayName
        ? ` (${current.modifiedBy.displayName})`
        : "";

      // Disable all interactive (non-link) buttons in the original row
      const originalRow = interaction.message.components[0];
      const disabledButtons = [];
      if (originalRow) {
        for (const comp of originalRow.components) {
          if (comp.data.style === ButtonStyle.Link) {
            disabledButtons.push(ButtonBuilder.from(comp));
          } else {
            disabledButtons.push(ButtonBuilder.from(comp).setDisabled(true));
          }
        }
      }
      if (disabledButtons.length > 0) {
        await interaction.editReply({
          components: [new ActionRowBuilder().addComponents(disabledButtons)],
        });
      }
      await interaction.followUp({
        content: t("admin_already_handled", { status: statusLabel, handler }),
        flags: 64,
      });
      return;
    }

    let apiResult;
    if (isApprove) {
      apiResult = await approveRequest(parseInt(requestId, 10), seerrUrl, apiKey);
    } else {
      apiResult = await declineRequest(parseInt(requestId, 10), seerrUrl, apiKey);
    }

    // DM the requester via the central sendRequesterDm() so texts/buttons stay
    // consistent with webhook-driven DMs (same i18n keys, same embed shape).
    // Cross-source dedup: if Seerr's webhook already fired the DM for this
    // request, skip — the webhook's payload has richer data (poster image,
    // proper title) than our synthetic one here.
    try {
      const discordClient = botState.discordClient;
      if (discordClient && apiResult) {
        const eventType = isApprove ? "MEDIA_APPROVED" : "MEDIA_DECLINED";
        const reqId = apiResult?.id ?? requestId;
        if (reqId && wasRecentlyNotified("approval", `${eventType}-${reqId}`)) {
          logger.debug(`[SEERR] Skipping button-click DM — webhook already sent ${eventType} for request ${reqId}`);
        } else {
          const synth = {
            subject: interaction.message.embeds[0]?.title || "Unknown",
            media: { media_type: apiResult?.type || apiResult?.media?.mediaType },
            request: {
              request_id: reqId,
              requestedBy_settings_discordId: apiResult?.requestedBy?.settings?.discordId,
              requestedBy_username: apiResult?.requestedBy?.username || apiResult?.requestedBy?.displayName,
              comment: null,
            },
          };
          await sendRequesterDm(
            synth,
            eventType,
            {},
            discordClient,
            null,
            null,
            { tmdbId: apiResult?.media?.tmdbId }
          );
          // sendRequesterDm marks notified internally, but for safety mark here
          // too in case the user fetch fails inside sendRequesterDm.
          if (reqId) markNotified("approval", `${eventType}-${reqId}`);
        }
      }
    } catch (dmErr) {
      logger.warn(`[SEERR] Could not send DM after ${isApprove ? "approve" : "decline"}: ${dmErr.message}`);
    }

    // Update the message: disable buttons and show who acted
    const username = interaction.user.username;
    const label = isApprove
      ? `✅ ${t("btn_approved_by")} ${username}`
      : `❌ ${t("btn_declined_by")} ${username}`;

    // Rebuild components: replace approve/decline with a disabled status button, keep link buttons
    const originalRow = interaction.message.components[0];
    const newButtons = [];

    // Add disabled status button
    newButtons.push(
      new ButtonBuilder()
        .setCustomId("seerr_action_done")
        .setLabel(label)
        .setStyle(isApprove ? ButtonStyle.Success : ButtonStyle.Danger)
        .setDisabled(true)
    );

    // Keep link buttons from the original row
    if (originalRow) {
      for (const comp of originalRow.components) {
        if (comp.data.style === ButtonStyle.Link) {
          newButtons.push(ButtonBuilder.from(comp));
        }
      }
    }

    await interaction.editReply({
      components: [new ActionRowBuilder().addComponents(newButtons)],
    });

    // Remove from pending map so the status poller doesn't also try to edit it
    removeAdminPendingMsg(requestId);
    logger.info(`[SEERR] ${isApprove ? "✅ Approved" : "❌ Declined"} request ${requestId} by ${username}`);
  } catch (err) {
    logger.error(`[SEERR] Failed to ${isApprove ? "approve" : "decline"} request ${requestId}:`, err.message);
    try {
      await interaction.followUp({
        content: `❌ Failed to ${isApprove ? "approve" : "decline"} request: ${err.message}`,
        flags: 64,
      });
    } catch (followUpErr) {
      logger.debug("[seerrApproveDecline] Follow-up message failed: %s", followUpErr.message);
    }
  }
}
