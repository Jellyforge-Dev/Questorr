/**
 * Questorr – Jellyfin New-Item Poller
 *
 * Periodically polls Jellyfin's /Items API (sorted by DateCreated descending)
 * and sends Discord notifications for newly added movies, series, seasons, and
 * episodes — even if they were NOT requested via Seerr.
 *
 * How it works:
 *   1. On start: performs a silent "seed poll" that records all currently visible
 *      items as already seen. No notifications are sent for existing content.
 *   2. On each subsequent poll: fetches the latest items and notifies for any
 *      whose Jellyfin ID has not been seen before.
 *   3. Cross-webhook dedup: if the Seerr webhook already sent a MEDIA_AVAILABLE
 *      notification for a TMDB ID in the last 30 minutes, the poller skips it.
 *
 * Configuration:
 *   JELLYFIN_POLL_INTERVAL_SECONDS  (default: 300 = 5 min, 0 = disabled)
 *   JELLYFIN_NOTIFY_MOVIES          "true" / "false"
 *   JELLYFIN_NOTIFY_SERIES          "true" / "false"
 *   JELLYFIN_NOTIFY_SEASONS         "true" / "false"
 *   JELLYFIN_NOTIFY_EPISODES        "true" / "false"
 *   JELLYFIN_NOTIFICATION_LIBRARIES { libraryId: channelId, … }
 *   JELLYFIN_CHANNEL_ID             fallback channel when no library mapping matches
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import path from "path";
import axios from "axios";
import {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import logger from "../utils/logger.js";
import { isValidUrl } from "../utils/url.js";
import { wasRecentlyNotified } from "../utils/notifyDedup.js";
// Round 12: pendingRequests is populated by the Questorr/Seerr request paths
// (requestButton.js, randomRequestButton.js, commands/search.js). The poller
// reads it to recognize "this title was requested via Questorr" and skip the
// duplicate "Neu in Jellyfin" post — the Seerr MEDIA_AVAILABLE webhook will
// send the proper "Now Available!" notification with the "In Seerr ansehen"
// button and DM the requester.
import { pendingRequests } from "./botState.js";
import { deduplicator, SEED_MARKER } from "../jellyfin/libraryResolver.js";
import {
  fetchLibraryMap,
  getLibraryChannels,
  resolveConfigLibraryId,
  resolveTargetChannel,
} from "../jellyfin/libraryResolver.js";
import { findLibraryByAncestors, fetchLatestAdditions, fetchItemsAddedSince, scanAllItemsForUnseen, seedAllItemIds, fetchItemDetails } from "../api/jellyfin.js";
import { findBestBackdrop } from "../api/tmdb.js";
import { CONFIG_PATH } from "../utils/configFile.js";

// ─── State ────────────────────────────────────────────────────────────────────

let pollerTimer = null;
let initialized = false;
let savedClient = null;
let savedApiKey = null;
let savedBaseUrl = null;

// Round 8: full-library-scan state for the dashboard "Jetzt prüfen" button.
// The scan runs async (fire-and-forget) so the HTTP request returns immediately;
// the dashboard polls /jellyfin/poller-status to watch the progress counters.
let _fullScanInProgress = false;
let _fullScanProgress = null;  // { scanned, newFound, startedAt, hitCap, finishedAt? }

// Stats exposed via getPollerStatus() for the dashboard.
const pollerStats = {
  lastPollAt: null,            // ISO string
  lastPollDurationMs: null,
  lastPollFetchedCount: 0,     // items fetched in most-recent poll
  lastPollNewCount: 0,         // truly-new items in most-recent poll
  totalPolls: 0,
  totalNewItemsAllTime: 0,
};

// ─── Seen-set persistence ─────────────────────────────────────────────────────

const SEEN_ITEMS_FILE = path.join(path.dirname(CONFIG_PATH), "seen-items.json");
// If the saved file is older than this, treat it as stale and do a fresh seed.
// Must be >= CLEANUP_AGE_MS in libraryResolver.js (90 days) so we never
// discard a valid seen-set just because it was saved "too long ago".
const SEEN_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

function loadSeenItems() {
  try {
    if (!existsSync(SEEN_ITEMS_FILE)) return null;
    const data = JSON.parse(readFileSync(SEEN_ITEMS_FILE, "utf-8"));
    if (!data.savedAt || Date.now() - data.savedAt > SEEN_MAX_AGE_MS) return null;
    return new Map(data.items); // [[id, timestamp], ...]
  } catch {
    return null;
  }
}

function saveSeenItems() {
  try {
    const items = [...deduplicator.seenItems.entries()];
    const tmp = SEEN_ITEMS_FILE + ".tmp";
    writeFileSync(tmp, JSON.stringify({ savedAt: Date.now(), items }), "utf-8");
    renameSync(tmp, SEEN_ITEMS_FILE);
  } catch (err) {
    logger.warn(`[Jellyfin Poller] Could not save seen-items: ${err.message}`);
  }
}

// ─── Type config ──────────────────────────────────────────────────────────────

const TYPE_SETTINGS = {
  Movie:   { envKey: "JELLYFIN_NOTIFY_MOVIES",   emoji: "🎬", color: "#1ec8a0", label: "Film" },
  Series:  { envKey: "JELLYFIN_NOTIFY_SERIES",    emoji: "📺", color: "#1ec8a0", label: "Serie" },
  Season:  { envKey: "JELLYFIN_NOTIFY_SEASONS",   emoji: "📀", color: "#17b8c4", label: "Staffel" },
  Episode: { envKey: "JELLYFIN_NOTIFY_EPISODES",  emoji: "▶️",  color: "#17b8c4", label: "Episode" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTmdbLanguage() {
  const lang = (process.env.BOT_LANGUAGE || "en").toLowerCase().split("-")[0];
  const map = { de: "de-DE", en: "en-US", sv: "sv-SE", fr: "fr-FR", es: "es-ES", pt: "pt-BR", nl: "nl-NL", it: "it-IT", pl: "pl-PL", ru: "ru-RU" };
  return map[lang] || "en-US";
}

function getDateLocale() {
  const lang = (process.env.BOT_LANGUAGE || "en").toLowerCase().split("-")[0];
  const map = { de: "de-DE", en: "en-US", sv: "sv-SE", fr: "fr-FR", es: "es-ES", pt: "pt-BR", nl: "nl-NL", it: "it-IT", pl: "pl-PL", ru: "ru-RU" };
  return map[lang] || "en-US";
}

/**
 * Round 10: Returns true if the item's DateCreated is within the configured
 * "Recently Added" window (default 7 days, env JELLYFIN_RECENT_ADDED_DAYS).
 *
 * This is the SAFETY NET that prevents accidentally spamming Discord with
 * notifications for old library content — even if the seen-items.json is
 * deleted or corrupted, or if a full-scan finds items the seed never tracked,
 * items with DateCreated older than the window are NEVER notified.
 *
 * Set JELLYFIN_RECENT_ADDED_DAYS=0 to disable this filter entirely
 * (power-user mode for one-shot rescans of older content).
 */
