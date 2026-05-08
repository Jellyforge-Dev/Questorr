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

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import logger from "../utils/logger.js";
import { t } from "../utils/botStrings.js";
import { fetchUnwatchedAggregateItems } from "../api/jellyfin.js";
import { buildJellyfinUrl } from "./helpers.js";

let cleanupTimer = null;

const WEEKDAYS = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

// ── Pagination session store ─────────────────────────────────────────────────
// Keyed by channelId → { candidates, page, pageSize, totalSizeGb, ts }
// Sessions expire after SESSION_TTL_MS (24 h).
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const cleanupSessions = new Map();

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [key, session] of cleanupSessions) {
    if (now - session.ts > SESSION_TTL_MS) cleanupSessions.delete(key);
  }
}

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
 * Build the cleanup embed for a given page.
 * @param {Array} candidates - All sorted candidates
 * @param {number} page - 0-based page index
 * @param {number} pageSize - Items per page
 * @returns {EmbedBuilder}
 */
function buildCleanupEmbed(candidates, page, pageSize) {
  const totalPages = Math.ceil(candidates.length / pageSize) || 1;
  const pageItems = candidates.slice(page * pageSize, (page + 1) * pageSize);
  const pageSizeGb = pageItems.reduce((sum, c) => sum + (c.sizeBytes ?? 0), 0) / 1e9;
  const totalSizeGb = candidates.reduce((sum, c) => sum + (c.sizeBytes ?? 0), 0) / 1e9;

  const embed = new EmbedBuilder()
    .setColor("#e07a3a")
    .setAuthor({ name: t("cleanup_title") })
    .setTimestamp();

  if (candidates.length === 0) {
    embed.setDescription(t("cleanup_no_candidates"));
    return embed;
  }

  const formatDate = (ms) => {
    if (!ms) return t("cleanup_never_played");
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const lines = pageItems.map((c) => {
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

  const subtitle = t("cleanup_subtitle");
  let description = `${subtitle}\n\n${lines.join("\n")}`;
  if (description.length > EMBED_DESCRIPTION_MAX) {
    const overflowMarker = `\n… (truncated)`;
    let kept = lines.length;
    while (kept > 0) {
      const candidate = `${subtitle}\n\n${lines.slice(0, kept).join("\n")}${overflowMarker}`;
      if (candidate.length <= EMBED_DESCRIPTION_MAX) { description = candidate; break; }
      kept--;
    }
    if (kept === 0) description = `${subtitle}${overflowMarker}`.slice(0, EMBED_DESCRIPTION_MAX);
  }
  embed.setDescription(description);

  const pageLabel = totalPages > 1 ? ` — Page ${page + 1}/${totalPages}` : "";
  const footerText = t("cleanup_total_storage", {
    count: candidates.length,
    size: totalSizeGb.toFixed(2),
  }) + pageLabel + (totalPages > 1 ? ` (${pageSizeGb.toFixed(2)} GB this page)` : "");
  embed.setFooter({ text: footerText.slice(0, EMBED_FOOTER_MAX) });

  return embed;
}

/**
 * Build the navigation button row for pagination.
 * Returns null if there is only one page.
 */
function buildNavRow(channelId, page, totalPages) {
  if (totalPages <= 1) return null;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cleanup_prev|${channelId}`)
      .setLabel("◀ Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`cleanup_next|${channelId}`)
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );
}

/**
 * Handle ◀ Prev / Next ▶ button interactions for cleanup pagination.
 * Called from bot/interactions.js.
 */
export async function handleCleanupPagination(interaction) {
  const [action, channelId] = interaction.customId.split("|");
  pruneExpiredSessions();

  const session = cleanupSessions.get(channelId);
  if (!session) {
    return interaction.reply({
      content: "⚠️ Session expired — please trigger a new cleanup run.",
      flags: 64,
    });
  }

  const { candidates, pageSize } = session;
  const totalPages = Math.ceil(candidates.length / pageSize) || 1;
  let newPage = session.page;

  if (action === "cleanup_next") newPage = Math.min(newPage + 1, totalPages - 1);
  else newPage = Math.max(newPage - 1, 0);

  session.page = newPage;

  const embed = buildCleanupEmbed(candidates, newPage, pageSize);
  const navRow = buildNavRow(channelId, newPage, totalPages);
  const components = navRow ? [navRow] : [];

  await interaction.update({ embeds: [embed], components });
}

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
  // CLEANUP_MAX_RESULTS now controls *items per page*, not the total shown
  const pageSize = Math.max(1, Math.min(25, parseInt(process.env.CLEANUP_MAX_RESULTS || "25", 10)));

  const now = Date.now();
  const minAgeMs = minAgeDays * 86400000;
  const minSincePlayedMs = minDaysSincePlayed * 86400000;

  logger.info(`[Cleanup Advisor] Running (minAge=${minAgeDays}d, maxPlay=${maxPlayCount}, sincePlayed=${minDaysSincePlayed}d, pageSize=${pageSize})`);

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

  // Fetch channel
  let channel;
  try {
    channel = await client.channels.fetch(channelId);
  } catch (err) {
    logger.error(`[Cleanup Advisor] Cannot fetch channel ${channelId}: ${err.message}`);
    return { posted: false, count: 0, message: `Channel fetch failed: ${err.message}` };
  }

  const totalPages = Math.ceil(candidates.length / pageSize) || 1;
  const embed = buildCleanupEmbed(candidates, 0, pageSize);
  const navRow = buildNavRow(channelId, 0, totalPages);
  const components = navRow ? [navRow] : [];

  let msg;
  try {
    msg = await channel.send({ embeds: [embed], components });
  } catch (sendErr) {
    logger.error(`[Cleanup Advisor] channel.send failed: ${sendErr?.message || sendErr}`);
    if (sendErr?.rawError) {
      logger.error("[Cleanup Advisor] Discord rawError:", JSON.stringify(sendErr.rawError));
    }
    return { posted: false, count: 0, message: `Discord send failed: ${sendErr?.message || sendErr}` };
  }

  // Store pagination session (pruning stale ones first)
  pruneExpiredSessions();
  cleanupSessions.set(channelId, {
    candidates,
    page: 0,
    pageSize,
    messageId: msg.id,
    ts: Date.now(),
  });

  const totalSizeGb = candidates.reduce((sum, c) => sum + (c.sizeBytes ?? 0), 0) / 1e9;
  logger.info(
    `[Cleanup Advisor] Posted: ${candidates.length} candidates across ${totalPages} page(s), ${totalSizeGb.toFixed(2)} GB total`
  );

  return { posted: true, count: candidates.length, totalSizeGb: Number(totalSizeGb.toFixed(2)) };
}
