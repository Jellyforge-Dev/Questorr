import { wasRecentlyNotified, markNotified } from "./notifyDedup.js";
import { recordNotification } from "./notificationAudit.js";

/**
 * Single decision point for cross-source media notifications.
 *
 * Both the Seerr webhook and the Jellyfin poller can fire for the same media.
 * This wraps the existing notifyDedup semantics (key = mediaType-tmdbId) behind
 * one API and records every decision into the audit trail, so the dedup logic
 * lives in one place and the admin can see what was posted/skipped and why.
 *
 * Usage:
 *   const { post } = shouldPost(ctx);
 *   if (!post) return;            // skip recorded automatically
 *   await channel.send(...);
 *   markPosted({ ...ctx, channelId });
 */

function dedupType(mediaType) {
  return mediaType === "movie" ? "movie" : "tv";
}

/**
 * @returns {{ post: boolean, reason: string }}
 */
export function shouldPost({ eventType, tmdbId, mediaType, source, title }) {
  if (tmdbId == null) {
    return { post: true, reason: "no-dedup-key" }; // can't dedup without a tmdbId
  }
  const dt = dedupType(mediaType);
  if (wasRecentlyNotified(dt, tmdbId)) {
    recordNotification({ eventType, tmdbId, mediaType: dt, source, title, status: "skipped", reason: "already-notified" });
    return { post: false, reason: "already-notified" };
  }
  return { post: true, reason: "new" };
}

/** Mark a successful post: update dedup and record a posted audit entry. */
export function markPosted({ eventType, tmdbId, mediaType, source, title, channelId }) {
  const dt = dedupType(mediaType);
  if (tmdbId != null) markNotified(dt, tmdbId);
  recordNotification({ eventType, tmdbId, mediaType: dt, source, title, channelId, status: "posted", reason: "ok" });
}
