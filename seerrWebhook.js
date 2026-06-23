/**
 * Questorr – Seerr Webhook Handler
 *
 * Receives webhook events from Jellyseerr and sends rich Discord embeds.
 * Supported events:
 *   MEDIA_PENDING, MEDIA_APPROVED, MEDIA_AUTO_APPROVED,
 *   MEDIA_AVAILABLE, MEDIA_DECLINED, MEDIA_FAILED,
 *   ISSUE_CREATED, ISSUE_COMMENT, ISSUE_RESOLVED, ISSUE_REOPENED,
 *   TEST_NOTIFICATION
 *
 * Channel routing priority:
 *   1. Root-folder → channel mapping  (SEERR_ROOT_FOLDER_CHANNELS)
 *   2. Jellyfin library → channel mapping (JELLYFIN_NOTIFICATION_LIBRARIES)
 *      matched via TMDB ID lookup against Jellyfin library
 *   3. Media-type → channel mapping (CHANNEL_MOVIES / CHANNEL_SERIES)
 *   4. SEERR_CHANNEL_ID
 *   5. JELLYFIN_CHANNEL_ID
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import path from "path";
import { t, tNotif } from "./utils/botStrings.js";
import { markNotified } from "./utils/notifyDedup.js";
import { shouldPost, markPosted } from "./utils/notificationDispatcher.js";
// Round 12: clean up pendingRequests entries after MEDIA_AVAILABLE so the map
// (which doubles as the poller's "via Questorr" dedup source) doesn't grow
// unbounded over time.
import { pendingRequests, savePendingRequests } from "./bot/botState.js";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import axios from "axios";
import logger from "./utils/logger.js";
import { isValidUrl } from "./utils/url.js";
import { findBestBackdrop, getTmdbLanguage } from "./api/tmdb.js";
import { CONFIG_PATH } from "./utils/configFile.js";

// ─── Admin Pending Messages persistence ──────────────────────────────────────
// Maps requestId → { channelId, messageId } so the status poller can edit the
// admin embed when Seerr approves/declines from its own UI.

const ADMIN_PENDING_MSGS_PATH = path.join(
  path.dirname(CONFIG_PATH),
  "admin-pending-messages.json"
);

// In-memory map; loaded once on first use
let _adminPendingMsgs = null;

function loadAdminPendingMsgs() {
  if (_adminPendingMsgs) return _adminPendingMsgs;
  try {
    if (existsSync(ADMIN_PENDING_MSGS_PATH)) {
      _adminPendingMsgs = JSON.parse(readFileSync(ADMIN_PENDING_MSGS_PATH, "utf-8"));
    } else {
      _adminPendingMsgs = {};
    }
  } catch {
    _adminPendingMsgs = {};
  }
  return _adminPendingMsgs;
}

function saveAdminPendingMsgs() {
  try {
    const tmp = ADMIN_PENDING_MSGS_PATH + ".tmp";
    writeFileSync(tmp, JSON.stringify(_adminPendingMsgs, null, 2), "utf-8");
    renameSync(tmp, ADMIN_PENDING_MSGS_PATH);
  } catch (err) {
    logger.warn(`[SEERR WEBHOOK] Could not save admin-pending-messages: ${err.message}`);
  }
}

export function recordAdminPendingMsg(requestId, channelId, messageId) {
  const map = loadAdminPendingMsgs();
  map[String(requestId)] = { channelId, messageId };
  saveAdminPendingMsgs();
}

export function getAdminPendingMsg(requestId) {
  return loadAdminPendingMsgs()[String(requestId)] || null;
}

export function removeAdminPendingMsg(requestId) {
  const map = loadAdminPendingMsgs();
  if (map[String(requestId)]) {
    delete map[String(requestId)];
    saveAdminPendingMsgs();
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const EVENT_CONFIG = {
  MEDIA_PENDING: {
    emoji: "⏳",
    label: tNotif("event_pending",       "NOTIF_TITLE_MEDIA_PENDING"),
    color: "#f9e2af",
    adminOnly: true,
  },
  MEDIA_APPROVED: {
    emoji: "✅",
    label: tNotif("event_approved",       "NOTIF_TITLE_MEDIA_APPROVED"),
    color: "#2eb87e",
    adminOnly: false,
  },
  MEDIA_AUTO_APPROVED: {
    emoji: "⚡",
    label: tNotif("event_auto_approved",  "NOTIF_TITLE_MEDIA_AUTO_APPROVED"),
    color: "#2eb87e",
    adminOnly: false,
  },
  MEDIA_AVAILABLE: {
    emoji: "🎉",
    label: tNotif("event_available",      "NOTIF_TITLE_MEDIA_AVAILABLE"),
    color: "#1ec8a0",
    adminOnly: false,
  },
  MEDIA_DECLINED: {
    emoji: "❌",
    label: tNotif("event_declined",       "NOTIF_TITLE_MEDIA_DECLINED"),
    color: "#f38ba8",
    adminOnly: false,
  },
  MEDIA_FAILED: {
    emoji: "💥",
    label: tNotif("event_failed",         "NOTIF_TITLE_MEDIA_FAILED"),
    color: "#f38ba8",
    adminOnly: true,
  },
  ISSUE_CREATED: {
    emoji: "🐛",
    label: tNotif("event_issue_created",  "NOTIF_TITLE_ISSUE_CREATED"),
    color: "#ef9f76",
    adminOnly: false,
  },
  ISSUE_COMMENT: {
    emoji: "💬",
    label: tNotif("event_issue_comment",  "NOTIF_TITLE_ISSUE_COMMENT"),
    color: "#89b4fa",
    adminOnly: false,
  },
  ISSUE_RESOLVED: {
    emoji: "✔️",
    label: tNotif("event_issue_resolved", "NOTIF_TITLE_ISSUE_RESOLVED"),
    color: "#2eb87e",
    adminOnly: false,
  },
  ISSUE_REOPENED: {
    emoji: "🔄",
    label: tNotif("event_issue_reopened", "NOTIF_TITLE_ISSUE_REOPENED"),
    color: "#ef9f76",
    adminOnly: false,
  },
  TEST_NOTIFICATION: {
    emoji: "🔔",
    label: tNotif("event_test",           "NOTIF_TITLE_TEST"),
    color: "#89b4fa",
    adminOnly: false,
  },
};

// TMDB cache
const tmdbCache = new Map();
const TMDB_CACHE_TTL = 6 * 60 * 60 * 1000;

// Webhook deduplication — Seerr occasionally fires retries or duplicate webhooks
// for the same event within milliseconds (observed: two MEDIA_AVAILABLE for the
// same TMDB ID in the same second). Without dedup, the bot posts the embed twice.
const recentWebhookEvents = new Map(); // key = `${eventType}|${mediaType}|${tmdbId}` → expiresAt
const WEBHOOK_DEDUP_WINDOW_MS = 30_000;

// Events for which we fetch rootFolder from the Seerr API when the webhook payload
// doesn't carry it. MEDIA_PENDING is excluded — it goes to the admin channel via a
// separate path, and Seerr hasn't assigned a rootFolder before approval anyway.
const ROOTFOLDER_RELEVANT_EVENTS = new Set([
  "MEDIA_APPROVED",
  "MEDIA_AUTO_APPROVED",
  "MEDIA_AVAILABLE",
  "MEDIA_FAILED",
]);

function isDuplicateWebhookEvent(eventType, mediaType, tmdbId) {
  if (!eventType || !tmdbId) return false; // payload without identity → never dedup (e.g. TEST_NOTIFICATION)
  const now = Date.now();
  // Lazy cleanup of expired entries
  for (const [k, exp] of recentWebhookEvents) {
    if (exp < now) recentWebhookEvents.delete(k);
  }
  const key = `${eventType}|${mediaType || "?"}|${tmdbId}`;
  const expiresAt = recentWebhookEvents.get(key);
  if (expiresAt && expiresAt > now) return true;
  recentWebhookEvents.set(key, now + WEBHOOK_DEDUP_WINDOW_MS);
  return false;
}

// ─── Channel Resolution ───────────────────────────────────────────────────────

/**
 * Resolve target Discord channel.
 * Priority:
 *   1. Root-folder mapping
 *   2. Jellyfin library mapping (looked up via TMDB ID → Jellyfin item)
 *   3. SEERR_CHANNEL_ID
 *   4. JELLYFIN_CHANNEL_ID
 */

