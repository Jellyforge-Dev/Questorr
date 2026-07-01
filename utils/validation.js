/**
 * Input Validation using Joi
 * Provides schema validation for API endpoints and user inputs
 */

import Joi from "joi";
import net from "net";

/**
 * Joi custom validator for server URLs (SEERR_URL, JELLYFIN_BASE_URL).
 * Allows private/LAN IPs (needed for self-hosted services) but blocks the
 * cloud metadata endpoint (169.254.169.254) and the unspecified address (0.0.0.0)
 * which have no legitimate use as target hosts.
 */
function validateServerUrl(value, helpers) {
  if (!value) return value;
  try {
    const u = new URL(value);
    const host = u.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
    if (net.isIP(host)) {
      // Block cloud instance metadata endpoint and unspecified address
      const blocked = ["169.254.169.254", "0.0.0.0", "::"];
      if (blocked.includes(host)) {
        return helpers.error("any.invalid");
      }
    }
  } catch (_) {
    return helpers.error("string.uri");
  }
  return value;
}

// --- CONFIG VALIDATION ---
export const configSchema = Joi.object({
  LANGUAGE: Joi.string().allow("").optional(), // Allow any language code from locales folder
  // Round 11: BOT_LANGUAGE default is "en". An empty string is tolerated (legacy)
  // but the save handler in app.js strips empty values before merge to avoid
  // overwriting the persisted language on container restart.
  BOT_LANGUAGE: Joi.string().allow("").optional().default("en"),
  NOTIF_TITLE_MEDIA_PENDING: Joi.string().allow("").optional(),
  NOTIF_TITLE_MEDIA_APPROVED: Joi.string().allow("").optional(),
  NOTIF_TITLE_MEDIA_AUTO_APPROVED: Joi.string().allow("").optional(),
  NOTIF_TITLE_MEDIA_AVAILABLE: Joi.string().allow("").optional(),
  NOTIF_TITLE_MEDIA_DECLINED: Joi.string().allow("").optional(),
  NOTIF_TITLE_MEDIA_FAILED: Joi.string().allow("").optional(),
  NOTIF_TITLE_ISSUE_CREATED: Joi.string().allow("").optional(),
  NOTIF_TITLE_ISSUE_COMMENT: Joi.string().allow("").optional(),
  NOTIF_TITLE_ISSUE_RESOLVED: Joi.string().allow("").optional(),
  NOTIF_TITLE_ISSUE_REOPENED: Joi.string().allow("").optional(),
  NOTIF_TITLE_TEST: Joi.string().allow("").optional(),
  NOTIF_TITLE_DAILY_RANDOM: Joi.string().allow("").optional(),
  NOTIF_TITLE_DAILY_RECOMMENDATION: Joi.string().allow("").optional(),
  NOTIF_TITLE_JELLYFIN_NEW: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_MEDIA_PENDING: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_MEDIA_APPROVED: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_MEDIA_AUTO_APPROVED: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_MEDIA_AVAILABLE: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_MEDIA_DECLINED: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_MEDIA_FAILED: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_ISSUE_CREATED: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_ISSUE_COMMENT: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_ISSUE_RESOLVED: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_ISSUE_REOPENED: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_TEST_NOTIFICATION: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_RANDOM: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_STATUS: Joi.string().allow("").optional(),
  DISCORD_TOKEN: Joi.string().allow("").optional(),
  BOT_ID: Joi.string().allow("").optional(),
  GUILD_ID: Joi.string().allow("").optional(),
  SEERR_URL: Joi.string().uri().allow("").optional().custom(validateServerUrl),
  SEERR_API_KEY: Joi.string().allow("").optional(),
  TMDB_API_KEY: Joi.string().allow("").optional(),
  OMDB_API_KEY: Joi.string().allow("").optional(),
  JELLYFIN_BASE_URL: Joi.string().uri().allow("").optional().custom(validateServerUrl),
  JELLYFIN_API_KEY: Joi.string().allow("").optional(),
  JELLYFIN_SERVER_ID: Joi.string().allow("").optional(),
  JELLYFIN_CHANNEL_ID: Joi.string().allow("").optional(),
  JELLYFIN_NOTIFICATION_LIBRARIES: Joi.alternatives(
    Joi.array().items(Joi.string()), // Legacy array format
    Joi.object().pattern(Joi.string(), Joi.string().allow("")) // New object format: { libraryId: channelId }, allow empty channel IDs
  ).optional(),
  JELLYFIN_NOTIFY_MOVIES: Joi.string().valid("true", "false").optional(),
  JELLYFIN_NOTIFY_SERIES: Joi.string().valid("true", "false").optional(),
  JELLYFIN_NOTIFY_SEASONS: Joi.string().valid("true", "false").allow("").optional(),
  JELLYFIN_NOTIFY_EPISODES: Joi.string().valid("true", "false").allow("").optional(),
  JELLYFIN_EPISODE_CHANNEL_ID: Joi.string().allow("").optional(),
  JELLYFIN_SEASON_CHANNEL_ID: Joi.string().allow("").optional(),
  WEBHOOK_PORT: Joi.alternatives(Joi.string().allow(""), Joi.number().port()).optional(),
  BIND_HOST: Joi.string().ip({ version: ["ipv4", "ipv6"] }).optional(),
  WEBHOOK_SECRET: Joi.string().allow("").optional(),
  WEBHOOK_DEBOUNCE_MS: Joi.alternatives(
    Joi.string().allow(""),
    Joi.number().integer().min(1000).max(600000)
  ).optional(), // Allow up to 10 minutes
  AUTO_START_BOT: Joi.string().valid("true", "false").optional(),
  NOTIFY_ON_AVAILABLE: Joi.string().valid("true", "false").optional(),
  PRIVATE_MESSAGE_MODE: Joi.string().valid("true", "false").optional(),
  SEERR_AUTO_APPROVE: Joi.string().valid("true", "false").optional(),
  SHOW_TAG_SELECTION: Joi.string().valid("true", "false").optional(),
  SHOW_SERVER_SELECTION: Joi.string().valid("true", "false").optional(),
  SHOW_QUALITY_SELECTION: Joi.string().valid("true", "false").optional(),
  // Seerr webhook notification channels
  SEERR_CHANNEL_ID: Joi.string().allow("").optional(),
  SEERR_ADMIN_CHANNEL_ID: Joi.string().allow("").optional(),
  SEERR_ROOT_FOLDER_CHANNELS: Joi.alternatives(
    Joi.object().pattern(Joi.string(), Joi.string().allow("")),
    Joi.string().allow(""),  // Allow empty string on first load
    Joi.array().items(Joi.any())  // Allow empty array fallback
  ).optional(),
  DEBUG: Joi.string().valid("true", "false").optional(),
  LOG_LEVEL: Joi.string().valid("error", "warn", "info", "verbose", "debug").allow("").optional(),
  DAILY_RECOMMENDATION_ENABLED: Joi.string().valid("true", "false").optional(),
  DAILY_RECOMMENDATION_CHANNEL_ID: Joi.string().allow("").optional(),
  DAILY_RECOMMENDATION_INTERVAL: Joi.alternatives(Joi.string().allow(""), Joi.number().integer().min(1)).optional(),
  USER_MAPPINGS: Joi.array().items(Joi.object()).optional(),
  USER_MAPPING_METADATA: Joi.object().optional(),
  ROLE_ALLOWLIST: Joi.array().items(Joi.string()).optional(),
  ROLE_BLOCKLIST: Joi.array().items(Joi.string()).optional(),
  QUOTA_WEEKLY_LIMIT: Joi.alternatives().try(Joi.number().integer().min(0), Joi.string().pattern(/^\d+$/)).optional(),
  QUOTA_BYPASS_ROLES: Joi.array().items(Joi.string()).optional(),
  QUOTA_UNLIMITED_USERS: Joi.array().items(Joi.string()).optional(),
  SUBSCRIPTION_POLL_INTERVAL_MINUTES: Joi.alternatives().try(Joi.number().integer().min(0), Joi.string().pattern(/^\d+$/)).optional(),
  WEEKLY_RECOMMENDATION_DAY: Joi.string().valid("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday").optional(),
  WEEKLY_RECOMMENDATION_TIME: Joi.string().pattern(/^\d{1,2}:\d{2}$/).optional(),
  DIGEST_ENABLED: Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true", "false")).optional(),
  DIGEST_CHANNEL_ID: Joi.string().allow("").optional(),
  DIGEST_DAY: Joi.string().valid("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday").optional(),
  DIGEST_TIME: Joi.string().pattern(/^\d{1,2}:\d{2}$/).optional(),
  CHANNEL_MOVIES: Joi.string().allow("").optional(),
  CHANNEL_SERIES: Joi.string().allow("").optional(),
  JELLYFIN_RETRY_DELAY_SECONDS: Joi.alternatives(
    Joi.string().allow(""),
    Joi.number().integer().min(0).max(600)
  ).optional(),
  WIDGET_API_KEY: Joi.string().allow("").optional(),
  WIDGET_ALLOWED_ORIGINS: Joi.string().allow("").optional(),
  COMMAND_RATE_LIMIT: Joi.alternatives().try(
    Joi.number().integer().min(0).max(100),
    Joi.string().pattern(/^\d*$/).allow("")
  ).optional(),
  NOTIF_BUTTONS_DAILY_RANDOM: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_DAILY_RECOMMENDATION: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_MEDIA_PENDING_DM: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_MEDIA_APPROVED_DM: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_MEDIA_AUTO_APPROVED_DM: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_MEDIA_AVAILABLE_DM: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_MEDIA_DECLINED_DM: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_MEDIA_FAILED_DM: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_ISSUE_CREATED_DM: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_ISSUE_COMMENT_DM: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_ISSUE_RESOLVED_DM: Joi.string().allow("").optional(),
  NOTIF_BUTTONS_ISSUE_REOPENED_DM: Joi.string().allow("").optional(),
  DAILY_RANDOM_PICK_ENABLED: Joi.string().valid("true", "false").optional(),
  DAILY_RANDOM_PICK_CHANNEL_ID: Joi.string().allow("").optional(),
  DAILY_RANDOM_PICK_INTERVAL: Joi.alternatives(Joi.string().allow(""), Joi.number().integer().min(1)).optional(),
  DAILY_RANDOM_PICK_TIME: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).allow("").optional(),
  DAILY_RECOMMENDATION_TIME: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).allow("").optional(),
  JELLYFIN_POLL_INTERVAL_SECONDS: Joi.alternatives(
    Joi.string().allow(""),
    Joi.number().integer().min(0).max(86400)
  ).optional(),
  SEERR_STATUS_POLLING_ENABLED: Joi.string().valid("true", "false").optional(),
  SEERR_STATUS_POLL_INTERVAL_SECONDS: Joi.alternatives(
    Joi.string().allow(""),
    Joi.number().integer().min(30).max(3600)
  ).optional(),
  HEALTH_ALERTS_ENABLED: Joi.string().valid("true", "false").optional(),
  HEALTH_ALERT_INTERVAL_SECONDS: Joi.alternatives(
    Joi.string().allow(""),
    Joi.number().integer().min(30).max(3600)
  ).optional(),
  HEALTH_ALERT_CHANNEL_ID: Joi.string().allow("").optional(),
  JELLYFIN_POLLER_METADATA_DELAY_SECONDS: Joi.alternatives(
    Joi.string().allow(""),
    Joi.number().integer().min(0).max(600)
  ).optional(),
  // Round 10: Recently-Added window in days (0 = disabled, default 7)
  JELLYFIN_RECENT_ADDED_DAYS: Joi.alternatives(
    Joi.string().allow(""),
    Joi.number().integer().min(0).max(365)
  ).optional(),
  // Round 11: when true, every poll cycle triggers POST /Library/Refresh on
  // Jellyfin so external file-system additions are indexed without waiting
  // for Jellyfin's scheduled library scan.
  JELLYFIN_AUTO_REFRESH: Joi.string().valid("true", "false").optional(),
  JELLYFIN_POLLER_SHOW_BUTTON_WATCH: Joi.string().valid("true", "false").optional(),
  JELLYFIN_POLLER_SHOW_BUTTON_IMDB: Joi.string().valid("true", "false").optional(),
  JELLYFIN_POLLER_SHOW_BUTTON_LETTERBOXD: Joi.string().valid("true", "false").optional(),
  DEFAULT_QUALITY_PROFILE_MOVIE: Joi.string().allow("").optional(),
  DEFAULT_QUALITY_PROFILE_TV: Joi.string().allow("").optional(),
  DEFAULT_SERVER_MOVIE: Joi.string().allow("").optional(),
  DEFAULT_SERVER_TV: Joi.string().allow("").optional(),
  EMBED_SHOW_IMAGES: Joi.string().valid("true", "false").optional(),
  EMBED_SHOW_BACKDROP: Joi.string().valid("true", "false").optional(),
  EMBED_SHOW_OVERVIEW: Joi.string().valid("true", "false").optional(),
  EMBED_SHOW_GENRE: Joi.string().valid("true", "false").optional(),
  EMBED_SHOW_RUNTIME: Joi.string().valid("true", "false").optional(),
  EMBED_SHOW_RATING: Joi.string().valid("true", "false").optional(),
  EMBED_SHOW_BUTTON_SEERR: Joi.string().valid("true", "false").optional(),
  EMBED_SHOW_BUTTON_WATCH: Joi.string().valid("true", "false").optional(),
  EMBED_SHOW_BUTTON_LETTERBOXD: Joi.string().valid("true", "false").optional(),
  EMBED_SHOW_BUTTON_IMDB: Joi.string().valid("true", "false").optional(),
  EMBED_COLOR_MOVIE: Joi.string().allow("").optional(),
  EMBED_COLOR_SERIES: Joi.string().allow("").optional(),
  EMBED_COLOR_SEASON: Joi.string().allow("").optional(),
  EMBED_COLOR_EPISODE_SINGLE: Joi.string().allow("").optional(),
  EMBED_COLOR_EPISODE_FEW: Joi.string().allow("").optional(),
  EMBED_COLOR_EPISODE_MANY: Joi.string().allow("").optional(),
  EMBED_COLOR_SEARCH: Joi.string().allow("").optional(),
  EMBED_COLOR_SUCCESS: Joi.string().allow("").optional(),
  SHOW_STATUS_COMMAND: Joi.string().valid("true", "false").optional(),
  SHOW_RANDOM_COMMAND: Joi.string().valid("true", "false").optional(),
  SHOW_REPORT_COMMAND: Joi.string().valid("true", "false").optional(),
  EMBED_FOOTER_TEXT: Joi.string().allow("").max(200).optional(),
});

