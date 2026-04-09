import { getSeerrApiUrl } from "../utils/seerrUrl.js";

// ─── URL helpers (mirrors seerrWebhook.js) ────────────────────────────────────
export function buildSeerrUrl(mediaType, tmdbId) {
  const base = (process.env.SEERR_URL || "").replace(/\/$/, "");
  if (!base || !tmdbId) return null;
  return `${base}/${mediaType === "movie" ? "movie" : "tv"}/${tmdbId}`;
}

export function buildJellyfinUrl(itemId) {
  const base = (process.env.JELLYFIN_BASE_URL || "").replace(/\/$/, "");
  const serverId = process.env.JELLYFIN_SERVER_ID || "";
  if (!base || !itemId) return null;
  return `${base}/web/index.html#!/details?id=${itemId}&serverId=${serverId}`;
}

// Convenience accessors — read process.env at call time so config reloads are respected
export const getSeerrUrl = () => getSeerrApiUrl(process.env.SEERR_URL || "");
export const getSeerrApiKey = () => process.env.SEERR_API_KEY;
export const getTmdbApiKey = () => process.env.TMDB_API_KEY;