/**
 * Look up the root folder for a media item from Seerr API.
 * Seerr doesn't always include rootFolder in MEDIA_AVAILABLE webhooks.
 *
 * Strategy: use the targeted media endpoint (/movie/{id} or /tv/{id}) which
 * returns all requests for that TMDB ID with their rootFolders — more reliable
 * than the paginated /request list (which caps at 20 results and can miss older
 * requests). Returns null if the media has no Seerr request (e.g. manually
 * marked as available without a prior request), in which case the Jellyfin
 * library lookup in resolveChannel handles routing instead.
 */
async function fetchRootFolderFromSeerr(tmdbId, mediaType, requestId = null) {
  const seerrUrl = process.env.SEERR_URL;
  const seerrApiKey = process.env.SEERR_API_KEY;
  if (!seerrUrl || !seerrApiKey) return null;

  const base = seerrUrl.replace(/\/$/, "");
  const headers = { "X-Api-Key": seerrApiKey };

  try {
    // Primary: use the specific request endpoint if we have a request_id from the
    // webhook payload. This returns the full MediaRequest object — including the
    // rootFolder that Jellyseerr assigns when forwarding the request to Radarr/Sonarr
    // during admin approval (even if Questorr originally omitted it).
    if (requestId) {
      const reqRes = await axios
        .get(`${base}/api/v1/request/${requestId}`, { headers, timeout: 5000 })
        .catch(() => null);
      const directRootFolder = reqRes?.data?.rootFolder;
      logger.debug(
        `[SEERR WEBHOOK] Direct request lookup (id=${requestId}): rootFolder=${directRootFolder ?? "null"}`
      );
      if (directRootFolder) {
        logger.info(
          `[SEERR WEBHOOK] 📁 Root folder from direct request ${requestId}: ${directRootFolder}`
        );
        return directRootFolder;
      }
    }

    // Fallback: query all requests via the TMDB media endpoint. Used when no
    // request_id is available, or when the direct lookup returned null (e.g.
    // Jellyseerr didn't update rootFolder in the request record on approval).
    const endpoint = mediaType === "movie" ? "movie" : "tv";
    const res = await axios
      .get(`${base}/api/v1/${endpoint}/${tmdbId}`, { headers, timeout: 5000 })
      .catch(() => null);

    const reqs = res?.data?.mediaInfo?.requests || [];
    logger.debug(
      `[SEERR WEBHOOK] Media endpoint TMDB ${tmdbId}: mediaInfo.requests has ${reqs.length} item(s), rootFolders=[${reqs.map((r) => r.rootFolder ?? "null").join(", ")}]`
    );
    const rootFolders = reqs.map((r) => r.rootFolder).filter(Boolean);
    if (rootFolders.length > 0) {
      logger.info(
        `[SEERR WEBHOOK] 📁 Root folder from mediaInfo.requests for TMDB ${tmdbId}: ${rootFolders[0]} (${reqs.length} request(s))`
      );
      return rootFolders[0];
    }

    // Tier 3 (Round 8): Jellyseerr's request record can be missing rootFolder
    // when the admin approves without explicitly selecting a path. The downstream
    // Radarr/Sonarr server always knows the actual path though — query it directly.
    // Round 9: Logs upgraded from debug→info so the failure mode is visible.
    try {
      const { fetchArrConnections, fetchMoviePathFromRadarr, fetchSeriesPathFromSonarr } =
        await import("./api/seerr.js");
      const { radarr, sonarr } = await fetchArrConnections(seerrUrl, seerrApiKey);

      if (mediaType === "movie") {
        if (radarr.length === 0) {
          logger.info(`[SEERR WEBHOOK] Tier-3 skipped for TMDB ${tmdbId}: no Radarr servers configured in Jellyseerr`);
        } else {
          logger.info(`[SEERR WEBHOOK] Tier-3: querying ${radarr.length} Radarr server(s) for TMDB ${tmdbId}`);
          for (const srv of radarr) {
            const movie = await fetchMoviePathFromRadarr(srv, tmdbId);
            const folder = movie?.rootFolderPath || movie?.path;
            if (folder) {
              logger.info(
                `[SEERR WEBHOOK] 📁 Root folder from Radarr "${srv.name}" for TMDB ${tmdbId}: ${folder}`
              );
              return folder;
            }
          }
          logger.info(`[SEERR WEBHOOK] Tier-3: TMDB ${tmdbId} not found in any of ${radarr.length} Radarr server(s) — falling through`);
        }
      } else if (mediaType === "tv") {
        if (sonarr.length === 0) {
          logger.info(`[SEERR WEBHOOK] Tier-3 skipped for TMDB ${tmdbId}: no Sonarr servers configured in Jellyseerr`);
        } else {
          // Sonarr indexes by TVDB ID — resolve via TMDB external_ids first.
          const tmdbApiKey = process.env.TMDB_API_KEY;
          let tvdbId = null;
          if (tmdbApiKey) {
            const { tmdbGetExternalTvdb } = await import("./api/tmdb.js");
            tvdbId = await tmdbGetExternalTvdb(tmdbId, tmdbApiKey);
          }
          if (tvdbId) {
            logger.info(`[SEERR WEBHOOK] Tier-3: querying ${sonarr.length} Sonarr server(s) for TVDB ${tvdbId} (TMDB ${tmdbId})`);
            for (const srv of sonarr) {
              const series = await fetchSeriesPathFromSonarr(srv, tvdbId);
              const folder = series?.rootFolderPath || series?.path;
              if (folder) {
                logger.info(
                  `[SEERR WEBHOOK] 📁 Root folder from Sonarr "${srv.name}" for TVDB ${tvdbId} (TMDB ${tmdbId}): ${folder}`
                );
                return folder;
              }
            }
            logger.info(`[SEERR WEBHOOK] Tier-3: TVDB ${tvdbId} not found in any of ${sonarr.length} Sonarr server(s) — falling through`);
          } else {
            logger.info(
              `[SEERR WEBHOOK] Tier-3 Sonarr skipped: could not resolve TVDB ID for TMDB ${tmdbId} (TMDB_API_KEY missing or external_ids empty)`
            );
          }
        }
      }
    } catch (e) {
      logger.warn(`[SEERR WEBHOOK] Tier-3 Radarr/Sonarr fallback errored: ${e.message}`);
    }

    logger.info(
      `[SEERR WEBHOOK] No rootFolder from Seerr/Radarr/Sonarr for TMDB ${tmdbId} (requestId=${requestId ?? "none"}) — falling back to Jellyfin item path / library lookup`
    );
  } catch (e) {
    logger.debug(`[SEERR WEBHOOK] Could not fetch root folder from Seerr: ${e.message}`);
  }
  return null;
}

/**
 * Media-type channel routing.
 * Returns the channel ID for movie or tv, or null if not configured.
 */
export function resolveMediaTypeChannel(mediaType) {
  if (mediaType === "movie" && process.env.CHANNEL_MOVIES) {
    return process.env.CHANNEL_MOVIES;
  }
  if (mediaType === "tv" && process.env.CHANNEL_SERIES) {
    return process.env.CHANNEL_SERIES;
  }
  return null;
}

/**
 * Match a filesystem path against the configured `SEERR_ROOT_FOLDER_CHANNELS`
 * mapping. Returns the matching channel ID or null.
 *
 * Exported so the Tier-3.5 Jellyfin-item-path fallback in `processEvent` can
 * re-use the exact same matching logic without duplicating normalization.
 */
export function matchRootFolderToChannel(rootFolder) {
  if (!rootFolder) return null;
  try {
    const raw = process.env.SEERR_ROOT_FOLDER_CHANNELS;
    const mappings = typeof raw === "object" && raw !== null
      ? raw
      : JSON.parse(raw || "{}");

    const normalizedRoot = String(rootFolder).replace(/\\/g, "/").toLowerCase().replace(/\/$/, "");
    for (const [folder, channelId] of Object.entries(mappings)) {
      const normalizedFolder = String(folder).replace(/\\/g, "/").toLowerCase().replace(/\/$/, "");
      if (normalizedRoot === normalizedFolder || normalizedRoot.startsWith(normalizedFolder + "/")) {
        return channelId;
      }
    }
  } catch (e) {
    logger.warn("[SEERR WEBHOOK] Failed to parse SEERR_ROOT_FOLDER_CHANNELS:", e.message);
  }
  return null;
}