// --- USER MAPPING VALIDATION ---
export const userMappingSchema = Joi.object({
  discordUserId: Joi.string().pattern(/^\d{17,19}$/).required(),
  seerrUserId: Joi.string().pattern(/^\d+$/).required(),
  discordUsername: Joi.string().allow(null, "").optional(),
  seerrUsername: Joi.string().allow(null, "").optional(),
  discordDisplayName: Joi.string().allow(null, "").optional(),
  discordAvatar: Joi.string().allow(null, "").optional(),
  seerrDisplayName: Joi.string().allow(null, "").optional(),
});

// --- SEERR REQUEST VALIDATION ---
export const seerrRequestSchema = Joi.object({
  mediaType: Joi.string().valid("movie", "tv").required(),
  mediaId: Joi.number().integer().positive().required(),
  seasons: Joi.alternatives(
    Joi.array().items(Joi.number().integer().positive()),
    Joi.array().items(Joi.string().valid("all"))
  ).optional(),
  tags: Joi.array().items(Joi.number().integer().positive()).optional(),
  rootFolder: Joi.string().optional(),
  serverId: Joi.number().integer().positive().optional(),
  userId: Joi.number().integer().positive().optional(),
});

// --- SEARCH QUERY VALIDATION ---
export const searchQuerySchema = Joi.object({
  query: Joi.string().min(1).max(200).required(),
});