function isWithinRecentlyAddedWindow(item) {
  const days = parseInt(process.env.JELLYFIN_RECENT_ADDED_DAYS ?? "7", 10);
  if (!Number.isFinite(days) || days <= 0) return true;  // 0 = no filter (disabled)
  if (!item || !item.DateCreated) return false;          // no date → can't verify → safer to skip
  const itemTs = new Date(item.DateCreated).getTime();
  if (Number.isNaN(itemTs)) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return itemTs >= cutoff;
}

// Round 11: track the last time we asked Jellyfin to refresh its library so
// we don't hammer the endpoint when poll cycles run close together (e.g. user
// triggers a manual poll right after a scheduled one).
let _lastLibraryScanTrigger = 0;
const LIBRARY_SCAN_THROTTLE_MS = 60 * 1000;

/**
 * Round 11: Ask Jellyfin to scan its library NOW.
 *
 * Without this, Jellyfin only indexes new files when its own scheduled task
 * runs (typically hourly or nightly) — which means a file added at 16:00 may
 * not appear in Jellyfin's API until 00:00, and Questorr's poller can't
 * notify Discord for content Jellyfin doesn't know about yet.
 *
 * POST /Library/Refresh is built-in Jellyfin API — no plugin required. The
 * call kicks off an async, differential scan; Jellyfin returns immediately
 * and we don't block on it. Throttled to once per 60s to avoid spam if the
 * caller invokes poll() repeatedly.
 *
 * Controlled by JELLYFIN_AUTO_REFRESH ("true"/"false", default true).
 */