async function resolveChannel(rootFolder, tmdbId, mediaType) {
  // 1. Root-folder mapping. rootFolder may come from the webhook payload directly
  //    OR from the Seerr API fallback in processEvent — both are authoritative.
  if (rootFolder) {
    const channelId = matchRootFolderToChannel(rootFolder);
    if (channelId) {
      logger.info(`[SEERR WEBHOOK] ✅ Root folder "${rootFolder}" → channel ${channelId}`);
      return channelId;
    }
    logger.debug(`[SEERR WEBHOOK] No root folder match for "${rootFolder}"`);
  }

  // 2. Jellyfin library mapping via TMDB ID
  if (tmdbId && mediaType) {
    try {
      const channelId = await resolveChannelViaJellyfin(tmdbId, mediaType);
      if (channelId) return channelId;
    } catch (e) {
      logger.debug("[SEERR WEBHOOK] Jellyfin library lookup failed:", e.message);
    }
  }

  // 3. Media-type routing (movie → CHANNEL_MOVIES, tv → CHANNEL_SERIES)
  if (mediaType) {
    const mediaTypeChannel = resolveMediaTypeChannel(mediaType);
    if (mediaTypeChannel) {
      logger.info(`[SEERR WEBHOOK] ✅ Media type "${mediaType}" → channel ${mediaTypeChannel}`);
      return mediaTypeChannel;
    }
  }

  // 4 & 5. Fallbacks
  const fallback = process.env.SEERR_CHANNEL_ID || process.env.JELLYFIN_CHANNEL_ID;
  if (fallback) logger.debug(`[SEERR WEBHOOK] Using fallback channel: ${fallback}`);
  return fallback || null;
}

/**
 * Find a Jellyfin item by TMDB ID.
 *
 * Strategy (two-pass):
 *   1. AnyProviderIdEquals query — works regardless of library language/title.
 *   2. Title-search fallback — catches items whose TMDB ID is not yet indexed
 *      (e.g. freshly downloaded, metadata scan still running).
 *
 * TMDB data must be fetched before calling this function (tmdbCache must be
 * populated) so we have a title available for the fallback pass.
 */
export async function findVerifiedJellyfinItem(tmdbId, mediaType) {
  const apiKey = process.env.JELLYFIN_API_KEY;
  const baseUrl = process.env.JELLYFIN_BASE_URL;
  if (!apiKey || !baseUrl) return null;

  // ── Pass 1: provider-ID query (language-agnostic) ──────────────────────────
  try {
    const { findItemByTmdbId } = await import("./api/jellyfin.js");
    const itemId = await findItemByTmdbId(tmdbId, mediaType, apiKey, baseUrl);
    if (itemId) {
      logger.info(`[SEERR WEBHOOK] ✅ Found via TMDB-ID query: Jellyfin ID=${itemId} (TMDB ${tmdbId})`);
      return itemId;
    }
    logger.info(`[SEERR WEBHOOK] TMDB-ID query returned nothing for TMDB ${tmdbId} – falling back to title search`);
  } catch (e) {
    logger.warn(`[SEERR WEBHOOK] TMDB-ID query error for ${tmdbId}: ${e.message} – falling back to title search`);
  }

  // ── Pass 2: title search with TMDB-ID verification ────────────────────────
  // Try multiple title variants — Jellyfin may have the localized title (e.g. "Der
  // Medicus II") while TMDB's localized lookup returned the original/English title,
  // or vice versa. Each candidate is searched separately and verified against the
  // TMDB ID, so we never accidentally accept a wrong title with the same name.
  const cached = tmdbCache.get(`${mediaType}-${tmdbId}`);
  const candidates = [
    cached?.data?.title,           // localized (e.g. de-DE)
    cached?.data?.name,            // TV localized
    cached?.data?.original_title,  // production original (Movies)
    cached?.data?.original_name,   // production original (TV)
  ].filter(Boolean).filter((t, i, a) => a.indexOf(t) === i);

  if (candidates.length === 0) {
    logger.warn(`[SEERR WEBHOOK] No TMDB title in cache for ${mediaType}/${tmdbId} – cannot do title-search fallback`);
    return null;
  }

  const base = baseUrl.replace(/\/$/, "");
  const itemType = mediaType === "movie" ? "Movie" : "Series";
  const year = cached?.data?.release_date?.substring(0, 4)
            || cached?.data?.first_air_date?.substring(0, 4);

  let yearMatchFallback = null; // remember first year-only match across all candidates

  for (const title of candidates) {
    logger.info(`[SEERR WEBHOOK] Title-search fallback: "${title}" (TMDB ${tmdbId})`);

    let items;
    try {
      const res = await axios.get(`${base}/Items`, {
        headers: { "X-MediaBrowser-Token": apiKey },
        params: {
          Recursive: true,
          searchTerm: title,
          IncludeItemTypes: itemType,
          Fields: "ProviderIds,Name,ProductionYear",
          Limit: 20,
        },
        timeout: 8000,
      });
      items = res.data?.Items || [];
    } catch (e) {
      logger.warn(`[SEERR WEBHOOK] Title-search error for "${title}": ${e.message}`);
      continue;
    }

    logger.info(`[SEERR WEBHOOK] Title search "${title}" returned ${items.length} results`);

    // Exact TMDB-ID match wins immediately
    for (const item of items) {
      const itemTmdbId = item.ProviderIds?.Tmdb || item.ProviderIds?.tmdb || item.ProviderIds?.TMDB;
      logger.debug(`[SEERR WEBHOOK] Candidate: "${item.Name}" (${item.ProductionYear}) TMDB=${itemTmdbId}`);
      if (String(itemTmdbId) === String(tmdbId)) {
        logger.info(`[SEERR WEBHOOK] ✅ Title-search verified via "${title}": "${item.Name}" ID=${item.Id} TMDB=${itemTmdbId}`);
        return item.Id;
      }
    }

    // Stash a year match as last-resort fallback. We accept matches even when Jellyfin
    // has a wrong (or no) TMDB ID, because title-search already filtered to plausible
    // candidates and the year is a strong discriminator (e.g. "Mary Poppins" 1964
    // vs. "Mary Poppins Returns" 2018). For channel-routing purposes the library
    // assignment is what matters, not the TMDB metadata accuracy.
    //
    // Sanity filter: Jellyfin's fuzzy search occasionally returns wildly unrelated
    // items for short/common titles (observed: searchTerm="Oben" returned "Toy Story 2",
    // "Scream 2", "Bärenbrüder 2" — letter-overlap matches). Reject items whose name
    // shares no normalized substring with the search term before accepting a year-match.
    if (!yearMatchFallback && year) {
      const normTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const titleTokens = normTitle.split(/\s+/).filter(t => t.length >= 3);
      const nameMatches = (itemName) => {
        if (!itemName) return false;
        const n = itemName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        if (n.includes(normTitle)) return true;
        return titleTokens.length > 0 && titleTokens.some(t => n.includes(t));
      };
      for (const item of items) {
        if (String(item.ProductionYear) !== String(year)) continue;
        if (!nameMatches(item.Name)) continue;
        const itemTmdbId = item.ProviderIds?.Tmdb || item.ProviderIds?.tmdb || item.ProviderIds?.TMDB;
        yearMatchFallback = { item, viaTitle: title, wrongTmdbId: itemTmdbId || null };
        break;
      }
    }
  }

  if (yearMatchFallback) {
    const { item, viaTitle, wrongTmdbId } = yearMatchFallback;
    const note = wrongTmdbId
      ? `– Jellyfin has wrong TMDB ID (${wrongTmdbId} ≠ ${tmdbId})`
      : `– TMDB ID not yet indexed`;
    logger.info(`[SEERR WEBHOOK] ⚠️ Year-match fallback via "${viaTitle}": "${item.Name}" (${item.ProductionYear}) ID=${item.Id} ${note}`);
    return item.Id;
  }

  logger.info(`[SEERR WEBHOOK] No Jellyfin item matched TMDB ${tmdbId} after trying ${candidates.length} title variant(s): ${candidates.map(c => `"${c}"`).join(", ")}`);
  return null;
}

