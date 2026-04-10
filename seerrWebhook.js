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

import { t, tNotif } from "./utils/botStrings.js";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import axios from "axios";
import logger from "./utils/logger.js";
import { isValidUrl } from "./utils/url.js";
import { findBestBackdrop } from "./api/tmdb.js";

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
 */
async function fetchRootFolderFromSeerr(tmdbId, mediaType) {
  const seerrUrl = process.env.SEERR_URL;
  const seerrApiKey = process.env.SEERR_API_KEY;
  if (!seerrUrl || !seerrApiKey) return null;

  try {
    const base = seerrUrl.replace(/\/$/, "");
    // Search requests for this media item
    const res = await axios.get(`${base}/api/v1/request`, {
      headers: { "X-Api-Key": seerrApiKey },
      params: {
        take: 20,
        sort: "modified",
        filter: "all",
      },
      timeout: 5000,
    });

    const requests = res.data?.results || [];
    const mediaTypeSeerr = mediaType === "movie" ? 1 : 2;

    // Find most recent request for this TMDB ID
    const match = requests.find(r =>
      r.media?.tmdbId === Number(tmdbId) && r.media?.mediaType === (mediaType === "movie" ? "movie" : "tv")
    );

    if (match?.rootFolder) {
      logger.info(`[SEERR WEBHOOK] 📁 Found root folder from Seerr API: ${match.rootFolder}`);
      return match.rootFolder;
    }

    // Also check media.requests if nested
    const res2 = await axios.get(`${base}/api/v1/${mediaType === "movie" ? "movie" : "tv"}/${tmdbId}`, {
      headers: { "X-Api-Key": seerrApiKey },
      timeout: 5000,
    }).catch(() => null);

    const reqs = res2?.data?.requests || [];
    const rootFolders = reqs.map(r => r.rootFolder).filter(Boolean);
    if (rootFolders.length > 0) {
      logger.info(`[SEERR WEBHOOK] 📁 Found root folder from media endpoint: ${rootFolders[0]}`);
      return rootFolders[0];
    }
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

async function resolveChannel(rootFolder, tmdbId, mediaType) {
  // 1. Root-folder mapping
  if (rootFolder) {
    try {
      const raw = process.env.SEERR_ROOT_FOLDER_CHANNELS;
      const mappings = typeof raw === "object" && raw !== null
        ? raw
        : JSON.parse(raw || "{}");

      const normalizedRoot = rootFolder.replace(/\\/g, "/").toLowerCase().replace(/\/$/, "");
      for (const [folder, channelId] of Object.entries(mappings)) {
        const normalizedFolder = folder.replace(/\\/g, "/").toLowerCase().replace(/\/$/, "");
        if (normalizedRoot === normalizedFolder || normalizedRoot.startsWith(normalizedFolder + "/")) {
          logger.info(`[SEERR WEBHOOK] ✅ Root folder "${rootFolder}" → channel ${channelId}`);
          return channelId;
        }
      }
      logger.debug(`[SEERR WEBHOOK] No root folder match for "${rootFolder}"`);
    } catch (e) {
      logger.warn("[SEERR WEBHOOK] Failed to parse SEERR_ROOT_FOLDER_CHANNELS:", e.message);
    }
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
 * Jellyfin's AnyProviderIdEquals is broken on this server (returns all items).
 * Instead we use the TMDB title to search, then verify the TMDB ID in ProviderIds.
 * TMDB data must be fetched before calling this function (tmdbCache must be populated).
 */
export async function findVerifiedJellyfinItem(tmdbId, mediaType) {
  const apiKey = process.env.JELLYFIN_API_KEY;
  const baseUrl = process.env.JELLYFIN_BASE_URL;
  if (!apiKey || !baseUrl) return null;

  // Get title from TMDB cache – must be populated before this is called
  const cached = tmdbCache.get(`${mediaType}-${tmdbId}`);
  const title = cached?.data?.title || cached?.data?.name
             || cached?.data?.original_title || cached?.data?.original_name;

  if (!title) {
    logger.warn(`[SEERR WEBHOOK] No TMDB title in cache for ${mediaType}/${tmdbId} – cannot search Jellyfin`);
    return null;
  }

  const base = baseUrl.replace(/\/$/, "");
  const itemType = mediaType === "movie" ? "Movie" : "Series";

  logger.info(`[SEERR WEBHOOK] Searching Jellyfin for "${title}" (TMDB ${tmdbId})`);

  try {
    // Search by title, verify TMDB ID in results
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

    const items = res.data?.Items || [];
    logger.info(`[SEERR WEBHOOK] Title search returned ${items.length} results`);

    // Try exact TMDB ID match first
    for (const item of items) {
      const itemTmdbId = item.ProviderIds?.Tmdb || item.ProviderIds?.tmdb || item.ProviderIds?.TMDB;
      logger.debug(`[SEERR WEBHOOK] Candidate: "${item.Name}" (${item.ProductionYear}) TMDB=${itemTmdbId}`);
      if (String(itemTmdbId) === String(tmdbId)) {
        logger.info(`[SEERR WEBHOOK] ✅ Verified: "${item.Name}" ID=${item.Id} TMDB=${itemTmdbId}`);
        return item.Id;
      }
    }

    // If no TMDB match, try year-based fallback for newly added items
    // (ProviderIds may not be indexed yet right after download)
    const year = cached?.data?.release_date?.substring(0, 4)
              || cached?.data?.first_air_date?.substring(0, 4);

    if (year) {
      for (const item of items) {
        const itemTmdbId = item.ProviderIds?.Tmdb || item.ProviderIds?.tmdb;
        // Only accept if no conflicting TMDB ID (could be unindexed new item)
        if (!itemTmdbId && String(item.ProductionYear) === String(year)) {
          logger.info(`[SEERR WEBHOOK] ⚠️ Year-match fallback: "${item.Name}" (${year}) ID=${item.Id} – TMDB ID not yet indexed`);
          return item.Id;
        }
      }
    }

    logger.info(`[SEERR WEBHOOK] No Jellyfin item matched TMDB ${tmdbId} ("${title}")`);
    return null;
  } catch (e) {
    logger.warn(`[SEERR WEBHOOK] Jellyfin search error for "${title}": ${e.message}`);
    return null;
  }
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
      params: { api_key: process.env.TMDB_API_KEY, append_to_response: "images,external_ids" },
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

  // If rootFolder missing (common for MEDIA_AVAILABLE), look it up from Seerr API
  if (!rootFolder && tmdbId && mediaType && eventType === "MEDIA_AVAILABLE") {
    rootFolder = await fetchRootFolderFromSeerr(tmdbId, mediaType);
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

  const channelId = channelIdResolved;

  if (!channelId) {
    logger.error(`[SEERR WEBHOOK] ❌ No Discord channel configured for ${eventType} – set SEERR_CHANNEL_ID`);
    return;
  }

  logger.info(`[SEERR WEBHOOK] Target channel: ${channelId} | Jellyfin item: ${jellyfinItemId || "not found"}`);

  // Build embed and buttons
  const embed = await buildEmbed(data, eventType, cfg, tmdbDetails, mediaType, tmdbId, subject, message, image, request, issue, comment, extra);
  const buttons = buildButtons(eventType, mediaType, tmdbId, imdbId, jellyfinItemId);

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
          // Add any link buttons (Seerr, IMDb etc.) from the standard button builder
          const linkBtns = buttons.components.filter(c => c.data.style === ButtonStyle.Link);
          adminButtons.push(...linkBtns);
        }
        if (adminButtons.length > 0) {
          adminOptions.components = [new ActionRowBuilder().addComponents(adminButtons)];
        }
        await adminChannel.send(adminOptions);
        logger.info(`[SEERR WEBHOOK] ✅ Sent MEDIA_PENDING with approve/decline to admin channel ${adminChannelId}`);
      } catch (err) {
        logger.error(`[SEERR WEBHOOK] ❌ Failed to send to admin channel: ${err.message}`);
      }
    }
    await sendRequesterDm(data, eventType, cfg, client, embed, buttons);
    return;
  }

  if (eventType === "MEDIA_DECLINED") {
    await sendRequesterDm(data, eventType, cfg, client, embed, buttons);
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
  if (buttons) messageOptions.components = [buttons];

  await channel.send(messageOptions);
  logger.info(`[SEERR WEBHOOK] ✅ Sent ${eventType} notification for "${subject}" to channel ${channelId}`);

  // DM requester for personal events
  await sendRequesterDm(data, eventType, cfg, client, embed, buttons);
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
  if (footerText) embed.setFooter({ text: footerText });

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
        fields.push({ name: "Type", value: mediaType === "movie" ? t("field_type_movie") : t("field_type_tv"), inline: true });
      }
      if (request?.requestedBy_username) {
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

function getEventButtons(eventType) {
  // Per-event button config: NOTIF_BUTTONS_MEDIA_AVAILABLE=seerr,watch,-letterboxd,-imdb
  // Positive = always show, -negative = always hide, missing = use global toggle
  const envKey = "NOTIF_BUTTONS_" + eventType;
  const custom = process.env[envKey];
  if (custom !== undefined && custom !== "") {
    const parts = custom.toLowerCase().split(",").map(s => s.trim());
    const on  = parts.filter(p => !p.startsWith("-"));
    const off = parts.filter(p =>  p.startsWith("-")).map(p => p.slice(1));
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
  }
  // Fall back to global toggles
  return {
    showSeerr:      process.env.EMBED_SHOW_BUTTON_SEERR      !== "false",
    showWatch:      process.env.EMBED_SHOW_BUTTON_WATCH       !== "false",
    showLetterboxd: process.env.EMBED_SHOW_BUTTON_LETTERBOXD  !== "false",
    showImdb:       process.env.EMBED_SHOW_BUTTON_IMDB        !== "false",
  };
}

function buildButtons(eventType, mediaType, tmdbId, imdbId, jellyfinItemId) {
  const components = [];

  const { showSeerr, showWatch, showImdb } = getEventButtons(eventType);

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
  const { showLetterboxd } = getEventButtons(eventType);
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

  if (components.length === 0) return null;
  return new ActionRowBuilder().addComponents(components);
}

// ─── DM Requester ────────────────────────────────────────────────────────────

async function sendRequesterDm(data, eventType, cfg, client, embed, buttons) {
  // DM on these events regardless of NOTIFY_ON_AVAILABLE
  const dmEvents = ["MEDIA_PENDING", "MEDIA_APPROVED", "MEDIA_AUTO_APPROVED", "MEDIA_DECLINED", "MEDIA_AVAILABLE"];
  if (!dmEvents.includes(eventType)) return;

  // Find Discord ID from user mapping
  const discordId = await findDiscordIdForSeerrUser(data);

  if (!discordId) {
    logger.debug(`[SEERR WEBHOOK] No Discord ID found for DM (event: ${eventType}, user: ${data.request?.requestedBy_username || "unknown"})`);
    return;
  }

  try {
    const user = await client.users.fetch(discordId);

    // Use Seerr's own message field if present, else build a generic English fallback
    const dmDescription = data.message
      || (eventType === "MEDIA_AVAILABLE"
        ? `**${data.subject}** is now available! 🎉`
        : eventType === "MEDIA_APPROVED" || eventType === "MEDIA_AUTO_APPROVED"
        ? `Your request for **${data.subject}** has been approved! ✅`
        : eventType === "MEDIA_DECLINED"
        ? `Your request for **${data.subject}** has been declined. ❌`
        : `Your request status for **${data.subject}** has been updated.`);

    const dmEmbed = new EmbedBuilder()
      .setColor(cfg.color)
      .setAuthor({ name: `${cfg.emoji} ${cfg.label}` })
      .setTitle(data.subject || "Questorr Notification")
      .setDescription(dmDescription)
      .setTimestamp();

    const dmFooter = process.env.EMBED_FOOTER_TEXT;
    if (dmFooter) dmEmbed.setFooter({ text: dmFooter });

    if (embed.data?.thumbnail) dmEmbed.setThumbnail(embed.data.thumbnail.url);
    if (embed.data?.image && eventType === "MEDIA_AVAILABLE") dmEmbed.setImage(embed.data.image.url);

    const dmOptions = { embeds: [dmEmbed] };
    if (buttons) dmOptions.components = [buttons];

    await user.send(dmOptions);
    logger.info(`[SEERR WEBHOOK] ✉️ Sent DM to Discord user ${discordId} for ${eventType} – "${data.subject}"`);
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
