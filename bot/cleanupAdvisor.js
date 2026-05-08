/**
 * Questorr — Cleanup Advisor
 *
 * Posts a weekly admin-channel embed listing movies that haven't been
 * watched in a long time, helping admins free up disk space.
 *
 * Filter criteria (all configurable):
 *   - Item must be in library at least CLEANUP_MIN_AGE_DAYS days
 *   - PlayCount must be ≤ CLEANUP_MAX_PLAYCOUNT
 *   - If ever played, last play must be older than CLEANUP_MIN_DAYS_SINCE_PLAYED
 *
 * Schedule: setTimeout-based, fires on the next configured weekday/HH:MM,
 * then reschedules. Pattern follows bot/dailyPick.js.
 *
 * Movies only — series PlayCount aggregation is unreliable.
 */

import { EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { t } from "../utils/botStrings.js";
import { fetchUnwatchedAggregateItems } from "../api/jellyfin.js";
import { buildJellyfinUrl } from "./helpers.js";

let cleanupTimer = null;

const WEEKDAYS = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

/** ms until next occurrence of the given weekday + HH:MM. */
function msUntilNextWeekday(targetDay, hour, minute) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  const currentDay = now.getDay();
  let daysAhead = (targetDay - currentDay + 7) % 7;
  // If it's the same day but the time has already passed, schedule for next week
  if (daysAhead === 0 && next <= now) daysAhead = 7;
  next.setDate(next.getDate() + daysAhead);
  return next - now;
}

export function scheduleCleanupAdvisor(client) {
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }

  if (process.env.CLEANUP_ADVISOR_ENABLED !== "true") {
    logger.info("[Cleanup Advisor] Disabled");
    return;
  }

  const channelId = process.env.CLEANUP_ADVISOR_CHANNEL_ID;
  if (!channelId) {
    logger.warn("[Cleanup Advisor] Enabled but no channel configured. Skipping.");
    return;
  }

  const dayName = (process.env.CLEANUP_ADVISOR_DAY || "sunday").toLowerCase();
  const targetDay = WEEKDAYS[dayName];
  if (targetDay === undefined) {
    logger.warn(`[Cleanup Advisor] Invalid day "${dayName}". Use monday…sunday.`);
    return;
  }

  const timeStr = (process.env.CLEANUP_ADVISOR_TIME || "09:00").trim();
  const m = timeStr.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) {
    logger.warn(`[Cleanup Advisor] Invalid time "${timeStr}". Use HH:MM (24h).`);
    return;
  }
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);

  const reschedule = () => {
    const delay = msUntilNextWeekday(targetDay, hour, minute);
    const hours = Math.round(delay / 3600000);
    logger.info(`[Cleanup Advisor] Next run: ${dayName} at ${timeStr} (in ~${hours}h)`);
    cleanupTimer = setTimeout(async () => {
      await runCleanupAdvisor(client).catch((err) =>
        logger.error(`[Cleanup Advisor] Run failed: ${err.message}`)
      );
      reschedule();
    }, delay);
    if (typeof cleanupTimer.unref === "function") cleanupTimer.unref();
  };

  reschedule();
}

export function stopCleanupAdvisor() {
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }
}

// Discord embed limits (discord.js validates against these and throws an
// "AggregateError: Received one or more errors" if exceeded).
const EMBED_DESCRIPTION_MAX = 4000; // 4096 hard limit, leave headroom
const EMBED_FOOTER_MAX = 2000;

/**
 * Execute one cleanup advisor run. Can be called manually via the test button.
 * Returns { posted: boolean, count: number, message?: string } for the test endpoint.
 */
export async function runCleanupAdvisor(client) {
  try {
    return await runCleanupAdvisorInner(client);
  } catch (err) {
    // Re-log with full stack — the parent catches only err.message and we
    // were getting useless "Received one or more errors" without context.
    logger.error("[Cleanup Advisor] runtime error:", err?.stack || err);
    if (err?.errors) {
      for (const sub of err.errors) {
        logger.error("[Cleanup Advisor] sub-error:", sub?.message || sub);
      }
    }
    throw err;
  }
}