/**
 * Resolve Discord channel via Jellyfin library lookup.
 */
async function resolveChannelViaJellyfin(tmdbId, mediaType) {
  const apiKey = process.env.JELLYFIN_API_KEY;
  const baseUrl = process.env.JELLYFIN_BASE_URL;
  if (!apiKey || !baseUrl) return null;

  const libraryChannels = (() => {
    try {
      const raw = process.env.JELLYFIN_NOTIFICATION_LIBRARIES;
      return typeof raw === "object" && raw !== null ? raw : JSON.parse(raw || "{}");
    } catch { return {}; }
  })();

  if (Object.keys(libraryChannels).length === 0) return null;

  try {
    const itemId = await findVerifiedJellyfinItem(tmdbId, mediaType);
    if (!itemId) {
      logger.info(`[SEERR WEBHOOK] No verified Jellyfin item found for TMDB ${tmdbId}`);
      return null;
    }

    const { fetchLibraries, findLibraryByAncestors } = await import("./api/jellyfin.js");
    const libraries = await fetchLibraries(apiKey, baseUrl);
    if (!libraries || libraries.length === 0) return null;

    logger.info(`[SEERR WEBHOOK] Libraries: ${libraries.map(l => `${l.Name}(${l.ItemId})`).join(", ")}`);

    const libraryMap = new Map();
    for (const lib of libraries) {
      libraryMap.set(lib.CollectionId, lib);
      if (lib.ItemId !== lib.CollectionId) libraryMap.set(lib.ItemId, lib);
    }

    const libraryId = await findLibraryByAncestors(itemId, apiKey, baseUrl, libraryMap, mediaType);
    if (!libraryId) {
      logger.info(`[SEERR WEBHOOK] Could not determine library for item ${itemId}`);
      return null;
    }

    logger.info(`[SEERR WEBHOOK] Item belongs to library ID: ${libraryId}`);
    const channelId = libraryChannels[libraryId];
    if (channelId) {
      logger.info(`[SEERR WEBHOOK] ✅ Library ${libraryId} → channel ${channelId}`);
      return channelId;
    }
    logger.info(`[SEERR WEBHOOK] Library ${libraryId} found but not mapped to a channel`);
    return null;
  } catch (e) {
    logger.warn("[SEERR WEBHOOK] Jellyfin library lookup error:", e.message);
  }
  return null;
}

function resolveAdminChannel() {
  return (
    process.env.SEERR_ADMIN_CHANNEL_ID ||
    process.env.SEERR_CHANNEL_ID ||
    process.env.JELLYFIN_CHANNEL_ID ||
    null
  );
}

// ─── TMDB Helpers ─────────────────────────────────────────────────────────────

async function fetchTmdbDetails(tmdbId, mediaType) {
  if (!tmdbId || !process.env.TMDB_API_KEY) return null;
  const cacheKey = `${mediaType}-${tmdbId}`;
  const cached = tmdbCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TMDB_CACHE_TTL) return cached.data;
  try {
    const endpoint = mediaType === "movie"
      ? `https://api.themoviedb.org/3/movie/${tmdbId}`
      : `https://api.themoviedb.org/3/tv/${tmdbId}`;
    const res = await axios.get(endpoint, {
      params: {
        api_key: process.env.TMDB_API_KEY,
        language: getTmdbLanguage(),
        append_to_response: "images,external_ids",
      },
      timeout: 8000,
    });
    tmdbCache.set(cacheKey, { data: res.data, timestamp: Date.now() });
    return res.data;
  } catch (e) {
    logger.warn(`[SEERR WEBHOOK] Could not fetch TMDB data for ${mediaType}/${tmdbId}: ${e.message}`);
    return null;
  }
}

// ─── URL Builders ─────────────────────────────────────────────────────────────

export function buildSeerrUrl(mediaType, tmdbId) {
  const base = (process.env.SEERR_URL || "").replace(/\/$/, "");
  if (!base || !tmdbId) return null;
  return `${base}/${mediaType === "movie" ? "movie" : "tv"}/${tmdbId}`;
}

