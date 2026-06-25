/**
 * Cross-webhook deduplication.
 *
 * Both the Seerr webhook (MEDIA_AVAILABLE) and the Jellyfin poller (ItemAdded)
 * can fire for the same piece of media when it was requested via Seerr/Questorr.
 * This module keeps a persistent set of recently-notified TMDB IDs so the
 * Jellyfin poller can skip sending a duplicate Discord notification.
 *
 * TTL is 48 hours to cover cases where Jellyfin scan is delayed by hours
 * (e.g. file downloads overnight, Jellyfin scans next morning).
 * State is persisted to disk so restarts don't clear the dedup window.
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import path from "path";
import { CONFIG_PATH } from "./configFile.js";
import logger from "./logger.js";

const TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

const DEDUP_FILE = path.join(path.dirname(CONFIG_PATH), "notify-dedup.json");

/** @type {Map<string, number>} key → timestamp */
const notified = new Map();

function loadNotified() {
  try {
    if (!existsSync(DEDUP_FILE)) return;
    const data = JSON.parse(readFileSync(DEDUP_FILE, "utf-8"));
    const now = Date.now();
    for (const [key, ts] of Object.entries(data)) {
      if (now - ts < TTL_MS) notified.set(key, ts);
    }
    logger.debug(`[NotifyDedup] Loaded ${notified.size} entries from disk`);
  } catch (err) {
    logger.warn(`[NotifyDedup] Could not load state from disk: ${err.message}`);
  }
}

function saveNotified() {
  try {
    const tmp = DEDUP_FILE + ".tmp";
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(notified)), "utf-8");
    renameSync(tmp, DEDUP_FILE);
  } catch (err) {
    logger.warn(`[NotifyDedup] Could not save state to disk: ${err.message}`);
  }
}

loadNotified();

/** @param {"movie"|"tv"} mediaType @param {string|number} tmdbId */
export function markNotified(mediaType, tmdbId) {
  notified.set(`${mediaType}-${tmdbId}`, Date.now());
  saveNotified();
}

/** @param {"movie"|"tv"} mediaType @param {string|number} tmdbId @returns {boolean} */
export function wasRecentlyNotified(mediaType, tmdbId) {
  const ts = notified.get(`${mediaType}-${tmdbId}`);
  if (!ts) return false;
  if (Date.now() - ts > TTL_MS) {
    notified.delete(`${mediaType}-${tmdbId}`);
    return false;
  }
  return true;
}

// Cleanup expired entries once per hour and persist the trimmed map
setInterval(() => {
  const cutoff = Date.now() - TTL_MS;
  for (const [key, ts] of notified) {
    if (ts < cutoff) notified.delete(key);
  }
  saveNotified();
}, 60 * 60 * 1000);
