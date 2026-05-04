/**
 * Cross-webhook deduplication.
 *
 * Both the Seerr webhook (MEDIA_AVAILABLE) and the Jellyfin webhook (ItemAdded)
 * can fire for the same piece of media when it was requested via Seerr/Questorr.
 * This module keeps a short-lived set of recently-notified TMDB IDs so the
 * Jellyfin webhook can skip sending a duplicate Discord notification.
 */

const TTL_MS = 30 * 60 * 1000; // 30 minutes

/** @type {Map<string, number>} key → timestamp */
const notified = new Map();

/** @param {"movie"|"tv"} mediaType @param {string|number} tmdbId */
export function markNotified(mediaType, tmdbId) {
  notified.set(`${mediaType}-${tmdbId}`, Date.now());
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

setInterval(() => {
  const cutoff = Date.now() - TTL_MS;
  for (const [key, ts] of notified) {
    if (ts < cutoff) notified.delete(key);
  }
}, 10 * 60 * 1000);