export function buildJellyfinUrl(itemId) {
  const base = (process.env.JELLYFIN_BASE_URL || "").replace(/\/$/, "");
  const serverId = process.env.JELLYFIN_SERVER_ID || "";
  if (!base || !itemId) return null;
  return `${base}/web/index.html#!/details?id=${itemId}&serverId=${serverId}`;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function handleSeerrWebhook(req, res, client) {
  if (res) res.status(200).send("OK");

  const data = req.body;

  logger.info(`[SEERR WEBHOOK] ▶ Received event: ${data?.notification_type || "UNKNOWN"} | Subject: ${data?.subject || "–"}`);
  logger.debug(`[SEERR WEBHOOK] Full payload: ${JSON.stringify(data, null, 2)}`);

  if (!data || !data.notification_type) {
    logger.warn("[SEERR WEBHOOK] Empty or invalid payload – ignoring");
    return;
  }

  const eventType = data.notification_type;
  const cfg = EVENT_CONFIG[eventType];

  if (!cfg) {
    logger.warn(`[SEERR WEBHOOK] Unknown notification_type "${eventType}" – ignoring`);
    return;
  }

  if (!client || !client.isReady()) {
    logger.warn(`[SEERR WEBHOOK] Discord bot not ready – dropping event ${eventType}`);
    return;
  }

  try {
    await processEvent(data, eventType, cfg, client);
  } catch (err) {
    logger.error(`[SEERR WEBHOOK] Failed to process event ${eventType}:`, err);
  }
}

// ─── Event Processor ──────────────────────────────────────────────────────────

async function processEvent(data, eventType, cfg, client) {
  const { subject, message, image, media, request, issue, comment, extra = [] } = data;

  const mediaType = media?.media_type || null;
  const tmdbId = media?.tmdbId || null;
  let rootFolder = request?.rootFolder || null;

  // Drop identical webhooks fired within the dedup window. Seerr sometimes sends
  // the same MEDIA_* event twice in quick succession (observed in production logs
  // — see "Nürnberg (2025)" double-post). The key includes eventType so legitimate
  // event progression (PENDING → APPROVED → AVAILABLE) is not affected.
  if (isDuplicateWebhookEvent(eventType, mediaType, tmdbId)) {
    logger.info(
      `[SEERR WEBHOOK] 🔁 Duplicate ${eventType} for "${subject}" (TMDB ${tmdbId}) within ${WEBHOOK_DEDUP_WINDOW_MS / 1000}s – skipping`
    );
    return;
  }

  // Cross-source dedup for MEDIA_AVAILABLE via the central dispatcher. If the
  // Jellyfin poller already posted "Now Available!" for this TMDB ID, skip the
  // webhook to avoid the double-post (the skip is recorded in the audit trail).
  if (eventType === "MEDIA_AVAILABLE" && tmdbId && mediaType) {
    const { post } = shouldPost({ eventType, tmdbId, mediaType, source: "seerr-webhook", title: subject });
    if (!post) {
      logger.info(
        `[SEERR WEBHOOK] Skipping duplicate MEDIA_AVAILABLE for "${subject}" (TMDB ${tmdbId}) — already notified (likely by Jellyfin poller)`
      );
      return;
    }
  }

  // Webhook payloads never carry request.rootFolder (Seerr's notification template
  // simply doesn't include it), so we always fetch it from the Seerr API for the
  // events where channel-routing matters. Skipped for MEDIA_PENDING because those
  // go to the admin channel via a separate path, and rootFolder isn't reliably
  // populated until Seerr forwards the request to Radarr/Sonarr anyway.
  // For manually-marked items with no Seerr request, the API returns no requests
  // and routing falls through to the Jellyfin library lookup.
  if (!rootFolder && tmdbId && mediaType && ROOTFOLDER_RELEVANT_EVENTS.has(eventType)) {
    // Pass the webhook's request_id so we can fetch the specific request directly —
    // more reliable than scanning mediaInfo.requests on the movie endpoint.
    const requestId = request?.request_id || null;
    rootFolder = await fetchRootFolderFromSeerr(tmdbId, mediaType, requestId);
  }

  logger.info(
    `[SEERR WEBHOOK] Processing ${eventType} | Media: "${subject}" | Type: ${mediaType} | TMDB: ${tmdbId} | RootFolder: ${rootFolder || "none"}`
  );

  // Step 1: Fetch TMDB data FIRST so title is available for Jellyfin fallback search
  const tmdbDetails = await fetchTmdbDetails(tmdbId, mediaType);
  const imdbId = tmdbDetails?.external_ids?.imdb_id || null;
  logger.info(`[SEERR WEBHOOK] TMDB data: ${tmdbDetails ? "✅" : "❌"} | IMDb: ${imdbId || "not found"}`);

  // Step 2: Resolve channel + Jellyfin item ID in parallel (TMDB cache is now populated)
  const [channelIdResolved, jellyfinItemId] = await Promise.all([
    cfg.adminOnly ? Promise.resolve(resolveAdminChannel()) : resolveChannel(rootFolder, tmdbId, mediaType),
    findJellyfinItemId(tmdbId, mediaType),
  ]);

  let channelId = channelIdResolved;
  const fallback = process.env.SEERR_CHANNEL_ID || process.env.JELLYFIN_CHANNEL_ID || null;

  // Step 2a (Round 9 — Tier 3.5): If the channel resolved to the fallback AND we
  // found the item in Jellyfin, retry the root-folder match using the Jellyfin
  // item's filesystem path. Covers the Avengers case: Jellyseerr writes
  // rootFolder=null, Radarr doesn't have the movie (manually added to Jellyfin),
  // but the Jellyfin item itself has a Path like `/Jellyfin_ext/.../Filme/...`
  // which directly matches a SEERR_ROOT_FOLDER_CHANNELS entry.
  if (!cfg.adminOnly && jellyfinItemId && (!channelId || channelId === fallback)) {
    try {
      const { fetchItemPath } = await import("./api/jellyfin.js");
      const jfApiKey = process.env.JELLYFIN_API_KEY;
      const jfBase = process.env.JELLYFIN_BASE_URL;
      if (jfApiKey && jfBase) {
        const itemPath = await fetchItemPath(jellyfinItemId, jfApiKey, jfBase);
        if (itemPath) {
          const matched = matchRootFolderToChannel(itemPath);
          if (matched) {
            logger.info(`[SEERR WEBHOOK] 📁 Tier-3.5: root folder from Jellyfin item path "${itemPath}" → channel ${matched}`);
            channelId = matched;
            rootFolder = rootFolder || itemPath;  // record for downstream embed/retry
          } else {
            logger.info(`[SEERR WEBHOOK] Tier-3.5: Jellyfin item path "${itemPath}" did not match any SEERR_ROOT_FOLDER_CHANNELS entry`);
          }
        }
      }
    } catch (e) {
      logger.debug(`[SEERR WEBHOOK] Tier-3.5 item-path lookup failed: ${e.message}`);
    }
  }

  // Step 2b: Retry Jellyfin library lookup for MEDIA_AVAILABLE if item wasn't found
  // (Race condition: Seerr fires MEDIA_AVAILABLE before Jellyfin has scanned the file)
  const retryDelay = parseInt(process.env.JELLYFIN_RETRY_DELAY_SECONDS || "30", 10);
  const usedFallback = channelId === fallback;

  if (!channelId) {
    logger.error(`[SEERR WEBHOOK] ❌ No Discord channel configured for ${eventType} – set SEERR_CHANNEL_ID`);
    return;
  }

  logger.info(`[SEERR WEBHOOK] Target channel: ${channelId} | Jellyfin item: ${jellyfinItemId || "not found"}`);

  // Build embed and buttons
  const embed = await buildEmbed(data, eventType, cfg, tmdbDetails, mediaType, tmdbId, subject, message, image, request, issue, comment, extra);
  const tmdbCollectionId = tmdbDetails?.belongs_to_collection?.id || null;
  const buttons = buildButtons(eventType, mediaType, tmdbId, imdbId, jellyfinItemId, "CHANNEL", tmdbCollectionId);

  // MEDIA_PENDING: send to admin channel with approve/decline buttons, THEN DM requester
  // MEDIA_DECLINED: DM only
  if (eventType === "MEDIA_PENDING") {
    const adminChannelId = resolveAdminChannel();
    if (adminChannelId) {
      try {
        const adminChannel = await client.channels.fetch(adminChannelId);
        const adminOptions = { embeds: [embed] };
        // Build admin action row with approve/decline + link buttons
        const adminButtons = [];
        const requestId = request?.request_id || null;
        if (requestId) {
          adminButtons.push(
            new ButtonBuilder()
              .setCustomId(`seerr_approve|${requestId}`)
              .setLabel(t("btn_approve"))
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`seerr_decline|${requestId}`)
              .setLabel(t("btn_decline"))
              .setStyle(ButtonStyle.Danger)
          );
        }
        if (buttons) {
          // Pull every component from buildButtons (link buttons + Collection button if any).
          // No filter by style: buildButtons does not emit approve/decline, so duplication
          // is not a concern. Anything it returns belongs on the admin row.
          const rows = Array.isArray(buttons) ? buttons : [buttons];
          for (const row of rows) adminButtons.push(...row.components);
        }
        if (adminButtons.length > 0) {
          const adminRows = chunkButtonsIntoRows(adminButtons);
          adminOptions.components = Array.isArray(adminRows) ? adminRows : [adminRows];
        }
        const adminMsg = await adminChannel.send(adminOptions);
        // Persist message reference so the status poller can edit it later
        if (requestId) {
          recordAdminPendingMsg(requestId, adminChannelId, adminMsg.id);
        }
        logger.info(`[SEERR WEBHOOK] ✅ Sent MEDIA_PENDING with approve/decline to admin channel ${adminChannelId}`);
      } catch (err) {
        logger.error(`[SEERR WEBHOOK] ❌ Failed to send to admin channel: ${err.message}`);
      }
    }
    await sendRequesterDm(data, eventType, cfg, client, embed, buttons, { tmdbId, imdbId, jellyfinItemId });
    return;
  }

  if (eventType === "MEDIA_DECLINED") {
    await sendRequesterDm(data, eventType, cfg, client, embed, buttons, { tmdbId, imdbId, jellyfinItemId });
    return;
  }

  // MEDIA_APPROVED / MEDIA_AUTO_APPROVED — DM-only when flag is set (default true)
  if (
    (eventType === "MEDIA_APPROVED" || eventType === "MEDIA_AUTO_APPROVED") &&
    process.env.APPROVAL_DM_ONLY !== "false"
  ) {
    await sendRequesterDm(data, eventType, cfg, client, embed, buttons, { tmdbId, imdbId, jellyfinItemId });
    logger.info(`[SEERR WEBHOOK] ✉️ ${eventType} sent as DM-only (APPROVAL_DM_ONLY=true) for "${subject}"`);
    return;
  }

  // Send to Discord channel
  let channel;
  try {
    channel = await client.channels.fetch(channelId);
  } catch (err) {
    logger.error(`[SEERR WEBHOOK] ❌ Cannot fetch Discord channel ${channelId}: ${err.message}`);
    return;
  }

  const messageOptions = { embeds: [embed] };
  if (buttons) messageOptions.components = Array.isArray(buttons) ? buttons : [buttons];

  const sentMessage = await channel.send(messageOptions);
  logger.info(`[SEERR WEBHOOK] ✅ Sent ${eventType} notification for "${subject}" to channel ${channelId}`);

  // Mark this TMDB ID as notified (so the poller skips the duplicate) and record
  // the post in the audit trail via the central dispatcher.
  if (eventType === "MEDIA_AVAILABLE" && tmdbId && mediaType) {
    markPosted({ eventType, tmdbId, mediaType, source: "seerr-webhook", title: subject, channelId });

    // Round 12: clean up the pendingRequests entry for this title — the
    // notification has been delivered, so the poller no longer needs the
    // "via Questorr" marker for it. Keeps the map bounded.
    const dedupType = mediaType === "movie" ? "movie" : "tv";
    const requestKey = `${tmdbId}-${dedupType}`;
    if (pendingRequests.has(requestKey)) {
      pendingRequests.delete(requestKey);
      savePendingRequests();
      logger.debug(`[SEERR WEBHOOK] Cleaned up pendingRequests entry for ${requestKey}`);
    }
  }

  // Schedule retry for two distinct cases:
  //  - "relocate": initial routing fell back to default channel — find the right channel and resend
  //  - "edit"   : routing was direct, but Jellyfin had not scanned the file yet — re-lookup and add
  //               the Watch-Now button by editing the existing message (no double post)
  const needsRelocate = usedFallback;
  const needsEditForWatchButton = !usedFallback && !jellyfinItemId;
  if (
    eventType === "MEDIA_AVAILABLE" &&
    !cfg.adminOnly &&
    retryDelay > 0 &&
    tmdbId &&
    mediaType &&
    (needsRelocate || needsEditForWatchButton)
  ) {
    scheduleJellyfinRetry({
      data, eventType, cfg, client, tmdbDetails, imdbId, tmdbCollectionId,
      rootFolder, tmdbId, mediaType, subject, message, image, request, issue, comment, extra,
      retryDelay,
      mode: needsRelocate ? "relocate" : "edit",
      fallbackChannelId: channelId,
      fallbackMessageId: sentMessage?.id || null,
      fallbackChannel: channel,
      sentMessage,
      sentChannel: channel,
    });
  }

  // DM requester for personal events
  await sendRequesterDm(data, eventType, cfg, client, embed, buttons, { tmdbId, imdbId, jellyfinItemId });
}

