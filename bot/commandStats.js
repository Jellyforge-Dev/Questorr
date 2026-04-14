/**
 * Command usage statistics tracker.
 * Tracks per-command and per-user usage counts.
 * Persisted to disk so stats survive restarts.
 */

import fs from "fs";
import path from "path";
import logger from "../utils/logger.js";

const STATS_PATH = path.join(process.cwd(), "config", "command-stats.json");

// { commands: { search: 42, request: 15 }, users: { "123456": { username: "Gasi", total: 10, commands: { search: 5, request: 5 } } } }
let stats = { commands: {}, users: {} };

/** Load stats from disk */
export function loadCommandStats() {
  try {
    if (fs.existsSync(STATS_PATH)) {
      const raw = fs.readFileSync(STATS_PATH, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        stats = { commands: parsed.commands || {}, users: parsed.users || {} };
        logger.info(`✅ Loaded command stats (${Object.values(stats.commands).reduce((a, b) => a + b, 0)} total commands tracked)`);
      }
    }
  } catch (err) {
    logger.warn("Failed to load command stats:", err.message);
  }
}

/** Save stats to disk */
function saveStats() {
  try {
    fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2), "utf8");
  } catch (err) {
    logger.debug("Failed to save command stats:", err.message);
  }
}

// Debounce saves — write at most every 30 seconds
let saveTimeout = null;
function debouncedSave() {
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    saveStats();
    saveTimeout = null;
  }, 30_000);
  if (saveTimeout.unref) saveTimeout.unref();
}

/**
 * Record a command usage.
 * @param {string} commandName - e.g. "search", "request", "status", "random", "trending"
 * @param {string} userId - Discord user ID
 * @param {string} username - Discord username (for display)
 * @param {string} [avatarUrl] - Discord avatar URL
 */
export function trackCommand(commandName, userId, username, avatarUrl) {
  // Per-command totals
  stats.commands[commandName] = (stats.commands[commandName] || 0) + 1;

  // Per-user tracking
  if (!stats.users[userId]) {
    stats.users[userId] = { username, total: 0, commands: {} };
  }
  const user = stats.users[userId];
  user.username = username; // Update in case they changed it
  if (avatarUrl) user.avatarUrl = avatarUrl; // Keep avatar current
  user.total++;
  user.commands[commandName] = (user.commands[commandName] || 0) + 1;

  debouncedSave();
}

/**
 * Get stats summary for the widget/API.
 * @returns {{ commands: Object, topUsers: Array, totalCommands: number }}
 */
export function getCommandStats() {
  const totalCommands = Object.values(stats.commands).reduce((a, b) => a + b, 0);

  // Top 10 users by total usage
  const topUsers = Object.entries(stats.users)
    .map(([id, data]) => ({
      userId: id,
      username: data.username,
      avatarUrl: data.avatarUrl || null,
      total: data.total,
      commands: data.commands,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return {
    commands: { ...stats.commands },
    topUsers,
    totalCommands,
  };
}

/** Reset all command stats and persist to disk */
export function resetCommandStats() {
  stats = { commands: {}, users: {} };
  saveStats();
  logger.info("[Command Stats] 🗑️ Stats reset");
}

/** Reset stats (for testing) */
export function _resetStatsForTest() {
  stats = { commands: {}, users: {} };
}

// Load on import
loadCommandStats();