async function triggerJellyfinLibraryScan(apiKey, baseUrl) {
  if (process.env.JELLYFIN_AUTO_REFRESH === "false") return;
  if (Date.now() - _lastLibraryScanTrigger < LIBRARY_SCAN_THROTTLE_MS) return;
  try {
    const url = `${baseUrl.replace(/\/$/, "")}/Library/Refresh`;
    await axios.post(url, null, {
      headers: { "X-MediaBrowser-Token": apiKey },
      timeout: 5000,
    });
    _lastLibraryScanTrigger = Date.now();
    logger.debug("[Jellyfin Poller] Triggered Jellyfin library scan (POST /Library/Refresh)");
  } catch (e) {
    // Non-fatal: log at debug level so it doesn't spam error logs if Jellyfin
    // is briefly unreachable. The next poll cycle retries.
    logger.debug(`[Jellyfin Poller] Library scan trigger failed (non-fatal): ${e?.message || e}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function startJellyfinPoller(client) {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
  }
  initialized = false;

  const intervalSec = parseInt(process.env.JELLYFIN_POLL_INTERVAL_SECONDS ?? "300", 10);
  if (isNaN(intervalSec) || intervalSec <= 0) {
    logger.info("[Jellyfin Poller] Disabled (JELLYFIN_POLL_INTERVAL_SECONDS=0)");
    return;
  }

  const apiKey  = process.env.JELLYFIN_API_KEY;
  const baseUrl = process.env.JELLYFIN_BASE_URL;
  if (!apiKey || !baseUrl) {
    logger.info("[Jellyfin Poller] Jellyfin not configured – poller not started");
    return;
  }

  // Save for manual trigger via getPollerStatus()/triggerManualPoll()
  savedClient = client;
  savedApiKey = apiKey;
  savedBaseUrl = baseUrl;

  logger.info(`[Jellyfin Poller] Starting – polling every ${intervalSec}s`);

  seedPoll(apiKey, baseUrl).then(() => {
    initialized = true;
    logger.info("[Jellyfin Poller] ✅ Seed poll complete – watching for new items");
    pollerTimer = setInterval(() => poll(client, apiKey, baseUrl), intervalSec * 1000);
  }).catch((err) => {
    logger.error("[Jellyfin Poller] Seed poll failed:", err.message);
    initialized = true;
    pollerTimer = setInterval(() => poll(client, apiKey, baseUrl), intervalSec * 1000);
  });
}

export function stopJellyfinPoller() {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
  }
  initialized = false;
  saveSeenItems();
  logger.info("[Jellyfin Poller] Stopped");
}

// ─── Seed & Poll ──────────────────────────────────────────────────────────────

/**
 * Fetch current items and mark them as seen – no Discord notification.
 * Prevents flooding when the bot starts or restarts.
 * If a recent seen-items file exists on disk, restores from it instead of
 * re-seeding — so items added just before a restart are still detected.
 */
async function seedPoll(apiKey, baseUrl) {
  const stored = loadSeenItems();
  if (stored) {
    for (const [id, ts] of stored) deduplicator.seenItems.set(id, ts);
    logger.info(`[Jellyfin Poller] Restored ${stored.size} seen items from disk (skipping reseed)`);

    // Round 9 migration: a pre-Round-9 seen-items.json has NO SEED_MARKER (all
    // timestamps are real Date.now() from when the seed ran). Detect this and
    // re-mark the bulk-seeded entries so the "Verpasste Items finden" rescan
    // button can find pre-existing items the user never got notifications for.
    //
    // Heuristic: if >90% of entries share the same minute-bucket (i.e. they
    // were all written within one minute = clearly a bulk seed), assume the
    // whole file is a seed and re-mark every entry to SEED_MARKER.
    try {
      const total = deduplicator.seenItems.size;
      if (total > 100) {  // skip for tiny histories where heuristic is noisy
        const bucketCounts = new Map();
        let alreadyHasSeedMarker = false;
        for (const ts of deduplicator.seenItems.values()) {
          if (ts === SEED_MARKER) { alreadyHasSeedMarker = true; break; }
          const bucket = Math.floor(ts / 60_000);  // minute bucket
          bucketCounts.set(bucket, (bucketCounts.get(bucket) || 0) + 1);
        }
        if (!alreadyHasSeedMarker) {
          const maxBucket = Math.max(...bucketCounts.values());
          if (maxBucket / total > 0.9) {
            logger.info(`[Jellyfin Poller] Migration: ${maxBucket}/${total} (${Math.round(maxBucket / total * 100)}%) entries in one minute-bucket — treating as bulk seed, re-marking all as SEED_MARKER`);
            for (const id of deduplicator.seenItems.keys()) {
              deduplicator.seenItems.set(id, SEED_MARKER);
            }
            saveSeenItems();
          }
        }
      }
    } catch (e) {
      logger.warn(`[Jellyfin Poller] Seed-marker migration check failed: ${e.message}`);
    }

    return;
  }

  try {
    const total = await seedAllItemIds(apiKey, baseUrl, (items) => {
      for (const item of items) deduplicator.checkAndRecord(item.Id, { seedMode: true });
    });
    logger.info(`[Jellyfin Poller] Seeded ${total} items as already seen (no notifications, marked as SEED for future rescan)`);
  } catch (err) {
    logger.warn(`[Jellyfin Poller] Full seed failed (${err.message}) – falling back to top-100 seed`);
    const items = await fetchLatestAdditions(apiKey, baseUrl, 100, "all");
    for (const item of items) deduplicator.checkAndRecord(item.Id, { seedMode: true });
    logger.info(`[Jellyfin Poller] Seeded ${items.length} items (fallback, no notifications, marked as SEED)`);
  }

  saveSeenItems();
}

/**
 * Regular poll: fetch recent items, find truly new ones, notify.
 */
async function poll(client, apiKey, baseUrl) {
  if (!initialized) return;
  if (!client || !client.isReady()) {
    logger.debug("[Jellyfin Poller] Bot not ready – skipping poll");
    return;
  }

  const pollStartedAt = Date.now();
  try {
    // Trigger Jellyfin's own library scan before querying items, so newly added
    // filesystem content is indexed before we ask for "recently added". This
    // eliminates the need for a Jellyfin webhook plugin. Throttled to once per 60s.
    await triggerJellyfinLibraryScan(apiKey, baseUrl);

    // Paginate up to 5×200 = 1000 items by DateCreated descending. Catches new items
    // pushed past the top 200 by mass-imports (e.g. a freshly scanned series with
    // hundreds of episodes). Files imported with old mtimes are NOT caught here —
    // those are found by the dashboard "Jetzt prüfen" full-scan path instead.
    const items = await fetchItemsAddedSince(apiKey, baseUrl, { maxPages: 5 });

    // Diagnostic: log fetch summary so we can see WHY new items might not appear.
    if (items.length > 0) {
      const oldest = items[items.length - 1];
      const oldestDate = oldest.DateCreated || "n/a";
      const typeCount = items.reduce((acc, it) => {
        acc[it.Type] = (acc[it.Type] || 0) + 1;
        return acc;
      }, {});
      const typeStr = Object.entries(typeCount).map(([t, n]) => `${t}=${n}`).join(", ");
      logger.debug(
        `[Jellyfin Poller] Fetch summary: ${items.length} items (${typeStr}); oldest DateCreated in batch: ${oldestDate} ("${oldest.Name}")`
      );
      for (const item of items.slice(0, 3)) {
        logger.debug(
          `[Jellyfin Poller] Top: "${item.Name}" (${item.Type}, DateCreated=${item.DateCreated || "n/a"}, Id=${item.Id})`
        );
      }
    }

    const newItems = [];
    let outsideWindowCount = 0;
    for (const item of items) {
      if (deduplicator.checkAndRecord(item.Id)) {
        logger.debug(`[Jellyfin Poller] Already seen: "${item.Name}" (${item.Id})`);
        continue;
      }
      // Round 10: only notify items in Jellyfin's "Recently Added" window.
      // Items older than JELLYFIN_RECENT_ADDED_DAYS (default 7) are silently
      // skipped — prevents legacy library content from being notified.
      if (!isWithinRecentlyAddedWindow(item)) {
        outsideWindowCount++;
        logger.debug(`[Jellyfin Poller] Outside Recently-Added window: "${item.Name}" (DateCreated=${item.DateCreated})`);
        continue;
      }
      newItems.push(item);
    }

    const windowDays = process.env.JELLYFIN_RECENT_ADDED_DAYS ?? "7";
    logger.debug(`[Jellyfin Poller] Poll: ${items.length} fetched, ${newItems.length} new, ${outsideWindowCount} outside Recently-Added window (${windowDays} days)`);

    // Update stats for the dashboard
    pollerStats.lastPollAt = new Date(pollStartedAt).toISOString();
    pollerStats.lastPollDurationMs = Date.now() - pollStartedAt;
    pollerStats.lastPollFetchedCount = items.length;
    pollerStats.lastPollNewCount = newItems.length;
    pollerStats.totalPolls += 1;
    pollerStats.totalNewItemsAllTime += newItems.length;

    deduplicator.cleanup();
    saveSeenItems();

    if (newItems.length === 0) return { fetched: items.length, new: 0 };

    logger.info(`[Jellyfin Poller] Found ${newItems.length} new item(s)`);
    await notifyBatch(client, newItems, apiKey, baseUrl);

    // Round 9: new items mean the library counts changed — invalidate the
    // dashboard's library stats cache so the next /stats/insights call fetches
    // live data instead of stale 5-min cache.
    try {
      const { invalidateLibraryCache } = await import("../routes/botRoutes.js");
      invalidateLibraryCache();
    } catch { /* not critical — the cache will refresh on its own TTL */ }

    return { fetched: items.length, new: newItems.length };
  } catch (err) {
    logger.error("[Jellyfin Poller] Poll error:", err.message);
    pollerStats.lastPollAt = new Date(pollStartedAt).toISOString();
    pollerStats.lastPollDurationMs = Date.now() - pollStartedAt;
    throw err;
  }
}

// ─── Status / manual trigger (used by /api/jellyfin/poller-* endpoints) ────────

/** Snapshot of the poller's current state for the dashboard. */
export function getPollerStatus() {
  const intervalSec = parseInt(process.env.JELLYFIN_POLL_INTERVAL_SECONDS ?? "300", 10);
  const enabled = !isNaN(intervalSec) && intervalSec > 0;
  const running = !!pollerTimer;
  const lastPollAgoSeconds = pollerStats.lastPollAt
    ? Math.floor((Date.now() - new Date(pollerStats.lastPollAt).getTime()) / 1000)
    : null;
  return {
    enabled,
    running,
    initialized,
    intervalSeconds: enabled ? intervalSec : 0,
    lastPollAt: pollerStats.lastPollAt,
    lastPollAgoSeconds,
    lastPollDurationMs: pollerStats.lastPollDurationMs,
    lastPollFetchedCount: pollerStats.lastPollFetchedCount,
    lastPollNewCount: pollerStats.lastPollNewCount,
    totalPolls: pollerStats.totalPolls,
    totalNewItemsAllTime: pollerStats.totalNewItemsAllTime,
    totalItemsTracked: deduplicator?.seenItems?.size ?? 0,
    // Round 8: live progress info for the dashboard "Jetzt prüfen" full-scan
    fullScanInProgress: _fullScanInProgress,
    fullScanProgress: _fullScanProgress,
  };
}

/**
 * Manually trigger a poll cycle.
 *
 * @param {{ mode?: "fast"|"full", limit?: number }} [opts]
 *   - "fast" (default): same top-1000-by-DateCreated as the periodic poll. Sync — returns { fetched, new }.
 *   - "full" (dashboard "Jetzt prüfen"): exhaustive library scan, skips items already in seenIds.
 *     Fire-and-forget. Catches recently-added items that fall outside the top-1000 (e.g. files with
 *     old mtimes). Returns { started: true } immediately; progress in getPollerStatus().fullScanProgress.
 *
 *   Round 10 NOTE: the legacy "rescan" mode (re-evaluating SEED_MARKER items) has been REMOVED.
 *   Instead, all notification paths now filter by the JELLYFIN_RECENT_ADDED_DAYS window — so old
 *   library content can never be accidentally notified, regardless of seenIds state. The
 *   `mode === "rescan"` input is silently mapped to "full" for backward compatibility with old
 *   UI builds; users who genuinely want to rescan pre-existing items can set
 *   JELLYFIN_RECENT_ADDED_DAYS=0 (env) and click "Jetzt prüfen" — that's the power-user path.
 */
export async function triggerManualPoll(opts = {}) {
  let { mode = "fast", limit = 50 } = opts;
  if (!savedClient || !savedApiKey || !savedBaseUrl) {
    throw new Error("Poller not initialized — start the bot and ensure Jellyfin is configured.");
  }
  if (!initialized) {
    throw new Error("Seed poll has not completed yet — please wait a moment and try again.");
  }

  // Round 10: legacy "rescan" → silently map to "full" so old UI builds don't break.
  if (mode === "rescan") {
    logger.info(`[Jellyfin Poller] Rescan mode is deprecated — using full scan with Recently-Added filter (set JELLYFIN_RECENT_ADDED_DAYS=0 to scan older items)`);
    mode = "full";
  }

  if (mode === "full") {
    if (_fullScanInProgress) {
      return { started: false, reason: "full scan already in progress", progress: _fullScanProgress };
    }
    _fullScanInProgress = true;
    _fullScanProgress = { mode, scanned: 0, newFound: 0, startedAt: Date.now(), hitCap: false, finishedAt: null };

    // Build the "skip set" — all entries already known (SEED_MARKER + truly notified).
    // Round 10: we no longer differentiate; all seen-IDs are skipped equally. The
    // Recently-Added window filter (applied later) is what guarantees we don't spam.
    const skipIds = new Set();
    let seedCount = 0;
    let trulySeenCount = 0;
    for (const [id, ts] of deduplicator.seenItems) {
      if (ts === SEED_MARKER) seedCount++; else trulySeenCount++;
      skipIds.add(id);
    }

    logger.info(`[Jellyfin Poller] Manual trigger: full library scan starting — skipping ${skipIds.size} known items (${trulySeenCount} truly-notified, ${seedCount} seed-marked). Recently-Added window: ${process.env.JELLYFIN_RECENT_ADDED_DAYS ?? "7"} days.`);

    // Fire-and-forget — HTTP response returns immediately so the dashboard can poll progress.
    (async () => {
      try {
        // Round 10: pass minDateCreated so scanAllItemsForUnseen can early-stop once
        // it hits items older than the Recently-Added window (items sorted DESC by DateCreated).
        const recentDays = parseInt(process.env.JELLYFIN_RECENT_ADDED_DAYS ?? "7", 10);
        const minDateCreated = (Number.isFinite(recentDays) && recentDays > 0)
          ? Date.now() - recentDays * 24 * 60 * 60 * 1000
          : null;

        const { newItems: rawNew, totalScanned, hitCap, hitDateCutoff } = await scanAllItemsForUnseen(
          savedApiKey, savedBaseUrl, skipIds, limit,
          (scanned, newCount) => {
            _fullScanProgress.scanned = scanned;
            _fullScanProgress.newFound = newCount;
          },
          { minDateCreated }
        );

        // Round 10: split into kept (within window) and dropped (too old).
        // - Kept items: notified + marked seen.
        // - Dropped items: ALSO marked seen so they don't keep showing up on subsequent
        //   "Jetzt prüfen" clicks (wasteful re-scans). They're silently absorbed —
        //   user can re-trigger notifications later by setting JELLYFIN_RECENT_ADDED_DAYS=0
        //   and deleting seen-items.json (power-user path).
        const filtered = [];
        const dropped = [];
        for (const item of rawNew) {
          if (isWithinRecentlyAddedWindow(item)) filtered.push(item);
          else dropped.push(item);
        }
        const windowDays = process.env.JELLYFIN_RECENT_ADDED_DAYS ?? "7";

        _fullScanProgress.scanned = totalScanned;
        _fullScanProgress.newFound = filtered.length;
        _fullScanProgress.hitCap = hitCap;
        logger.info(
          `[Jellyfin Poller] Full scan complete: ${totalScanned} scanned, ${rawNew.length} unseen, ${filtered.length} within Recently-Added window (${dropped.length} dropped as too old, ${windowDays} days)${hitCap ? ` — CAPPED at ${limit}` : ""}${hitDateCutoff ? " — early-stopped at DateCreated cutoff" : ""}`
        );

        for (const item of filtered) deduplicator.markNotified(item.Id);
        for (const item of dropped) deduplicator.markNotified(item.Id);
        saveSeenItems();
        if (filtered.length > 0) {
          await notifyBatch(savedClient, filtered, savedApiKey, savedBaseUrl);
          // Round 9: invalidate library stats cache so the dashboard shows updated counts
          try {
            const { invalidateLibraryCache } = await import("../routes/botRoutes.js");
            invalidateLibraryCache();
          } catch { /* not critical */ }
        }
      } catch (e) {
        logger.error(`[Jellyfin Poller] Full scan failed: ${e?.message || e}`);
      } finally {
        _fullScanProgress.finishedAt = Date.now();
        _fullScanInProgress = false;
      }
    })();

    return { started: true, mode, limit };
  }

  // Default "fast" mode: same path as periodic poll, blocking.
  const result = await poll(savedClient, savedApiKey, savedBaseUrl);
  return result || { fetched: 0, new: 0 };
}

/**
 * Shared notification dispatcher — loads the library map once and notifies each item.
 * Used by both the periodic poll and the manual full-scan.
 */
async function notifyBatch(client, items, apiKey, baseUrl) {
  if (!items || items.length === 0) return;
  const { libraries, libraryIdMap } = await fetchLibraryMap().catch(() => ({ libraries: [], libraryIdMap: new Map() }));
  const libraryMap = new Map();
  for (const lib of libraries) {
    libraryMap.set(lib.CollectionId, lib);
    if (lib.ItemId !== lib.CollectionId) libraryMap.set(lib.ItemId, lib);
  }
  const libraryChannels = getLibraryChannels();

  for (const item of items) {
    await notifyItem(client, item, apiKey, baseUrl, libraryMap, libraryIdMap, libraryChannels).catch((err) =>
      logger.error(`[Jellyfin Poller] Error notifying "${item.Name}": ${err.message}`)
    );
  }
}

// ─── Item Notification ────────────────────────────────────────────────────────

async function notifyItem(client, item, apiKey, baseUrl, libraryMap, libraryIdMap, libraryChannels) {
  const itemType = item.Type;
  const typeSettings = TYPE_SETTINGS[itemType];
  if (!typeSettings) return;

  // Per-type toggle
  if (process.env[typeSettings.envKey] !== "true") {
    logger.debug(`[Jellyfin Poller] Skipping "${item.Name}" – ${typeSettings.envKey} is not "true" (value: "${process.env[typeSettings.envKey]}")`);
    return;
  }

  const tmdbId  = item.ProviderIds?.Tmdb  || item.ProviderIds?.tmdb  || null;
  const tmdbType = itemType === "Movie" ? "movie" : "tv";

  // Round 12: PRIMARY dedup — if this TMDB ID was requested via Questorr/Seerr,
  // skip the poller notification. The Seerr MEDIA_AVAILABLE webhook will send
  // the proper "Now Available!" notification with the Seerr button + DM the
  // requester. This prevents the double-post that became visible after Round 11
  // (faster poll + library-refresh trigger made the poller outpace the webhook).
  if (tmdbId) {
    const requestKey = `${tmdbId}-${tmdbType}`;
    if (pendingRequests.has(requestKey)) {
      logger.info(`[Jellyfin Poller] Skipping "${item.Name}" — pendingRequest exists (requested via Questorr/Seerr; the Seerr MEDIA_AVAILABLE webhook will deliver the "Now Available!" notification)`);
      return;
    }
  }

  // SECONDARY dedup: skip if Seerr already sent MEDIA_AVAILABLE for this TMDB ID
  // (catches the race where pendingRequests was cleared but the webhook just
  // ran moments ago).
  if (tmdbId && wasRecentlyNotified(tmdbType, tmdbId)) {
    logger.debug(`[Jellyfin Poller] Skipping "${item.Name}" – already notified via Seerr webhook`);
    return;
  }

  // If no TMDB ID yet and TMDB API is configured, wait for Jellyfin to finish scanning metadata
  const delaySec = parseInt(process.env.JELLYFIN_POLLER_METADATA_DELAY_SECONDS ?? "60", 10);
  if (!tmdbId && process.env.TMDB_API_KEY && !isNaN(delaySec) && delaySec > 0) {
    logger.info(`[Jellyfin Poller] "${item.Name}" has no TMDB ID yet – waiting ${delaySec}s for metadata scan`);
    setTimeout(async () => {
      const freshItem = await fetchItemDetails(item.Id, apiKey, baseUrl).catch(() => null) || item;
      // Round 10 SAFETY: if the re-fetch somehow stripped the Id (shouldn't happen
      // with the Fields-explicit call, but defensive), preserve it from the original.
      if (freshItem && !freshItem.Id) freshItem.Id = item.Id;
      await doNotify(client, freshItem, apiKey, baseUrl, libraryMap, libraryIdMap, libraryChannels).catch((err) =>
        logger.error(`[Jellyfin Poller] Delayed notify failed for "${item.Name}": ${err.message}`)
      );
    }, delaySec * 1000);
    return;
  }

  await doNotify(client, item, apiKey, baseUrl, libraryMap, libraryIdMap, libraryChannels);
}

async function doNotify(client, item, apiKey, baseUrl, libraryMap, libraryIdMap, libraryChannels) {
  const itemType = item.Type;
  const typeSettings = TYPE_SETTINGS[itemType];
  if (!typeSettings) return;

  const tmdbId  = item.ProviderIds?.Tmdb  || item.ProviderIds?.tmdb  || null;
  const imdbId  = item.ProviderIds?.Imdb  || item.ProviderIds?.imdb  || null;
  const tmdbType = itemType === "Movie" ? "movie" : "tv";

  logger.info(`[Jellyfin Poller] New ${itemType}: "${item.Name}" (TMDB: ${tmdbId || "—"})`);

  // Resolve Discord channel via library mapping
  let channelId = null;

  if (Object.keys(libraryChannels).length > 0) {
    try {
      const rawLibraryId = await findLibraryByAncestors(item.Id, apiKey, baseUrl, libraryMap, itemType);
      if (rawLibraryId) {
        const configLibraryId = resolveConfigLibraryId(rawLibraryId, libraryIdMap);
        channelId = resolveTargetChannel(configLibraryId, libraryChannels);
        if (channelId) {
          logger.info(`[Jellyfin Poller] Library ${configLibraryId} → channel ${channelId}`);
        }
      }
    } catch (err) {
      logger.debug(`[Jellyfin Poller] Library lookup failed for "${item.Name}": ${err.message}`);
    }
  }

  // Fallback channel
  if (!channelId) channelId = process.env.JELLYFIN_CHANNEL_ID || null;

  if (!channelId) {
    logger.debug(`[Jellyfin Poller] No channel for "${item.Name}" – skipping`);
    return;
  }

  const embed   = await buildEmbed(item, itemType, tmdbId, imdbId, tmdbType, typeSettings, baseUrl);
  const buttons = await buildButtons(item, itemType, imdbId, baseUrl);

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    logger.warn(`[Jellyfin Poller] Cannot fetch channel ${channelId}`);
    return;
  }

  const msgOptions = { embeds: [embed] };
  if (buttons) msgOptions.components = [buttons];
  await channel.send(msgOptions);

  logger.info(`[Jellyfin Poller] ✅ Sent notification for "${item.Name}" → channel ${channelId}`);
}

// ─── Embed Builder ────────────────────────────────────────────────────────────

async function buildEmbed(item, itemType, tmdbId, imdbId, tmdbType, typeSettings, baseUrl) {
  const year = item.ProductionYear || null;

  let title = item.Name || "Unbekannter Titel";
  // Round 10: Some Jellyfin items have the year baked into the Name itself
  // (e.g. "Avengers - Endgame (2019)" because the filename had it). If we
  // append ProductionYear blindly we get duplicates like "(2019) (2018)".
  // Skip appending when the title already contains a 4-digit year in parens.
  const yearAlreadyInName = /\(\d{4}\)/.test(title);
  if (year && !yearAlreadyInName) title += ` (${year})`;

  // For Episodes/Seasons: prefix with series name
  if (itemType === "Season" && item.SeriesName) {
    const s = item.IndexNumber != null ? `S${String(item.IndexNumber).padStart(2, "0")}` : "";
    title = `${item.SeriesName}${s ? " – " + s : ""}`;
  } else if (itemType === "Episode" && item.SeriesName) {
    const s = item.ParentIndexNumber != null ? `S${String(item.ParentIndexNumber).padStart(2, "0")}` : "";
    const e = item.IndexNumber != null ? `E${String(item.IndexNumber).padStart(2, "0")}` : "";
    title = `${item.SeriesName} – ${s}${e}: ${item.Name}`;
  }

  const embed = new EmbedBuilder()
    .setColor(typeSettings.color)
    .setAuthor({ name: `${typeSettings.emoji} Neu in Jellyfin` })
    .setTitle(title)
    .setTimestamp();

  const footerText = process.env.EMBED_FOOTER_TEXT;
  if (footerText) embed.setFooter({ text: footerText });

  // Enrich via TMDB
  let tmdbData = null;
  if (tmdbId && process.env.TMDB_API_KEY && (itemType === "Movie" || itemType === "Series")) {
    try {
      const endpoint = tmdbType === "movie"
        ? `https://api.themoviedb.org/3/movie/${tmdbId}`
        : `https://api.themoviedb.org/3/tv/${tmdbId}`;
      const res = await axios.get(endpoint, {
        params: { api_key: process.env.TMDB_API_KEY, language: getTmdbLanguage(), append_to_response: "images" },
        timeout: 8000,
      });
      tmdbData = res.data;
    } catch (_) { /* non-fatal */ }
  }

  if (tmdbData?.poster_path) {
    embed.setThumbnail(`https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`);
  }

  if (tmdbData) {
    const backdrop = findBestBackdrop(tmdbData);
    if (backdrop) embed.setImage(`https://image.tmdb.org/t/p/w1280${backdrop}`);
  }

  let overview = tmdbData?.overview || item.Overview || null;
  if (!overview) {
    // Round 10: ensure the embed always has SOMETHING to show — even when
    // Jellyfin's metadata-scan failed to populate Overview/Genres/etc. (poor
    // filename, missing IMDb/TMDB id). Build a minimal description from
    // whatever fields we *do* have.
    const parts = [];
    if (Array.isArray(item.Genres) && item.Genres.length > 0) {
      parts.push(item.Genres.slice(0, 3).join(", "));
    }
    if (item.DateCreated) {
      try {
        parts.push(`Hinzugefügt: ${new Date(item.DateCreated).toLocaleDateString(getDateLocale())}`);
      } catch { /* invalid date — skip */ }
    }
    if (parts.length > 0) overview = parts.join(" · ");
  }
  if (overview) {
    if (overview.length > 350) overview = overview.substring(0, 347) + "...";
    embed.setDescription(overview);
  }

  const fields = [];
  const genres = tmdbData?.genres?.map((g) => g.name).join(", ")
              || (Array.isArray(item.Genres) ? item.Genres.join(", ") : null);
  if (genres) fields.push({ name: "Genre", value: genres, inline: true });

  const rating = tmdbData?.vote_average ?? item.CommunityRating;
  if (rating) fields.push({ name: "Bewertung", value: `⭐ ${Number(rating).toFixed(1)}/10`, inline: true });

  if (fields.length > 0) embed.addFields(...fields);

  return embed;
}