// ─── Jellyfin Item Lookup ─────────────────────────────────────────────────────

async function findJellyfinItemId(tmdbId, mediaType) {
  if (!tmdbId || !mediaType) return null;
  // Reuse the verified lookup to ensure correct item
  const itemId = await findVerifiedJellyfinItem(tmdbId, mediaType);
  if (itemId) logger.info(`[SEERR WEBHOOK] Watch Now item ID: ${itemId} for TMDB ${tmdbId}`);
  return itemId;
}

// ─── Embed Builder ────────────────────────────────────────────────────────────

async function buildEmbed(data, eventType, cfg, tmdbDetails, mediaType, tmdbId, subject, message, image, request, issue, comment, extra) {
  const embed = new EmbedBuilder()
    .setColor(cfg.color)
    .setAuthor({ name: `${cfg.emoji} ${cfg.label}` })
    .setTitle(subject || "Questorr Notification")
    .setTimestamp();

  const footerText = process.env.EMBED_FOOTER_TEXT;
  const requesterName = request?.requestedBy_username;

  if (requesterName && eventType === "MEDIA_PENDING") {
    const requesterFooter = t("requested_by").replace("{{user}}", requesterName);
    const combinedFooter = footerText ? `${requesterFooter} \u2022 ${footerText}` : requesterFooter;

    let avatarUrl = null;
    const seerrUrl = process.env.SEERR_URL;
    if (request?.requestedBy_avatar && seerrUrl) {
      avatarUrl = request.requestedBy_avatar.startsWith("http")
        ? request.requestedBy_avatar
        : `${seerrUrl.replace(/\/+$/, "")}${request.requestedBy_avatar}`;
    }
    embed.setFooter(avatarUrl ? { text: combinedFooter, iconURL: avatarUrl } : { text: combinedFooter });
  } else if (footerText) {
    embed.setFooter({ text: footerText });
  }

  // Poster thumbnail
  if (tmdbDetails?.poster_path) {
    embed.setThumbnail(`https://image.tmdb.org/t/p/w500${tmdbDetails.poster_path}`);
  } else if (image && isValidUrl(image)) {
    embed.setThumbnail(image);
  }

  // Backdrop for media events
  if (["MEDIA_AVAILABLE", "MEDIA_APPROVED", "MEDIA_AUTO_APPROVED"].includes(eventType) && tmdbDetails) {
    const backdropPath = findBestBackdrop(tmdbDetails);
    if (backdropPath) {
      embed.setImage(`https://image.tmdb.org/t/p/w1280${backdropPath}`);
    }
  }

  if (message) embed.setDescription(message);

  switch (eventType) {
    case "MEDIA_PENDING":
    case "MEDIA_APPROVED":
    case "MEDIA_AUTO_APPROVED":
    case "MEDIA_AVAILABLE":
    case "MEDIA_DECLINED":
    case "MEDIA_FAILED": {
      const fields = [];
      if (mediaType) {
        fields.push({ name: t("field_type"), value: mediaType === "movie" ? t("field_type_movie") : t("field_type_tv"), inline: true });
      }
      if (request?.requestedBy_username && ["MEDIA_PENDING", "MEDIA_DECLINED", "MEDIA_FAILED"].includes(eventType)) {
        fields.push({ name: t("field_requested_by"), value: request.requestedBy_username, inline: true });
      }
      if ((eventType === "MEDIA_DECLINED" || eventType === "MEDIA_FAILED") && request?.comment) {
        fields.push({ name: t("field_reason"), value: request.comment, inline: false });
      }
      if (Array.isArray(extra) && extra.length > 0) {
        for (const item of extra) {
          if (item.name && item.value) {
            fields.push({ name: item.name, value: String(item.value), inline: true });
          }
        }
      }
      if (fields.length > 0) embed.addFields(...fields);
      break;
    }
    case "ISSUE_CREATED":
    case "ISSUE_REOPENED": {
      const fields = [];
      if (issue?.issue_type) fields.push({ name: "Issue Type", value: issue.issue_type, inline: true });
      if (issue?.reportedBy_username) fields.push({ name: "Reported by", value: issue.reportedBy_username, inline: true });
      if (mediaType) fields.push({ name: "Media Type", value: mediaType === "movie" ? t("field_type_movie") : t("field_type_tv"), inline: true });
      if (fields.length > 0) embed.addFields(...fields);
      break;
    }
    case "ISSUE_COMMENT": {
      if (comment?.comment_message) embed.setDescription(comment.comment_message);
      if (comment?.commentedBy_username) embed.addFields({ name: "Comment by", value: comment.commentedBy_username, inline: true });
      break;
    }
    case "ISSUE_RESOLVED": {
      if (issue?.resolvedBy_username) embed.addFields({ name: "Resolved by", value: issue.resolvedBy_username, inline: true });
      break;
    }
    case "TEST_NOTIFICATION":
      embed.setDescription(message || "Seerr webhook connection is working correctly! ✅");
      break;
    default:
      break;
  }

  return embed;
}

// ─── Button Builder ───────────────────────────────────────────────────────────

export function getEventButtons(eventType, variant = "CHANNEL") {
  // Per-event button config: NOTIF_BUTTONS_MEDIA_AVAILABLE=seerr,watch,-letterboxd,-imdb
  // Positive = always show, -negative = always hide, missing = use global toggle
  // For DM variant: NOTIF_BUTTONS_MEDIA_AVAILABLE_DM with the same format.
  // DM resolution order: NOTIF_BUTTONS_<EVENT>_DM → all OFF (DMs default to no buttons,
  // except MEDIA_AVAILABLE which inherits CHANNEL config for backward compat).
  const isDm = variant === "DM";
  const envKey = isDm ? `NOTIF_BUTTONS_${eventType}_DM` : `NOTIF_BUTTONS_${eventType}`;
  const custom = process.env[envKey];
  const parseCustom = (raw) => {
    const parts = raw.toLowerCase().split(",").map((s) => s.trim());
    const on  = parts.filter((p) => !p.startsWith("-"));
    const off = parts.filter((p) =>  p.startsWith("-")).map((p) => p.slice(1));
    const glob = {
      showSeerr:      process.env.EMBED_SHOW_BUTTON_SEERR      !== "false",
      showWatch:      process.env.EMBED_SHOW_BUTTON_WATCH       !== "false",
      showLetterboxd: process.env.EMBED_SHOW_BUTTON_LETTERBOXD  !== "false",
      showImdb:       process.env.EMBED_SHOW_BUTTON_IMDB        !== "false",
    };
    return {
      showSeerr:      on.includes("seerr")      ? true : off.includes("seerr")      ? false : glob.showSeerr,
      showWatch:      on.includes("watch")      ? true : off.includes("watch")      ? false : glob.showWatch,
      showLetterboxd: on.includes("letterboxd") ? true : off.includes("letterboxd") ? false : glob.showLetterboxd,
      showImdb:       on.includes("imdb")       ? true : off.includes("imdb")       ? false : glob.showImdb,
    };
  };

  if (custom !== undefined && custom !== "") return parseCustom(custom);

  if (isDm) {
    // Backward-compat: MEDIA_AVAILABLE DMs historically inherited CHANNEL buttons.
    // Other events default to no buttons in DMs.
    if (eventType === "MEDIA_AVAILABLE") {
      return getEventButtons(eventType, "CHANNEL");
    }
    return { showSeerr: false, showWatch: false, showLetterboxd: false, showImdb: false };
  }

  // Channel default: global toggles
  return {
    showSeerr:      process.env.EMBED_SHOW_BUTTON_SEERR      !== "false",
    showWatch:      process.env.EMBED_SHOW_BUTTON_WATCH       !== "false",
    showLetterboxd: process.env.EMBED_SHOW_BUTTON_LETTERBOXD  !== "false",
    showImdb:       process.env.EMBED_SHOW_BUTTON_IMDB        !== "false",
  };
}

