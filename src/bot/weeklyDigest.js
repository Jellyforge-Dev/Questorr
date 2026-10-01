/**
 * Weekly "new in the library" digest — opt-in via DIGEST_ENABLED. On a weekly
 * cron, posts an embed listing movies and series added in the last 7 days to a
 * channel (DIGEST_CHANNEL_ID, falling back to JELLYFIN_CHANNEL_ID).
 *
 * When nothing was added that week, no message is posted (silent skip).
 * Scheduling reuses the weekly-recommendation cron pattern.
 */

import { EmbedBuilder } from "discord.js";
import { fetchItemsAddedSince } from "../api/jellyfin.js";
import { t } from "../utils/botStrings.js";
import logger from "../utils/logger.js";
import { botState } from "./botState.js";

const WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

let digestTimer = null;

/** Reduce raw Jellyfin items to recent movies/series since `sinceMs`. Pure. */
export function buildDigestSummary(items, sinceMs) {
  const movies = [];
  const series = [];
  const newSeriesNames = new Set();
  const episodeCounts = new Map(); // SeriesName -> count, insertion order preserved

  for (const item of items || []) {
    const created = Date.parse(item.DateCreated || "");
    if (!Number.isFinite(created) || created < sinceMs) continue;
    if (item.Type === "Movie") {
      movies.push({ title: item.Name || "Unknown", year: item.ProductionYear || null });
    } else if (item.Type === "Series") {
      const title = item.Name || "Unknown";
      series.push({ title, year: item.ProductionYear || null });
      newSeriesNames.add(title);
    } else if (item.Type === "Episode" && item.SeriesName) {
      episodeCounts.set(item.SeriesName, (episodeCounts.get(item.SeriesName) || 0) + 1);
    }
  }

  // New episodes only count for series that aren't brand-new themselves
  // (a new series is already represented in the series section).
  const episodes = [...episodeCounts.entries()]
    .filter(([title]) => !newSeriesNames.has(title))
    .map(([title, count]) => ({ title, count }));

  return { movies, series, episodes };
}

function formatList(entries) {
  return entries.map((e) => `• ${e.title}${e.year ? ` (${e.year})` : ""}`).join("\n");
}

function formatEpisodeList(entries) {
  return entries.map((e) => `• ${e.title} — ${e.count} ${t("digest_episodes_word")}`).join("\n");
}

/** Build the digest embed, or null when there is nothing to report. */
export function buildDigestEmbed(summary) {
  const episodes = summary.episodes || [];
  if (summary.movies.length === 0 && summary.series.length === 0 && episodes.length === 0) return null;
  const embed = new EmbedBuilder()
    .setTitle(t("digest_title"))
    .setColor(0x5865f2)
    .setTimestamp(new Date());
  if (summary.movies.length > 0) {
    embed.addFields({ name: t("digest_movies"), value: formatList(summary.movies).slice(0, 1024) });
  }
  if (summary.series.length > 0) {
    embed.addFields({ name: t("digest_series"), value: formatList(summary.series).slice(0, 1024) });
  }
  if (episodes.length > 0) {
    embed.addFields({ name: t("digest_episodes"), value: formatEpisodeList(episodes).slice(0, 1024) });
  }
  return embed;
}

/**
 * Post the weekly digest. Returns a diagnostic result so the scheduler and the
 * dashboard "test" button can report exactly what happened:
 *   { posted, reason, enabled, movies, series, channelId, error? }
 * reason ∈ no-client | disabled | empty | no-channel | channel-invalid |
 *          send-failed | posted
 *
 * @param {object} opts
 * @param {boolean} opts.force  Run even when DIGEST_ENABLED is off (manual test).
 */
