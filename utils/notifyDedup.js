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
    for (const [key, expiresAt] of Object.entries(data)) {
      if (now < expiresAt) notified.set(key, expiresAt);
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

function dedupKey(mediaType, tmdbId, seasonNumber) {
  return seasonNumber != null
    ? `${mediaType}-${tmdbId}-s${seasonNumber}`
    : `${mediaType}-${tmdbId}`;
}

/**
 * @param {"movie"|"tv"} mediaType @param {string|number} tmdbId
 * @param {number} [seasonNumber] - when given, dedups per season instead of
 *   per title, so a show with multiple seasons becoming available within the
 *   TTL window still gets a notification for each one.
 * @param {number} [ttlMs] - overrides the default 48h TTL for this entry.
 *   Used for keys that fall back to a less-specific identifier (e.g. tmdbId
 *   alone when Seerr's webhook didn't include a request_id) — those should
 *   expire quickly (just long enough to catch a genuine duplicate delivery)
 *   rather than blocking an unrelated, genuinely new event for the same
 *   title hours or days later.
 */
export function markNotified(mediaType, tmdbId, seasonNumber, ttlMs = TTL_MS) {
  notified.set(dedupKey(mediaType, tmdbId, seasonNumber), Date.now() + ttlMs);
  saveNotified();
}

/** @param {"movie"|"tv"} mediaType @param {string|number} tmdbId @param {number} [seasonNumber] @returns {boolean} */
export function wasRecentlyNotified(mediaType, tmdbId, seasonNumber) {
  const key = dedupKey(mediaType, tmdbId, seasonNumber);
  const expiresAt = notified.get(key);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    notified.delete(key);
    return false;
  }
  return true;
}

// Cleanup expired entries once per hour and persist the trimmed map
setInterval(() => {
  const now = Date.now();
  for (const [key, expiresAt] of notified) {
    if (now > expiresAt) notified.delete(key);
  }
  saveNotified();
}, 60 * 60 * 1000);
