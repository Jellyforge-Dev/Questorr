/**
 * Questorr Constants
 * Centralized configuration values for colors, timeouts, cache TTLs, and URLs
 */

// Discord Embed Colors (Questorr brand palette)
// These can be customized via environment variables
export const COLORS = {
  get SEARCH() {
    return process.env.EMBED_COLOR_SEARCH || "#f0a05a"; // Orange for search results
  },
  get SUCCESS() {
    return process.env.EMBED_COLOR_SUCCESS || "#2ecc8e"; // Teal-green for successful operations
  },
  ERROR: "#f38ba8", // Red - for errors (not customizable)
  DEFAULT: "#1ec8a0", // Brand teal - default color (not customizable)
  INFO: "#17b8c4",    // Cyan - for informational messages (not customizable)
  WARNING: "#f9e2af", // Yellow - for warnings (not customizable)
};

// API Timeout Values (in milliseconds)
export const TIMEOUTS = {
  TMDB_API: 8000, // TMDB API calls
  OMDB_API: 7000, // OMDb API calls
  SEERR_API: 8000, // Seerr API calls (GET)
  SEERR_POST: 10000, // Seerr API calls (POST - longer for requests)
  JELLYFIN_API: 5000, // Jellyfin API calls
  DEFAULT: 8000, // Default timeout for other operations
};

// Cache TTL Values (in milliseconds)
export const CACHE_TTL = {
  TAGS: 5 * 60 * 1000, // 5 minutes - Radarr/Sonarr tags
  SERVERS: 5 * 60 * 1000, // 5 minutes - Radarr/Sonarr server list
  QUALITY_PROFILES: 5 * 60 * 1000, // 5 minutes - Radarr/Sonarr quality profiles
  DISCORD_MEMBERS: 15 * 1000, // 15 seconds - Discord guild members
  TMDB_SEARCH: 5 * 60 * 1000, // 5 minutes - TMDB search results (for future caching)
  TMDB_DETAILS: 30 * 60 * 1000, // 30 minutes - TMDB details (for future caching)
  SEERR_STATUS: 60 * 1000, // 1 minute - Seerr request status (for future caching)
};