export async function sendWeeklyDigest(client, { force = false } = {}) {
  if (!client) return { posted: false, reason: "no-client" };
  const enabled = String(process.env.DIGEST_ENABLED).toLowerCase() === "true";
  if (!enabled && !force) return { posted: false, reason: "disabled", enabled };

  const sinceMs = Date.now() - WINDOW_MS;
  const items = await fetchItemsAddedSince(process.env.JELLYFIN_API_KEY, process.env.JELLYFIN_BASE_URL, {
    maxPages: 5,
  });
  // Diagnostics so "nothing new" is explainable: how many items Jellyfin
  // returned, how many fall inside the 7-day window (any type), and how many of
  // those are whole movies/series (episodes/seasons are intentionally excluded).
  const fetched = Array.isArray(items) ? items.length : 0;
  const inWindowAll = (items || []).filter((i) => {
    const c = Date.parse(i.DateCreated || "");
    return Number.isFinite(c) && c >= sinceMs;
  }).length;
  const summary = buildDigestSummary(items, sinceMs);
  const movies = summary.movies.length;
  const series = summary.series.length;
  const updatedSeries = summary.episodes.length;
  const stats = { fetched, inWindowAll, movies, series, updatedSeries };
  const embed = buildDigestEmbed(summary);
  if (!embed) {
    logger.info(`[Digest] Nothing to post — fetched ${fetched}, ${inWindowAll} added in last 7d, ${movies} movies + ${series} series + ${updatedSeries} updated series qualify`);
    return { posted: false, reason: "empty", enabled, ...stats };
  }

  const channelId = process.env.DIGEST_CHANNEL_ID || process.env.JELLYFIN_CHANNEL_ID;
  if (!channelId) {
    logger.warn("[Digest] No channel configured (DIGEST_CHANNEL_ID / JELLYFIN_CHANNEL_ID) — skipping");
    return { posted: false, reason: "no-channel", enabled, ...stats };
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased?.()) {
      logger.warn(`[Digest] Channel ${channelId} not text-based — skipping`);
      return { posted: false, reason: "channel-invalid", enabled, ...stats, channelId };
    }
    await channel.send({ embeds: [embed] });
    logger.info(`[Digest] Posted weekly digest (${movies} movies, ${series} series, ${updatedSeries} updated series)`);
    return { posted: true, reason: "posted", enabled, ...stats, channelId };
  } catch (err) {
    logger.warn(`[Digest] Failed to post: ${err.message}`);
    return { posted: false, reason: "send-failed", enabled, ...stats, channelId, error: err.message };
  }
}

function msUntilNextWeekday(targetDay, hour, minute) {
  const now = new Date();
  const next = new Date(now);
  const currentDay = now.getDay();
  const daysAhead = (targetDay - currentDay + 7) % 7;
  next.setDate(now.getDate() + daysAhead);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 7);
  return next.getTime() - now.getTime();
}

export function scheduleWeeklyDigest(client) {
  if (digestTimer) {
    clearTimeout(digestTimer);
    digestTimer = null;
  }
  if (String(process.env.DIGEST_ENABLED).toLowerCase() !== "true") {
    logger.info("[Digest] Disabled (DIGEST_ENABLED) — not scheduled");
    return;
  }
  const dayName = (process.env.DIGEST_DAY || "monday").toLowerCase();
  const targetDay = WEEKDAYS[dayName];
  if (targetDay === undefined) {
    logger.warn(`[Digest] Invalid DIGEST_DAY "${dayName}" — not scheduled`);
    return;
  }
  const [h, m] = (process.env.DIGEST_TIME || "09:00").split(":").map((n) => parseInt(n, 10));

  const scheduleNext = () => {
    const delay = msUntilNextWeekday(targetDay, h || 9, m || 0);
    digestTimer = setTimeout(async () => {
      await sendWeeklyDigest(botState.discordClient).catch((err) =>
        logger.warn(`[Digest] run error: ${err.message}`)
      );
      scheduleNext();
    }, delay);
    if (typeof digestTimer.unref === "function") digestTimer.unref();
  };
  scheduleNext();
  logger.info(`[Digest] Scheduled for ${dayName} ${process.env.DIGEST_TIME || "09:00"}`);
}

export function stopWeeklyDigest() {
  if (digestTimer) {
    clearTimeout(digestTimer);
    digestTimer = null;
  }
}