function buildButtons(eventType, mediaType, tmdbId, imdbId, jellyfinItemId, variant = "CHANNEL", tmdbCollectionId = null) {
  const components = [];

  const { showSeerr, showWatch, showImdb, showLetterboxd } = getEventButtons(eventType, variant);

  // View on Seerr
  if (showSeerr) {
    const seerrUrl = buildSeerrUrl(mediaType, tmdbId);
    if (seerrUrl && isValidUrl(seerrUrl)) {
      components.push(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel(t("btn_view_seerr"))
          .setURL(seerrUrl)
      );
    }
  }

  // Watch Now on Jellyfin – only for MEDIA_AVAILABLE
  if (showWatch && eventType === "MEDIA_AVAILABLE" && jellyfinItemId) {
    const watchUrl = buildJellyfinUrl(jellyfinItemId);
    if (watchUrl && isValidUrl(watchUrl)) {
      components.push(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel(t("btn_watch_now"))
          .setURL(watchUrl)
      );
    }
  }

  // Letterboxd – movies only
  if (showLetterboxd && imdbId && mediaType === "movie") {
    const lboxdUrl = `https://letterboxd.com/imdb/${imdbId}`;
    if (isValidUrl(lboxdUrl)) {
      components.push(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel(t("btn_letterboxd"))
          .setURL(lboxdUrl)
      );
    }
  }

  // IMDb
  if (showImdb && imdbId) {
    const imdbUrl = `https://www.imdb.com/title/${imdbId}/`;
    if (isValidUrl(imdbUrl)) {
      components.push(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel(t("btn_imdb"))
          .setURL(imdbUrl)
      );
    }
  }

  // Collection button — movies that belong to a TMDB collection. Skipped in DMs
  // (the channel post already exposes it; the DM-receiving user is also the
  // requester and can use the channel button).
  if (tmdbCollectionId && mediaType === "movie" && variant !== "DM") {
    components.push(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Secondary)
        .setCustomId(`collection_show|${tmdbId}`)
        .setLabel(t("btn_collection"))
    );
  }

  if (components.length === 0) return null;
  return chunkButtonsIntoRows(components);
}

/**
 * Split a flat list of ButtonBuilders into ActionRows of max 5 buttons each.
 * Returns either a single ActionRowBuilder (if ≤5) or an array of rows.
 * Callers should normalize via `Array.isArray(result) ? result : [result]`.
 */
function chunkButtonsIntoRows(components) {
  if (components.length <= 5) {
    return new ActionRowBuilder().addComponents(components);
  }
  const rows = [];
  for (let i = 0; i < components.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(components.slice(i, i + 5)));
  }
  return rows;
}

// ─── DM Requester ────────────────────────────────────────────────────────────

// Per-event metadata for DM rendering. `dmKey` selects the i18n keys
// (dm_<dmKey>_author / dm_<dmKey>_description); `color` is the embed color.
const DM_EVENT_META = {
  MEDIA_PENDING:       { dmKey: "pending",        color: "#f0a500" },
  MEDIA_APPROVED:      { dmKey: "approved",       color: "#1ec8a0" },
  MEDIA_AUTO_APPROVED: { dmKey: "auto_approved",  color: "#1ec8a0" },
  MEDIA_DECLINED:      { dmKey: "declined",       color: "#e74c3c" },
  MEDIA_AVAILABLE:     { dmKey: "available",      color: "#2ecc71" },
};

/**
 * Send a status DM to the requester.
 *
 * @param {Object} data       Webhook payload (or synthetic equivalent)
 * @param {string} eventType  MEDIA_PENDING / MEDIA_APPROVED / etc.
 * @param {Object} cfg        Routing config (currently unused inside DM, kept for parity)
 * @param {Object} client     Discord client
 * @param {Object} embed      Original channel embed (used for thumbnail/image inheritance)
 * @param {Object} _legacyButtons  Ignored — DM buttons are now built per-event from
 *                                 NOTIF_BUTTONS_<EVENT>_DM. Kept for signature stability.
 * @param {Object} ctx        Optional { tmdbId, imdbId, jellyfinItemId } to enable rich link buttons.
 */
export async function sendRequesterDm(data, eventType, cfg, client, embed, _legacyButtons, ctx = {}) {
  const meta = DM_EVENT_META[eventType];
  if (!meta) return;

  // NOTIFY_ON_AVAILABLE gates only the "now available" DM (dashboard checkbox).
  // Default on; set to "false" to suppress availability DMs while keeping the
  // channel post and all other DMs (pending/approved/declined) unaffected.
  if (eventType === "MEDIA_AVAILABLE" && process.env.NOTIFY_ON_AVAILABLE === "false") {
    logger.debug("[SEERR WEBHOOK] Skipping MEDIA_AVAILABLE DM — NOTIFY_ON_AVAILABLE is false");
    return;
  }

  const discordId = await findDiscordIdForSeerrUser(data);
  if (!discordId) {
    logger.debug(`[SEERR WEBHOOK] No Discord ID found for DM (event: ${eventType}, user: ${data.request?.requestedBy_username || "unknown"})`);
    return;
  }

  try {
    const user = await client.users.fetch(discordId);
    const title = data.subject || "Questorr Notification";
    const mediaType = data.media?.media_type;
    const mediaTypeLabel = mediaType === "movie" ? t("field_type_movie") : t("field_type_tv");
    const footerText = process.env.EMBED_FOOTER_TEXT;

    const authorText = t(`dm_${meta.dmKey}_author`);
    const description = t(`dm_${meta.dmKey}_description`, { title });

    const fields = [];
    if (mediaType) {
      fields.push({ name: t("dm_field_type"), value: mediaTypeLabel, inline: true });
    }
    if (eventType === "MEDIA_DECLINED" && data.request?.comment) {
      fields.push({ name: t("dm_field_reason"), value: data.request.comment, inline: false });
    }

    const dmEmbed = new EmbedBuilder()
      .setColor(meta.color)
      .setAuthor({ name: authorText })
      .setTitle(title)
      .setDescription(description)
      .setTimestamp();

    if (footerText) dmEmbed.setFooter({ text: footerText });
    if (fields.length > 0) dmEmbed.addFields(...fields);
    if (embed?.data?.thumbnail) dmEmbed.setThumbnail(embed.data.thumbnail.url);
    if (embed?.data?.image && eventType === "MEDIA_AVAILABLE") dmEmbed.setImage(embed.data.image.url);

    // Build DM-specific buttons via the per-event "DM" variant config.
    const tmdbId = ctx.tmdbId ?? data.media?.tmdbId;
    const imdbId = ctx.imdbId ?? null;
    const jellyfinItemId = ctx.jellyfinItemId ?? null;
    const dmButtons = buildButtons(eventType, mediaType, tmdbId, imdbId, jellyfinItemId, "DM");

    const dmOptions = { embeds: [dmEmbed] };
    if (dmButtons) dmOptions.components = Array.isArray(dmButtons) ? dmButtons : [dmButtons];

    await user.send(dmOptions);
    logger.info(`[SEERR WEBHOOK] ✉️ Sent DM to Discord user ${discordId} for ${eventType} – "${title}"`);

    // Cross-source dedup: mark approval/decline DMs so the status poller and
    // the Discord approve/decline button handler skip duplicates.
    if (
      eventType === "MEDIA_APPROVED" ||
      eventType === "MEDIA_AUTO_APPROVED" ||
      eventType === "MEDIA_DECLINED"
    ) {
      const reqId = data.request?.request_id ?? tmdbId;
      if (reqId) markNotified("approval", `${eventType}-${reqId}`);
    }
  } catch (err) {
    logger.warn(`[SEERR WEBHOOK] Could not send DM to ${discordId}: ${err.message}`);
  }
}

