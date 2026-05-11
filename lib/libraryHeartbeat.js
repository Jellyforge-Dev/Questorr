/**
 * Library Heartbeat — periodic background cache of Jellyfin library counts.
 *
 * The /stats/insights dashboard endpoint calls fetchLibrarySummary() live on every
 * load, which makes a round-trip to Jellyfin and can be slow on large libraries.
 * This module pre-warms a file-based cache (config/library-counts.json) so the
 * stats page reads instantly from disk instead of waiting for a live API call.
 *
 * Configuration:
 *   LIBRARY_HEARTBEAT_INTERVAL_MINUTES  (default: 15, 0 = disabled)
 */

import { writeFileSync, readFileSync, existsSync } from "fs";
import path from "path";
import logger from "../utils/logger.js";
import { CONFIG_PATH } from "../utils/configFile.js";

const CACHE_FILE = path.join(path.dirname(CONFIG_PATH), "library-counts.json");
const DEFAULT_INTERVAL_MINUTES = 15;

let _heartbeatTimer = null;

/**
 * Read the most recently cached library summary from disk.
 * Returns null if the cache file does not exist or is unreadable.
 * @returns {{ movies: number, series: number, totalRuntimeMinutes: number, topGenres: Array, cachedAt: string }|null}
 */
export function getLibraryCounts() {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    return JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
  } catch {
    return null;
  }
}

async function runHeartbeat() {
  const jfKey = process.env.JELLYFIN_API_KEY;
  const jfBase = process.env.JELLYFIN_BASE_URL;
  if (!jfKey || !jfBase) return;

  try {
    const { fetchLibrarySummary } = await import("../api/jellyfin.js");
    const summary = await fetchLibrarySummary(jfKey, jfBase);
    const data = { ...summary, cachedAt: new Date().toISOString() };
    writeFileSync(CACHE_FILE, JSON.stringify(data), "utf-8");
    logger.debug(`[Library Heartbeat] Cached: movies=${summary.movies}, series=${summary.series}`);
  } catch (err) {
    logger.warn(`[Library Heartbeat] Failed to refresh library counts: ${err.message}`);
  }
}

/**
 * Start the periodic heartbeat. Safe to call multiple times — clears any
 * existing timer before starting a new one. Runs once immediately on start.
 */
export function startLibraryHeartbeat() {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }

  const intervalMinutes = parseInt(
    process.env.LIBRARY_HEARTBEAT_INTERVAL_MINUTES ?? String(DEFAULT_INTERVAL_MINUTES),
    10
  );
  if (isNaN(intervalMinutes) || intervalMinutes <= 0) {
    logger.info("[Library Heartbeat] Disabled (LIBRARY_HEARTBEAT_INTERVAL_MINUTES=0)");
    return;
  }

  // Populate the cache immediately so stats are available right after bot start.
  runHeartbeat();
  _heartbeatTimer = setInterval(runHeartbeat, intervalMinutes * 60 * 1000);
  logger.info(`[Library Heartbeat] Started – refreshing every ${intervalMinutes} min`);
}

/** Stop the heartbeat timer (called on bot stop). */
export function stopLibraryHeartbeat() {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
    logger.debug("[Library Heartbeat] Stopped");
  }
}