// ─── Button Builder ───────────────────────────────────────────────────────────

async function buildButtons(item, itemType, imdbId, baseUrl) {
  const components = [];
  const serverId = process.env.JELLYFIN_SERVER_ID || "";
  const jfBase = (baseUrl || "").replace(/\/$/, "");

  // Read button visibility from the central per-event matrix (NOTIF_BUTTONS_MEDIA_AVAILABLE).
  // Legacy JELLYFIN_POLLER_SHOW_BUTTON_* keys are kept as overrides for backward compat:
  // if they are explicitly set, they take priority over the matrix value.
  let showWatch, showImdb, showLetterboxd;
  try {
    const { getEventButtons } = await import("../seerrWebhook.js");
    const btns = getEventButtons("MEDIA_AVAILABLE", "CHANNEL");
    showWatch      = process.env.JELLYFIN_POLLER_SHOW_BUTTON_WATCH      !== undefined
                       ? process.env.JELLYFIN_POLLER_SHOW_BUTTON_WATCH !== "false"
                       : btns.showWatch;
    showImdb       = process.env.JELLYFIN_POLLER_SHOW_BUTTON_IMDB       !== undefined
                       ? process.env.JELLYFIN_POLLER_SHOW_BUTTON_IMDB !== "false"
                       : btns.showImdb;
    showLetterboxd = process.env.JELLYFIN_POLLER_SHOW_BUTTON_LETTERBOXD !== undefined
                       ? process.env.JELLYFIN_POLLER_SHOW_BUTTON_LETTERBOXD !== "false"
                       : btns.showLetterboxd;
  } catch {
    // Fallback to global toggles if import fails
    showWatch      = process.env.EMBED_SHOW_BUTTON_WATCH       !== "false";
    showImdb       = process.env.EMBED_SHOW_BUTTON_IMDB        !== "false";
    showLetterboxd = process.env.EMBED_SHOW_BUTTON_LETTERBOXD  !== "false";
  }

  if (showWatch && jfBase && item.Id) {
    const watchUrl = `${jfBase}/web/index.html#!/details?id=${item.Id}&serverId=${serverId}`;
    if (isValidUrl(watchUrl)) {
      components.push(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Jetzt ansehen").setURL(watchUrl)
      );
    }
  }

  if (showImdb && imdbId) {
    const imdbUrl = `https://www.imdb.com/title/${imdbId}/`;
    if (isValidUrl(imdbUrl)) {
      components.push(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("IMDb").setURL(imdbUrl)
      );
    }
  }

  if (showLetterboxd && imdbId && itemType === "Movie") {
    const lboxdUrl = `https://letterboxd.com/imdb/${imdbId}`;
    if (isValidUrl(lboxdUrl)) {
      components.push(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Letterboxd").setURL(lboxdUrl)
      );
    }
  }

  if (components.length === 0) return null;
  return new ActionRowBuilder().addComponents(components);
}