/**
 * Find the Discord ID for the user who made a Seerr request,
 * by looking up the Seerr user ID in USER_MAPPINGS.
 */
async function findDiscordIdForSeerrUser(data) {
  // First try: discordId directly in webhook payload
  if (data.request?.requestedBy_settings_discordId) {
    return data.request.requestedBy_settings_discordId;
  }

  // Second try: look up via USER_MAPPINGS by Seerr username or ID
  try {
    const raw = process.env.USER_MAPPINGS;
    const mappings = typeof raw === "string" ? JSON.parse(raw) : (raw || []);

    if (!Array.isArray(mappings) || mappings.length === 0) return null;

    const seerrUsername = data.request?.requestedBy_username;
    if (!seerrUsername) return null;

    const match = mappings.find(
      (m) => m.seerrDisplayName === seerrUsername || String(m.seerrUserId) === String(seerrUsername)
    );

    if (match?.discordUserId) {
      logger.debug(`[SEERR WEBHOOK] Found Discord ID ${match.discordUserId} for Seerr user "${seerrUsername}"`);
      return match.discordUserId;
    }
  } catch (e) {
    logger.debug("[SEERR WEBHOOK] USER_MAPPINGS lookup failed:", e.message);
  }

  return null;
}

// ─── Jellyfin Retry (Background) ─────────────────────────────────────────────

/**
 * Schedule a background retry for Jellyfin library lookup.
 *
 * Two modes:
 *  - "relocate": Initial routing fell back to default channel because the
 *    Jellyfin library lookup returned nothing. Retry the lookup; if a better
 *    channel is found, delete the fallback-channel message and resend in
 *    the correct channel.
 *  - "edit"   : Initial routing was correct (no fallback) but Jellyfin had
 *    not scanned the file yet, so the Watch-Now button could not be built.
 *    Retry the lookup; if the item shows up, edit the existing message in
 *    place and add the Watch-Now button (no double post).
 */
function scheduleJellyfinRetry(ctx) {
  const {
    data, eventType, cfg, client, tmdbDetails, imdbId, tmdbCollectionId,
    rootFolder, tmdbId, mediaType, subject, message, image, request, issue, comment, extra,
    retryDelay, mode = "relocate",
    fallbackChannelId, fallbackMessageId, fallbackChannel,
    sentMessage, sentChannel,
  } = ctx;

  logger.info(
    `[SEERR WEBHOOK] ⏳ Jellyfin lookup retry scheduled (mode=${mode}) in ${retryDelay}s for "${subject}"`
  );

  const maxRetries = 3;
  let attempt = 0;

  const tryRetry = async () => {
    attempt++;
    logger.info(`[SEERR WEBHOOK] 🔄 Retry ${attempt}/${maxRetries} (mode=${mode}) – Jellyfin lookup for "${subject}" (TMDB ${tmdbId})`);

    try {
      if (!client || !client.isReady()) {
        logger.warn(`[SEERR WEBHOOK] Discord bot not ready on retry – dropping retry`);
        return;
      }

      const channelId = mode === "relocate"
        ? await resolveChannelViaJellyfin(tmdbId, mediaType)
        : null;
      const jellyfinItemId = await findVerifiedJellyfinItem(tmdbId, mediaType);

      // ─── Mode: edit (in-place button update) ────────────────────────────
      if (mode === "edit") {
        if (!jellyfinItemId) {
          if (attempt < maxRetries) {
            logger.info(`[SEERR WEBHOOK] Retry ${attempt} (edit) – Jellyfin item still missing, next retry in ${retryDelay}s`);
            setTimeout(tryRetry, retryDelay * 1000);
          } else {
            logger.info(`[SEERR WEBHOOK] ⚠️ Watch-Now button retry exhausted for "${subject}" – message stays without Watch button`);
          }
          return;
        }

        if (!sentMessage || !sentChannel) {
          logger.debug(`[SEERR WEBHOOK] Edit retry has no sentMessage/sentChannel reference for "${subject}" – skipping`);
          return;
        }

        try {
          // Verify the message still exists (mod could have deleted it)
          const fresh = await sentChannel.messages.fetch(sentMessage.id);
          const newButtons = buildButtons(eventType, mediaType, tmdbId, imdbId, jellyfinItemId, "CHANNEL", tmdbCollectionId);
          const newComponents = newButtons
            ? (Array.isArray(newButtons) ? newButtons : [newButtons])
            : [];
          await fresh.edit({ components: newComponents });
          logger.info(`[SEERR WEBHOOK] ✏️ Watch-Now button added to "${subject}" after retry ${attempt}`);
        } catch (editErr) {
          logger.debug(`[SEERR WEBHOOK] Could not edit message for "${subject}": ${editErr.message}`);
        }
        return;
      }

      // ─── Mode: relocate (existing behavior) ─────────────────────────────
      if (channelId && channelId !== fallbackChannelId) {
        logger.info(`[SEERR WEBHOOK] ✅ Retry succeeded! Library → channel ${channelId} for "${subject}"`);

        // Delete the fallback-channel message before sending to the correct channel
        if (fallbackMessageId && fallbackChannel) {
          try {
            const fallbackMsg = await fallbackChannel.messages.fetch(fallbackMessageId);
            await fallbackMsg.delete();
            logger.info(`[SEERR WEBHOOK] 🗑️ Deleted fallback message ${fallbackMessageId} from channel ${fallbackChannelId}`);
          } catch (delErr) {
            logger.debug(`[SEERR WEBHOOK] Could not delete fallback message: ${delErr.message}`);
          }
        }

        // Build and send the corrected notification to the right channel
        const embed = await buildEmbed(data, eventType, cfg, tmdbDetails, mediaType, tmdbId, subject, message, image, request, issue, comment, extra);
        const buttons = buildButtons(eventType, mediaType, tmdbId, imdbId, jellyfinItemId, "CHANNEL", tmdbCollectionId);

        const channel = await client.channels.fetch(channelId);
        const messageOptions = { embeds: [embed] };
        if (buttons) messageOptions.components = Array.isArray(buttons) ? buttons : [buttons];
        await channel.send(messageOptions);
        logger.info(`[SEERR WEBHOOK] ✅ Sent corrected ${eventType} notification for "${subject}" to channel ${channelId}`);
        return;
      }

      if (attempt < maxRetries) {
        logger.info(`[SEERR WEBHOOK] Retry ${attempt} – still no Jellyfin match, next retry in ${retryDelay}s`);
        setTimeout(tryRetry, retryDelay * 1000);
      } else {
        logger.info(`[SEERR WEBHOOK] ⚠️ All ${maxRetries} retries exhausted for "${subject}" – notification stays in fallback channel`);
      }
    } catch (err) {
      logger.error(`[SEERR WEBHOOK] Retry ${attempt} error for "${subject}": ${err.message}`);
      if (attempt < maxRetries) {
        setTimeout(tryRetry, retryDelay * 1000);
      }
    }
  };

  setTimeout(tryRetry, retryDelay * 1000);
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, val] of tmdbCache.entries()) {
    if (now - val.timestamp > TMDB_CACHE_TTL) {
      tmdbCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) logger.debug(`[SEERR WEBHOOK] Cleaned ${cleaned} stale TMDB cache entries`);
}, 60 * 60 * 1000);
