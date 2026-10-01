/**
 * Subscription poller — DMs subscribers when a new season of a series they
 * subscribed to appears in Jellyfin. Season count comes from Jellyfin (the user
 * chose "available in library" semantics), compared against the baseline stored
 * at subscribe time.
 *
 * Disabled unless SUBSCRIPTION_POLL_INTERVAL_MINUTES > 0. Default 60.
 */

import { allSeries, updateSeasonCount } from "../utils/subscriptionStore.js";
import { countSeriesSeasonsInJellyfin } from "../api/jellyfin.js";
import { t } from "../utils/botStrings.js";
import logger from "../utils/logger.js";
import { botState } from "./botState.js";

let pollerTimer = null;

/**
 * One pass over all subscriptions: DM + bump baseline where the Jellyfin season
 * count exceeds the stored one. Best-effort per subscription.
 */
export async function checkNewSeasons(client) {
  if (!client) return;
  const apiKey = process.env.JELLYFIN_API_KEY;
  const baseUrl = process.env.JELLYFIN_BASE_URL;
  if (!apiKey || !baseUrl) return;

  for (const sub of allSeries()) {
    try {
      const current = await countSeriesSeasonsInJellyfin(sub.tmdbId, apiKey, baseUrl);
      if (current == null || current <= sub.seasonCount) continue;

      const user = await client.users.fetch(sub.discordUserId);
      await user.send(t("subscribe_new_season_dm", { title: sub.title || `TMDB ${sub.tmdbId}`, season: current }));
      updateSeasonCount(sub.discordUserId, sub.tmdbId, current);
      logger.info(`[Subscriptions] New season ${current} of "${sub.title}" → DM to ${sub.discordUserId}`);
    } catch (err) {
      logger.warn(`[Subscriptions] check failed for "${sub.title}" (${sub.tmdbId}): ${err.message}`);
    }
  }
}

export function startSubscriptionPoller() {
  stopSubscriptionPoller();
  const minutes = parseInt(process.env.SUBSCRIPTION_POLL_INTERVAL_MINUTES || "60", 10);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    logger.info("[Subscriptions] Poller disabled (SUBSCRIPTION_POLL_INTERVAL_MINUTES=0)");
    return;
  }
  logger.info(`[Subscriptions] Poller starting — every ${minutes} min`);
  pollerTimer = setInterval(() => {
    checkNewSeasons(botState.discordClient).catch((err) =>
      logger.warn(`[Subscriptions] Poll error: ${err.message}`)
    );
  }, minutes * 60 * 1000);
  if (typeof pollerTimer.unref === "function") pollerTimer.unref();
}

export function stopSubscriptionPoller() {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
  }
}
