/**
 * Central (re)scheduler for all config-driven cron jobs. Each underlying
 * scheduler clears its previous timer before arming a new one, so this is safe
 * to call repeatedly. Invoked on bot start and again after a config save, so
 * timing changes (digest/weekly/cleanup/daily/subscription) take effect without
 * a full bot restart.
 *
 * The Jellyfin/Seerr pollers are intentionally NOT included: startJellyfinPoller
 * performs a network seed poll on every start, which we don't want to trigger on
 * each config save. Those are handled directly in botManager.startBot.
 */

import { scheduleDailyRandomPick, scheduleDailyRecommendation } from "./dailyPick.js";
import { scheduleCleanupAdvisor } from "./cleanupAdvisor.js";
import { scheduleWeeklyRecommendation } from "./weeklyRecommendation.js";
import { scheduleWeeklyDigest } from "./weeklyDigest.js";
import { startSubscriptionPoller } from "./subscriptionPoller.js";
import logger from "../utils/logger.js";

export function rescheduleTimedJobs(client) {
  scheduleDailyRandomPick(client);
  scheduleDailyRecommendation(client);
  scheduleCleanupAdvisor(client);
  scheduleWeeklyRecommendation(client);
  scheduleWeeklyDigest(client);
  startSubscriptionPoller();
  logger.info("[Jobs] Timed cron jobs (re)scheduled from current config");
}
