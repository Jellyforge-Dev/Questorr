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
import { deduplicator } from "../jellyfin/libraryResolver.js";
import {
  fetchLibraryMap,
  getLibraryChannels,
  resolveConfigLibraryId,
  resolveTargetChannel,
} from "../jellyfin/libraryResolver.js";
import { findLibraryByAncestors, fetchLatestAdditions } from "../api/jellyfin.js";
import { findBestBackdrop } from "../api/tmdb.js";

// ─── State ────────────────────────────────────────────────────────────────────

let pollerTimer = null;
let initialized = false;

// ─── Type config ──────────────────────────────────────────────────────────────

const TYPE_SETTINGS = {
  Movie:   { envKey: "JELLYFIN_NOTIFY_MOVIES",   emoji: "🎬", color: "#1ec8a0", label: "Film" },
  Series:  { envKey: "JELLYFIN_NOTIFY_SERIES",    emoji: "📺", color: "#1ec8a0", label: "Serie" },
  Season:  { envKey: "JELLYFIN_NOTIFY_SEASONS",   emoji: "📀", color: "#17b8c4", label: "Staffel" },
  Episode: { envKey: "JELLYFIN_NOTIFY_EPISODES",  emoji: "▶️",  color: "#17b8c4", label: "Episode" },
};

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

  logger.info(`[Jellyfin Poller] Starting – polling every ${intervalSec}s`);

  // Seed poll: mark existing items as seen without sending notifications
  seedPoll(apiKey, baseUrl).then(() => {
    initialized = true;
    logger.info("[Jellyfin Poller] ✅ Seed poll complete – watching for new items");
    pollerTimer = setInterval(() => poll(client, apiKey, baseUrl), intervalSec * 1000);
  }).catch((err) => {
    logger.error("[Jellyfin Poller] Seed poll failed:", err.message);
    // Still start regular polling so we recover when Jellyfin comes back
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
  logger.info("[Jellyfin Poller] Stopped");
}

// ─── Seed & Poll ──────────────────────────────────────────────────────────────

/**
 * Fetch current items and mark them as seen – no Discord notification.
 * Prevents flooding when the bot starts or restarts.
 */
async function seedPoll(apiKey, baseUrl) {
  const items = await fetchLatestAdditions(apiKey, baseUrl, 100, "all");
  let count = 0;
  for (const item of items) {
    deduplicator.checkAndRecord(item.Id);
    count++;
  }
  logger.info(`[Jellyfin Poller] Seeded ${count} items as already seen (no notifications)`);
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

  try {
    const items = await fetchLatestAdditions(apiKey, baseUrl, 50, "all");
    const newItems = [];

    for (const item of items) {
      if (deduplicator.checkAndRecord(item.Id)) continue;
      newItems.push(item);
    }

    logger.debug(`[Jellyfin Poller] Poll: ${items.length} fetched, ${newItems.length} new`);

    if (newItems.length === 0) return;

    logger.info(`[Jellyfin Poller] Found ${newItems.length} new item(s)`);

    // Load library map once for all new items
    const { libraries, libraryIdMap } = await fetchLibraryMap().catch(() => ({ libraries: [], libraryIdMap: new Map() }));
    const libraryMap = new Map();
    for (const lib of libraries) {
      libraryMap.set(lib.CollectionId, lib);
      if (lib.ItemId !== lib.CollectionId) libraryMap.set(lib.ItemId, lib);
    }
    const libraryChannels = getLibraryChannels();

    for (const item of newItems) {
      await notifyItem(client, item, apiKey, baseUrl, libraryMap, libraryIdMap, libraryChannels).catch((err) =>
        logger.error(`[Jellyfin Poller] Error notifying "${item.Name}": ${err.message}`)
      );
    }
  } catch (err) {
    logger.error("[Jellyfin Poller] Poll error:", err.message);
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
  const imdbId  = item.ProviderIds?.Imdb  || item.ProviderIds?.imdb  || null;
  const tmdbType = itemType === "Movie" ? "movie" : "tv";

  // Cross-webhook dedup: skip if Seerr already sent MEDIA_AVAILABLE for this TMDB ID
  if (tmdbId && wasRecentlyNotified(tmdbType, tmdbId)) {
    logger.debug(`[Jellyfin Poller] Skipping "${item.Name}" – already notified via Seerr webhook`);
    return;
  }

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
  const buttons = buildButtons(item, itemType, imdbId, baseUrl);

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
  if (year) title += ` (${year})`;

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
        params: { api_key: process.env.TMDB_API_KEY, append_to_response: "images" },
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

function buildButtons(item, itemType, imdbId, baseUrl) {
  const components = [];
  const serverId = process.env.JELLYFIN_SERVER_ID || "";
  const jfBase = (baseUrl || "").replace(/\/$/, "");

  if (process.env.EMBED_SHOW_BUTTON_WATCH !== "false" && jfBase && item.Id) {
    const watchUrl = `${jfBase}/web/index.html#!/details?id=${item.Id}&serverId=${serverId}`;
    if (isValidUrl(watchUrl)) {
      components.push(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Jetzt ansehen").setURL(watchUrl)
      );
    }
  }

  if (process.env.EMBED_SHOW_BUTTON_IMDB !== "false" && imdbId) {
    const imdbUrl = `https://www.imdb.com/title/${imdbId}/`;
    if (isValidUrl(imdbUrl)) {
      components.push(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("IMDb").setURL(imdbUrl)
      );
    }
  }

  if (process.env.EMBED_SHOW_BUTTON_LETTERBOXD !== "false" && imdbId && itemType === "Movie") {
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
