/**
 * Questorr – Jellyfin Webhook Handler
 *
 * Receives ItemAdded notifications from the Jellyfin webhook plugin and routes
 * them to the correct Discord channel based on the library → channel mapping
 * configured in Step 4 (JELLYFIN_NOTIFICATION_LIBRARIES).
 *
 * This catches ALL newly added media – whether requested via Seerr/Questorr
 * or added directly to Jellyfin – and sends a rich Discord embed.
 *
 * Deduplication: when the Seerr webhook already sent a MEDIA_AVAILABLE
 * notification for a TMDB ID, the Jellyfin webhook skips it to avoid doubles.
 *
 * Setup in Jellyfin:
 *   1. Install the "Webhook" plugin (Jellyfin Plugin Repository)
 *   2. Add a Generic Destination pointing to:
 *        http://<questorr-host>:8282/jellyfin-webhook
 *   3. Set the Authorization header value to JELLYFIN_WEBHOOK_SECRET
 *   4. Enable the "Item Added" notification type
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
import { findLibraryByAncestors } from "../api/jellyfin.js";
import { findBestBackdrop } from "../api/tmdb.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const NOTIFY_TYPE_SETTINGS = {
  Movie:   { envKey: "JELLYFIN_NOTIFY_MOVIES",   emoji: "🎬", color: "#1ec8a0" },
  Series:  { envKey: "JELLYFIN_NOTIFY_SERIES",    emoji: "📺", color: "#1ec8a0" },
  Season:  { envKey: "JELLYFIN_NOTIFY_SEASONS",   emoji: "📀", color: "#17b8c4" },
  Episode: { envKey: "JELLYFIN_NOTIFY_EPISODES",  emoji: "▶️",  color: "#17b8c4" },
};

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function handleJellyfinWebhook(req, res, client) {
  if (res) res.status(200).send("OK");

  const data = req.body;
  if (!data || !data.NotificationType) {
    logger.debug("[JELLYFIN WEBHOOK] Missing NotificationType – skipping");
    return;
  }

  // Only handle ItemAdded
  if (data.NotificationType !== "ItemAdded") {
    logger.debug(`[JELLYFIN WEBHOOK] Ignoring event type: ${data.NotificationType}`);
    return;
  }

  if (!client || !client.isReady()) {
    logger.warn("[JELLYFIN WEBHOOK] Discord bot not ready – dropping ItemAdded event");
    return;
  }

  const itemType = data.ItemType;
  const itemId   = data.ItemId;
  const itemName = data.Name || "Unknown";

  const typeSettings = NOTIFY_TYPE_SETTINGS[itemType];
  if (!typeSettings) {
    logger.debug(`[JELLYFIN WEBHOOK] Skipping unsupported item type: ${itemType}`);
    return;
  }

  // Check per-type notify toggle
  if (process.env[typeSettings.envKey] !== "true") {
    logger.debug(`[JELLYFIN WEBHOOK] ${itemType} notifications disabled (${typeSettings.envKey})`);
    return;
  }

  // Dedup by Jellyfin item ID (prevents double-fire from plugin quirks)
  if (deduplicator.checkAndRecord(itemId)) {
    logger.debug(`[JELLYFIN WEBHOOK] Duplicate Jellyfin item ID ${itemId} – skipping`);
    return;
  }

  // Dedup by TMDB ID: skip if Seerr webhook already sent MEDIA_AVAILABLE for this item
  const tmdbId  = data.Provider_tmdb  || null;
  const imdbId  = data.Provider_imdb  || null;
  const tmdbType = (itemType === "Movie") ? "movie" : "tv";

  if (tmdbId && wasRecentlyNotified(tmdbType, tmdbId)) {
    logger.info(`[JELLYFIN WEBHOOK] TMDB ${tmdbType}/${tmdbId} already notified by Seerr webhook – skipping duplicate`);
    return;
  }

  logger.info(`[JELLYFIN WEBHOOK] ItemAdded: "${itemName}" (${itemType}, ID: ${itemId}, TMDB: ${tmdbId || "—"})`);

  const apiKey  = process.env.JELLYFIN_API_KEY;
  const baseUrl = process.env.JELLYFIN_BASE_URL;

  if (!apiKey || !baseUrl) {
    logger.warn("[JELLYFIN WEBHOOK] Jellyfin not configured – cannot process notification");
    return;
  }

  try {
    await processItemAdded(client, data, itemId, itemType, itemName, tmdbId, imdbId, tmdbType, typeSettings, apiKey, baseUrl);
  } catch (err) {
    logger.error(`[JELLYFIN WEBHOOK] Error processing ItemAdded for "${itemName}": ${err.message}`);
  }
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

async function processItemAdded(client, data, itemId, itemType, itemName, tmdbId, imdbId, tmdbType, typeSettings, apiKey, baseUrl) {
  const libraryChannels = getLibraryChannels();

  // Resolve library → channel
  let channelId = null;

  if (Object.keys(libraryChannels).length > 0) {
    try {
      const { libraries, libraryIdMap } = await fetchLibraryMap();

      const libraryMap = new Map();
      for (const lib of libraries) {
        libraryMap.set(lib.CollectionId, lib);
        if (lib.ItemId !== lib.CollectionId) libraryMap.set(lib.ItemId, lib);
      }

      const rawLibraryId = await findLibraryByAncestors(itemId, apiKey, baseUrl, libraryMap, itemType);

      if (rawLibraryId) {
        const configLibraryId = resolveConfigLibraryId(rawLibraryId, libraryIdMap);
        channelId = resolveTargetChannel(configLibraryId, libraryChannels);
        if (channelId) {
          logger.info(`[JELLYFIN WEBHOOK] ✅ Library ${configLibraryId} → channel ${channelId}`);
        } else {
          logger.info(`[JELLYFIN WEBHOOK] Library ${configLibraryId} not mapped – using fallback`);
        }
      } else {
        logger.warn(`[JELLYFIN WEBHOOK] Could not determine library for item ${itemId}`);
      }
    } catch (err) {
      logger.warn(`[JELLYFIN WEBHOOK] Library lookup failed: ${err.message}`);
    }
  }

  // Fallback to JELLYFIN_CHANNEL_ID
  if (!channelId) {
    channelId = process.env.JELLYFIN_CHANNEL_ID || null;
  }

  if (!channelId) {
    logger.info(`[JELLYFIN WEBHOOK] No channel configured for "${itemName}" – skipping`);
    return;
  }

  // Build embed
  const embed = await buildItemEmbed(data, itemType, itemName, tmdbId, imdbId, tmdbType, typeSettings, apiKey, baseUrl);
  const buttons = buildItemButtons(itemType, tmdbId, imdbId, itemId, apiKey, baseUrl);

  let channel;
  try {
    channel = await client.channels.fetch(channelId);
  } catch (err) {
    logger.error(`[JELLYFIN WEBHOOK] Cannot fetch Discord channel ${channelId}: ${err.message}`);
    return;
  }

  const msgOptions = { embeds: [embed] };
  if (buttons) msgOptions.components = [buttons];

  await channel.send(msgOptions);
  logger.info(`[JELLYFIN WEBHOOK] ✅ Sent notification for "${itemName}" to channel ${channelId}`);
}

// ─── Embed Builder ────────────────────────────────────────────────────────────

async function buildItemEmbed(data, itemType, itemName, tmdbId, imdbId, tmdbType, typeSettings, apiKey, baseUrl) {
  const year = data.Year || null;
  const seriesName = data.SeriesName || null;
  const seasonNumber = data.SeasonNumber || null;
  const episodeNumber = data.EpisodeNumber || null;

  let title = itemName;
  if (year) title += ` (${year})`;
  if (seriesName && (itemType === "Episode" || itemType === "Season")) {
    title = seriesName;
    if (seasonNumber) title += ` – S${String(seasonNumber).padStart(2, "0")}`;
    if (episodeNumber) title += `E${String(episodeNumber).padStart(2, "0")}`;
    if (itemType === "Episode" && itemName !== seriesName) title += `: ${itemName}`;
  }

  const embed = new EmbedBuilder()
    .setColor(typeSettings.color)
    .setAuthor({ name: `${typeSettings.emoji} New in Jellyfin` })
    .setTitle(title)
    .setTimestamp();

  const footerText = process.env.EMBED_FOOTER_TEXT;
  if (footerText) embed.setFooter({ text: footerText });

  // Fetch TMDB data for richer embed
  let tmdbData = null;
  if (tmdbId && process.env.TMDB_API_KEY) {
    try {
      const endpoint = tmdbType === "movie"
        ? `https://api.themoviedb.org/3/movie/${tmdbId}`
        : `https://api.themoviedb.org/3/tv/${tmdbId}`;
      const res = await axios.get(endpoint, {
        params: { api_key: process.env.TMDB_API_KEY, append_to_response: "images" },
        timeout: 8000,
      });
      tmdbData = res.data;
    } catch (e) {
      logger.debug(`[JELLYFIN WEBHOOK] TMDB fetch failed for ${tmdbType}/${tmdbId}: ${e.message}`);
    }
  }

  // Poster
  if (tmdbData?.poster_path) {
    embed.setThumbnail(`https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`);
  }

  // Backdrop
  if (tmdbData) {
    const backdropPath = findBestBackdrop(tmdbData);
    if (backdropPath) {
      embed.setImage(`https://image.tmdb.org/t/p/w1280${backdropPath}`);
    }
  }

  // Overview
  let overview = tmdbData?.overview || data.Overview || null;
  if (overview) {
    if (overview.length > 350) overview = overview.substring(0, 347) + "...";
    embed.setDescription(overview);
  }

  // Fields
  const fields = [];
  const mediaLabel = itemType === "Movie" ? "Film" : itemType;
  fields.push({ name: "Typ", value: `${typeSettings.emoji} ${mediaLabel}`, inline: true });

  const genres = tmdbData?.genres?.map((g) => g.name).join(", ")
              || (Array.isArray(data.Genres) ? data.Genres.join(", ") : null);
  if (genres) fields.push({ name: "Genre", value: genres, inline: true });

  if (tmdbData?.vote_average) {
    fields.push({ name: "Bewertung", value: `⭐ ${tmdbData.vote_average.toFixed(1)}/10`, inline: true });
  }

  if (fields.length > 0) embed.addFields(...fields);

  return embed;
}

// ─── Button Builder ───────────────────────────────────────────────────────────

function buildItemButtons(itemType, tmdbId, imdbId, itemId, apiKey, baseUrl) {
  const components = [];
  const serverId = process.env.JELLYFIN_SERVER_ID || "";
  const jfBase = (baseUrl || "").replace(/\/$/, "");

  // Watch Now on Jellyfin
  if (process.env.EMBED_SHOW_BUTTON_WATCH !== "false" && jfBase && itemId) {
    const watchUrl = `${jfBase}/web/index.html#!/details?id=${itemId}&serverId=${serverId}`;
    if (isValidUrl(watchUrl)) {
      components.push(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("Jetzt ansehen")
          .setURL(watchUrl)
      );
    }
  }

  // IMDb
  if (process.env.EMBED_SHOW_BUTTON_IMDB !== "false" && imdbId) {
    const imdbUrl = `https://www.imdb.com/title/${imdbId}/`;
    if (isValidUrl(imdbUrl)) {
      components.push(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("IMDb").setURL(imdbUrl)
      );
    }
  }

  // Letterboxd – movies only
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