async function runCleanupAdvisorInner(client) {
  const apiKey = process.env.JELLYFIN_API_KEY;
  const baseUrl = process.env.JELLYFIN_BASE_URL;
  const channelId = process.env.CLEANUP_ADVISOR_CHANNEL_ID;

  if (!apiKey || !baseUrl) {
    return { posted: false, count: 0, message: "Jellyfin not configured" };
  }
  if (!channelId) {
    return { posted: false, count: 0, message: "Channel not configured" };
  }

  // Read & validate thresholds
  const minAgeDays = parseInt(process.env.CLEANUP_MIN_AGE_DAYS || "365", 10);
  const maxPlayCount = parseInt(process.env.CLEANUP_MAX_PLAYCOUNT || "1", 10);
  const minDaysSincePlayed = parseInt(process.env.CLEANUP_MIN_DAYS_SINCE_PLAYED || "180", 10);
  const maxResults = Math.max(0, Math.min(50, parseInt(process.env.CLEANUP_MAX_RESULTS || "25", 10)));

  const now = Date.now();
  const minAgeMs = minAgeDays * 86400000;
  const minSincePlayedMs = minDaysSincePlayed * 86400000;

  logger.info(`[Cleanup Advisor] Running (minAge=${minAgeDays}d, maxPlay=${maxPlayCount}, sincePlayed=${minDaysSincePlayed}d, max=${maxResults})`);

  const items = await fetchUnwatchedAggregateItems(apiKey, baseUrl, { limit: 5000 });
  logger.info(`[Cleanup Advisor] Fetched ${items.length} candidate items from Jellyfin`);

  // Diagnostic counters — surface in logs why the funnel may collapse
  let skipNoCreated = 0, skipTooYoung = 0, skipPlayCount = 0, skipPlayedRecently = 0;

  // Filter
  const candidates = [];
  for (const item of items) {
    const created = item.DateCreated ? new Date(item.DateCreated).getTime() : 0;
    if (!created) { skipNoCreated++; continue; }
    if (now - created < minAgeMs) { skipTooYoung++; continue; }

    const playCount = item.UserData?.PlayCount ?? 0;
    if (playCount > maxPlayCount) { skipPlayCount++; continue; }

    const lastPlayed = item.UserData?.LastPlayedDate
      ? new Date(item.UserData.LastPlayedDate).getTime()
      : null;
    if (lastPlayed && now - lastPlayed < minSincePlayedMs) { skipPlayedRecently++; continue; }

    const sizeBytes = item.MediaSources?.[0]?.Size ?? null;

    candidates.push({
      id: item.Id,
      name: item.Name,
      year: item.ProductionYear || null,
      created,
      playCount,
      lastPlayed,
      sizeBytes,
    });
  }

  logger.info(
    `[Cleanup Advisor] Filter funnel: ${items.length} fetched → ${candidates.length} candidates ` +
    `(skipped: no-DateCreated=${skipNoCreated}, too-young=${skipTooYoung}, ` +
    `playCount>${maxPlayCount}=${skipPlayCount}, played<${minDaysSincePlayed}d=${skipPlayedRecently})`
  );

  // Sort: never-played first, then oldest-played, then largest size as tiebreak
  candidates.sort((a, b) => {
    if (!a.lastPlayed && b.lastPlayed) return -1;
    if (a.lastPlayed && !b.lastPlayed) return 1;
    if (a.lastPlayed && b.lastPlayed) return a.lastPlayed - b.lastPlayed;
    return (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0);
  });

  const top = candidates.slice(0, maxResults);
  const totalSizeGb = top.reduce((sum, c) => sum + (c.sizeBytes ?? 0), 0) / 1e9;

  // Fetch channel
  let channel;
  try {
    channel = await client.channels.fetch(channelId);
  } catch (err) {
    logger.error(`[Cleanup Advisor] Cannot fetch channel ${channelId}: ${err.message}`);
    return { posted: false, count: 0, message: `Channel fetch failed: ${err.message}` };
  }

  // Build embed
  const embed = new EmbedBuilder()
    .setColor("#e07a3a")
    .setAuthor({ name: t("cleanup_title") })
    .setTimestamp();

  if (top.length === 0) {
    embed.setDescription(t("cleanup_no_candidates"));
  } else {
    const formatDate = (ms) => {
      if (!ms) return t("cleanup_never_played");
      const d = new Date(ms);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const lines = top.map((c) => {
      const sizeStr = c.sizeBytes ? `${(c.sizeBytes / 1e9).toFixed(2)} GB` : "—";
      const yearStr = c.year ? ` (${c.year})` : "";
      const link = buildJellyfinUrl(c.id);
      const titleStr = link ? `[${c.name}${yearStr}](${link})` : `${c.name}${yearStr}`;
      return t("cleanup_item_line", {
        title: titleStr,
        plays: c.playCount,
        last: formatDate(c.lastPlayed),
        size: sizeStr,
      });
    });
    // Build the description, dropping lines from the bottom if we'd exceed
    // Discord's 4096-char description limit. Better to truncate than crash.
    const subtitle = t("cleanup_subtitle");
    let description = `${subtitle}\n\n${lines.join("\n")}`;
    if (description.length > EMBED_DESCRIPTION_MAX) {
      const overflowMarker = `\n… (${lines.length} items, truncated)`;
      let kept = lines.length;
      while (kept > 0) {
        const candidate = `${subtitle}\n\n${lines.slice(0, kept).join("\n")}${overflowMarker}`;
        if (candidate.length <= EMBED_DESCRIPTION_MAX) { description = candidate; break; }
        kept--;
      }
      if (kept === 0) description = `${subtitle}${overflowMarker}`.slice(0, EMBED_DESCRIPTION_MAX);
      logger.warn(`[Cleanup Advisor] Description truncated: ${lines.length} → ${kept} lines (limit ${EMBED_DESCRIPTION_MAX} chars)`);
    }
    embed.setDescription(description);

    const footerText = t("cleanup_total_storage", {
      count: top.length,
      size: totalSizeGb.toFixed(2),
    }).slice(0, EMBED_FOOTER_MAX);
    embed.setFooter({ text: footerText });
  }

  try {
    await channel.send({ embeds: [embed] });
  } catch (sendErr) {
    logger.error(`[Cleanup Advisor] channel.send failed: ${sendErr?.message || sendErr}`);
    if (sendErr?.rawError) {
      logger.error("[Cleanup Advisor] Discord rawError:", JSON.stringify(sendErr.rawError));
    }
    return { posted: false, count: 0, message: `Discord send failed: ${sendErr?.message || sendErr}` };
  }
  logger.info(`[Cleanup Advisor] Posted: ${top.length} candidates, ${totalSizeGb.toFixed(2)} GB total`);

  return { posted: true, count: top.length, totalSizeGb: Number(totalSizeGb.toFixed(2)) };
}
