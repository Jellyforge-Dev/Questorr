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

// ─── Button visibility per notification type ────────────────────────────────
/**
 * Returns a function `show(btn)` that checks whether a button should be shown.
 * @param {string} envKey - e.g. "NOTIF_BUTTONS_STATUS", "NOTIF_BUTTONS_MEDIA_AVAILABLE"
 */
export function parseButtonConfig(envKey) {
  const raw = process.env[envKey] || "";
  const on = raw ? raw.toLowerCase().split(",").map(s => s.trim()).filter(p => !p.startsWith("-")) : null;
  const off = raw ? raw.toLowerCase().split(",").map(s => s.trim()).filter(p => p.startsWith("-")).map(p => p.slice(1)) : null;
  return function show(btn) {
    if (!raw) return process.env["EMBED_SHOW_BUTTON_" + btn.toUpperCase()] !== "false";
    if (on && on.includes(btn)) return true;
    if (off && off.includes(btn)) return false;
    return process.env["EMBED_SHOW_BUTTON_" + btn.toUpperCase()] !== "false";
  };
}

// Convenience accessors — read process.env at call time so config reloads are respected
export const getSeerrUrl = () => getSeerrApiUrl(process.env.SEERR_URL || "");
export const getSeerrApiKey = () => process.env.SEERR_API_KEY;
export const getTmdbApiKey = () => process.env.TMDB_API_KEY;