// --- ID VALIDATION ---
export const tmdbIdSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  mediaType: Joi.string().valid("movie", "tv").required(),
});

// --- CONNECTION-TEST VALIDATION ---
// Deliberately permissive on URL format (we don't want to reject valid but
// unusual self-hosted URLs); the point is to reject missing / wrong-type /
// oversized inputs before they reach the outbound fetch. apiKey may be a masked
// placeholder echoed back by the dashboard, so any non-empty string is allowed.
export const seerrConnectionSchema = Joi.object({
  url: Joi.string().trim().min(1).max(2048).required(),
  apiKey: Joi.string().trim().min(1).max(500).required(),
});

export const jellyfinConnectionSchema = Joi.object({
  url: Joi.string().trim().min(1).max(2048).required(),
  apiKey: Joi.string().trim().min(1).max(500).optional(),
});

export const pollNowSchema = Joi.object({
  mode: Joi.string().max(40).optional(),
  limit: Joi.number().integer().min(1).max(10000).optional(),
});

// --- VALIDATION MIDDLEWARE ---
/**
 * Express middleware factory for validating request body
 * @param {Joi.Schema} schema - Joi validation schema
 * @returns {Function} Express middleware function
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Get all errors, not just first
      stripUnknown: false, // Keep unknown fields for debugging
      allowUnknown: true, // Allow unknown fields
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      // Log validation errors for debugging
      // console.error("Validation failed:", JSON.stringify(errors, null, 2));
      // console.error("Received body:", JSON.stringify(req.body, null, 2));

      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors,
      });
    }

    // Replace req.body with validated/sanitized value
    req.body = value;
    next();
  };
}

/**
 * Express middleware factory for validating query parameters
 * @param {Joi.Schema} schema - Joi validation schema
 * @returns {Function} Express middleware function
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors,
      });
    }

    req.query = value;
    next();
  };
}

/**
 * Express middleware factory for validating URL parameters
 * @param {Joi.Schema} schema - Joi validation schema
 * @returns {Function} Express middleware function
 */
export function validateParams(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors,
      });
    }

    req.params = value;
    next();
  };
}
