/**
 * Weekly recommendation DM — opt-in via /subscribe weekly. On a weekly cron,
 * each opted-in user gets a personalised recommendation DM derived from their
 * Jellyfin watch history (the /foryou approach, slimmed for a text DM).
 *
 * Only works for mapped users (watch history needs the Jellyfin user id).
 * Scheduling reuses the cleanup-advisor weekly pattern.
 */

import { getWeeklyUsers } from "../utils/subscriptionStore.js";
import { resolveJellyfinUserId, fetchUserRecentlyPlayed } from "../api/jellyfin.js";
import { tmdbGetSimilar } from "../api/tmdb.js";
import { getUserMappings } from "../utils/configFile.js";
import { getTmdbApiKey, getSeerrUrl, getSeerrApiKey } from "./helpers.js";
import { t } from "../utils/botStrings.js";
import logger from "../utils/logger.js";
import { botState } from "./botState.js";

const TYPE_FROM_JF = { Movie: "movie", Series: "tv" };
const WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

let recTimer = null;

function jfToSeed(item) {
  const tmdbId = item.ProviderIds?.Tmdb || item.ProviderIds?.tmdb || item.ProviderIds?.TheMovieDb;
  if (!tmdbId) return null;
  return { tmdbId: String(tmdbId), type: TYPE_FROM_JF[item.Type] || "movie" };
}

/** Build up to 5 recommendations for a user from their Jellyfin watch history. */
export async function buildRecommendationsForUser(discordUserId) {
  const jfUserId = await resolveJellyfinUserId(discordUserId, getUserMappings(), getSeerrUrl(), getSeerrApiKey());
  if (!jfUserId) return [];

  const watched = await fetchUserRecentlyPlayed(jfUserId, process.env.JELLYFIN_API_KEY, process.env.JELLYFIN_BASE_URL, 20);
  const seeds = (watched || [])
    .map(jfToSeed)
    .filter(Boolean)
    .sort(() => Math.random() - 0.5)
    .slice(0, 5);
  if (seeds.length === 0) return [];

  const watchedIds = new Set(seeds.map((s) => s.tmdbId));
  const tmdbKey = getTmdbApiKey();
  const recArrays = await Promise.all(seeds.map((s) => tmdbGetSimilar(s.tmdbId, s.type, tmdbKey).catch(() => [])));

  const agg = new Map(); // tmdbId -> { item, score }
  for (const arr of recArrays) {
    for (const rec of arr || []) {
      const id = String(rec.id);
      if (watchedIds.has(id)) continue;
      const cur = agg.get(id) || { item: rec, score: 0 };
      cur.score += (rec.vote_average || 0) + 5; // base so frequency matters
      agg.set(id, cur);
    }
  }
  return [...agg.values()].sort((a, b) => b.score - a.score).slice(0, 5).map((x) => x.item);
}

/** DM every opted-in user their weekly picks. Best-effort per user. */
export async function sendWeeklyRecommendations(client) {
  if (!client) return;
  for (const discordUserId of getWeeklyUsers()) {
    try {
      const recs = await buildRecommendationsForUser(discordUserId);
      if (recs.length === 0) continue;
      const lines = recs
        .map((r) => {
          const title = r.title || r.name || "Unknown";
          const date = r.release_date || r.first_air_date || "";
          const year = date ? ` (${date.slice(0, 4)})` : "";
          return `• ${title}${year}`;
        })
        .join("\n");
      const user = await client.users.fetch(discordUserId);
      await user.send(`**${t("subscribe_weekly_dm_title")}**\n${lines}`);
      logger.info(`[Weekly] Sent recommendations to ${discordUserId}`);
    } catch (err) {
      logger.warn(`[Weekly] Failed for ${discordUserId}: ${err.message}`);
    }
  }
}

function msUntilNextWeekday(targetDay, hour, minute) {
  const now = new Date();
  const next = new Date(now);
  const currentDay = now.getDay();
  let daysAhead = (targetDay - currentDay + 7) % 7;
  next.setDate(now.getDate() + daysAhead);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 7);
  return next.getTime() - now.getTime();
}

export function scheduleWeeklyRecommendation(client) {
  if (recTimer) {
    clearTimeout(recTimer);
    recTimer = null;
  }
  const dayName = (process.env.WEEKLY_RECOMMENDATION_DAY || "sunday").toLowerCase();
  const targetDay = WEEKDAYS[dayName];
  if (targetDay === undefined) {
    logger.warn(`[Weekly] Invalid WEEKLY_RECOMMENDATION_DAY "${dayName}" — not scheduled`);
    return;
  }
  const [h, m] = (process.env.WEEKLY_RECOMMENDATION_TIME || "18:00").split(":").map((n) => parseInt(n, 10));

  const scheduleNext = () => {
    const delay = msUntilNextWeekday(targetDay, h || 18, m || 0);
    recTimer = setTimeout(async () => {
      await sendWeeklyRecommendations(botState.discordClient).catch((err) =>
        logger.warn(`[Weekly] run error: ${err.message}`)
      );
      scheduleNext();
    }, delay);
    if (typeof recTimer.unref === "function") recTimer.unref();
  };
  scheduleNext();
  logger.info(`[Weekly] Recommendation scheduled for ${dayName} ${process.env.WEEKLY_RECOMMENDATION_TIME || "18:00"}`);
}
