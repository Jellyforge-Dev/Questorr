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
import { deduplicator } from "../jellyfin/libraryResolver.js";
import {
  fetchLibraryMap,
  getLibraryChannels,
  resolveConfigLibraryId,
  resolveTargetChannel,
} from "../jellyfin/libraryResolver.js";
import { findLibraryByAncestors, fetchLatestAdditions, fetchItemsAddedSince, seedAllItemIds, fetchItemDetails } from "../api/jellyfin.js";
import { findBestBackdrop } from "../api/tmdb.js";
import { CONFIG_PATH } from "../utils/configFile.js";

// ─── State ────────────────────────────────────────────────────────────────────

let pollerTimer = null;
let initialized = false;

// ─── Seen-set persistence ─────────────────────────────────────────────────────

const SEEN_ITEMS_FILE = path.join(path.dirname(CONFIG_PATH), "seen-items.json");
// If the saved file is older than this, treat it as stale and do a fresh seed.
const SEEN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

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
    return;
  }

  try {
    const total = await seedAllItemIds(apiKey, baseUrl, (items) => {
      for (const item of items) deduplicator.checkAndRecord(item.Id);
    });
    logger.info(`[Jellyfin Poller] Seeded ${total} items as already seen (no notifications)`);
  } catch (err) {
    logger.warn(`[Jellyfin Poller] Full seed failed (${err.message}) – falling back to top-100 seed`);
    const items = await fetchLatestAdditions(apiKey, baseUrl, 100, "all");
    for (const item of items) deduplicator.checkAndRecord(item.Id);
    logger.info(`[Jellyfin Poller] Seeded ${items.length} items (fallback, no notifications)`);
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

  try {
    const items = await fetchItemsAddedSince(apiKey, baseUrl);

    const newItems = [];
    for (const item of items) {
      if (deduplicator.checkAndRecord(item.Id)) {
        logger.debug(`[Jellyfin Poller] Already seen: "${item.Name}" (${item.Id})`);
        continue;
      }
      newItems.push(item);
    }

    logger.debug(`[Jellyfin Poller] Poll: ${items.length} fetched (top 200 by DateCreated), ${newItems.length} new`);

    deduplicator.cleanup();
    saveSeenItems();

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
  const tmdbType = itemType === "Movie" ? "movie" : "tv";

  // Cross-webhook dedup: skip if Seerr already sent MEDIA_AVAILABLE for this TMDB ID
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

  // Poller-specific toggles fall back to global EMBED_SHOW_BUTTON_* if not set
  const showWatch      = process.env.JELLYFIN_POLLER_SHOW_BUTTON_WATCH      ?? process.env.EMBED_SHOW_BUTTON_WATCH      ?? "true";
  const showImdb       = process.env.JELLYFIN_POLLER_SHOW_BUTTON_IMDB       ?? process.env.EMBED_SHOW_BUTTON_IMDB       ?? "true";
  const showLetterboxd = process.env.JELLYFIN_POLLER_SHOW_BUTTON_LETTERBOXD ?? process.env.EMBED_SHOW_BUTTON_LETTERBOXD ?? "true";

  if (showWatch !== "false" && jfBase && item.Id) {
    const watchUrl = `${jfBase}/web/index.html#!/details?id=${item.Id}&serverId=${serverId}`;
    if (isValidUrl(watchUrl)) {
      components.push(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Jetzt ansehen").setURL(watchUrl)
      );
    }
  }

  if (showImdb !== "false" && imdbId) {
    const imdbUrl = `https://www.imdb.com/title/${imdbId}/`;
    if (isValidUrl(imdbUrl)) {
      components.push(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("IMDb").setURL(imdbUrl)
      );
    }
  }

  if (showLetterboxd !== "false" && imdbId && itemType === "Movie") {
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
