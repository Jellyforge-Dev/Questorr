export const configTemplate = {
  LANGUAGE: "en",
  BOT_LANGUAGE: "en",

  // Notification title overrides (empty = use BOT_LANGUAGE default)
  NOTIF_TITLE_MEDIA_PENDING: "",
  NOTIF_TITLE_MEDIA_APPROVED: "",
  NOTIF_TITLE_MEDIA_AUTO_APPROVED: "",
  NOTIF_TITLE_MEDIA_AVAILABLE: "",
  NOTIF_TITLE_MEDIA_DECLINED: "",
  NOTIF_TITLE_MEDIA_FAILED: "",
  NOTIF_TITLE_ISSUE_CREATED: "",
  NOTIF_TITLE_ISSUE_COMMENT: "",
  NOTIF_TITLE_ISSUE_RESOLVED: "",
  NOTIF_TITLE_ISSUE_REOPENED: "",
  NOTIF_TITLE_TEST: "",
  NOTIF_TITLE_DAILY_RANDOM: "",
  NOTIF_TITLE_DAILY_RECOMMENDATION: "",
  // Per-event button config (empty = use global EMBED_SHOW_BUTTON_* toggles)
  // Format: comma-separated list of: seerr, watch, letterboxd, imdb
  NOTIF_BUTTONS_MEDIA_PENDING: "",
  NOTIF_BUTTONS_MEDIA_APPROVED: "",
  NOTIF_BUTTONS_MEDIA_AUTO_APPROVED: "",
  NOTIF_BUTTONS_MEDIA_AVAILABLE: "",
  NOTIF_BUTTONS_MEDIA_DECLINED: "",
  NOTIF_BUTTONS_MEDIA_FAILED: "",
  NOTIF_BUTTONS_ISSUE_CREATED: "",
  NOTIF_BUTTONS_ISSUE_COMMENT: "",
  NOTIF_BUTTONS_ISSUE_RESOLVED: "",
  NOTIF_BUTTONS_ISSUE_REOPENED: "",
  NOTIF_BUTTONS_TEST_NOTIFICATION: "",
  NOTIF_BUTTONS_RANDOM: "",
  NOTIF_BUTTONS_STATUS: "",
  NOTIF_BUTTONS_DAILY_RANDOM: "",
  NOTIF_BUTTONS_DAILY_RECOMMENDATION: "",
  // DM-specific button overrides (empty = no buttons in DM, except MEDIA_AVAILABLE
  // which inherits Channel config when its DM key is empty for backward compat)
  NOTIF_BUTTONS_MEDIA_PENDING_DM: "",
  NOTIF_BUTTONS_MEDIA_APPROVED_DM: "",
  NOTIF_BUTTONS_MEDIA_AUTO_APPROVED_DM: "",
  NOTIF_BUTTONS_MEDIA_AVAILABLE_DM: "",
  NOTIF_BUTTONS_MEDIA_DECLINED_DM: "",
  NOTIF_BUTTONS_MEDIA_FAILED_DM: "",
  NOTIF_BUTTONS_ISSUE_CREATED_DM: "",
  NOTIF_BUTTONS_ISSUE_COMMENT_DM: "",
  NOTIF_BUTTONS_ISSUE_RESOLVED_DM: "",
  NOTIF_BUTTONS_ISSUE_REOPENED_DM: "",
  DISCORD_TOKEN: "",
  BOT_ID: "",
  GUILD_ID: "",
  SEERR_URL: "http://localhost:5055",
  SEERR_API_KEY: "",
  // Status Poller — fallback for missing MEDIA_APPROVED webhooks
  // (e.g. when admin approves directly in Seerr UI without Request Approved
  // notification type enabled). Polls Seerr requests at the configured
  // interval and DMs the requester on pending → approved/declined transitions.
  SEERR_STATUS_POLLING_ENABLED: "false",
  SEERR_STATUS_POLL_INTERVAL_SECONDS: "120",
  // Cleanup Advisor — weekly Discord post listing rarely-watched movies for
  // possible deletion. Server-aggregated stats; movies only.
  // Streamystats — self-hosted Jellyfin stats/recommendations engine.
  // When set, /foryou uses vector-similarity recommendations from Streamystats
  // instead of TMDB. The command is hidden from Discord when this is empty.
  STREAMYSTATS_URL: "",
  CLEANUP_ADVISOR_ENABLED: "false",
  CLEANUP_ADVISOR_CHANNEL_ID: "",
  CLEANUP_ADVISOR_DAY: "sunday",         // monday … sunday
  CLEANUP_ADVISOR_TIME: "09:00",         // HH:MM 24h
  CLEANUP_MIN_AGE_DAYS: "365",           // file must be in library at least N days
  CLEANUP_MAX_PLAYCOUNT: "1",            // include items played at most N times
  CLEANUP_MIN_DAYS_SINCE_PLAYED: "180",  // if ever played, last play must be older
  CLEANUP_MAX_RESULTS: "25",             // top-N to list per post
  TMDB_API_KEY: "",
  OMDB_API_KEY: "",
  JELLYFIN_BASE_URL: "",
  JELLYFIN_API_KEY: "",
  JELLYFIN_SERVER_ID: "",
  JELLYFIN_CHANNEL_ID: "",
  JELLYFIN_EPISODE_CHANNEL_ID: "",
  JELLYFIN_SEASON_CHANNEL_ID: "",
  JELLYFIN_NOTIFICATION_LIBRARIES: {},
  JELLYFIN_NOTIFY_MOVIES: "true",
  JELLYFIN_NOTIFY_SERIES: "true",
  JELLYFIN_NOTIFY_SEASONS: "false",
  JELLYFIN_NOTIFY_EPISODES: "false",
  WEBHOOK_DEBOUNCE_MS: "15000",
  WEBHOOK_PORT: "8282",
  WEBHOOK_SECRET: "",
  AUTO_START_BOT: "true",
  NOTIFY_ON_AVAILABLE: "false",
  PRIVATE_MESSAGE_MODE: "false",
  DEBUG: "false",
  JWT_SECRET: "",
  USER_MAPPINGS: [],
  ROLE_ALLOWLIST: [],
  ROLE_BLOCKLIST: [],
  DEFAULT_QUALITY_PROFILE_MOVIE: "",
  DEFAULT_QUALITY_PROFILE_TV: "",
  DEFAULT_SERVER_MOVIE: "",
  DEFAULT_SERVER_TV: "",
  EMBED_SHOW_BACKDROP: "true",
  EMBED_SHOW_OVERVIEW: "true",
  EMBED_SHOW_GENRE: "true",
  EMBED_SHOW_RUNTIME: "true",
  EMBED_SHOW_RATING: "true",
  EMBED_SHOW_BUTTON_SEERR: "true",
  EMBED_SHOW_BUTTON_WATCH: "true",
  EMBED_SHOW_BUTTON_LETTERBOXD: "true",
  EMBED_SHOW_BUTTON_IMDB: "true",
  EMBED_SHOW_CONTENT_RATING: "true",
  CONTENT_RATING_COUNTRY: "",
  EMBED_SHOW_PROVIDERS: "true",
  PROVIDER_COUNTRY: "",
  EMBED_COLOR_MOVIE: "#1ec8a0",
  EMBED_COLOR_SERIES: "#1ec8a0",
  EMBED_COLOR_SEASON: "#17b8c4",
  EMBED_COLOR_EPISODE_SINGLE: "#17b8c4",
  EMBED_COLOR_EPISODE_FEW: "#17b8c4",
  EMBED_COLOR_EPISODE_MANY: "#17b8c4",
  EMBED_COLOR_SEARCH: "#f0a05a",
  EMBED_COLOR_SUCCESS: "#2ecc8e",
  DAILY_RANDOM_PICK_ENABLED: "false",
  DAILY_RANDOM_PICK_CHANNEL_ID: "",
  DAILY_RANDOM_PICK_INTERVAL: "1440",
  // HH:MM format, e.g. "08:00". If set, overrides INTERVAL and sends at this exact time every day.
  DAILY_RANDOM_PICK_TIME: "",
  DAILY_RECOMMENDATION_ENABLED: "false",
  DAILY_RECOMMENDATION_CHANNEL_ID: "",
  DAILY_RECOMMENDATION_INTERVAL: "1440",
  // HH:MM format, e.g. "20:00". If set, overrides INTERVAL and sends at this exact time every day.
  DAILY_RECOMMENDATION_TIME: "",
  SEERR_AUTO_APPROVE: "true",
  // Request UI options
  SHOW_TAG_SELECTION: "true",
  SHOW_SERVER_SELECTION: "true",
  SHOW_QUALITY_SELECTION: "true",
  SHOW_STATUS_COMMAND: "true",
  SHOW_RANDOM_COMMAND: "true",
  // Seerr webhook notification channels
  SEERR_CHANNEL_ID: "",
  SEERR_ADMIN_CHANNEL_ID: "",
  SEERR_ROOT_FOLDER_CHANNELS: {},
  // Media-type channel routing
  CHANNEL_MOVIES: "",
  CHANNEL_SERIES: "",
  // Command rate limiting
  COMMAND_RATE_LIMIT: "10",
  // Jellyfin retry delay for MEDIA_AVAILABLE events (seconds, 0 = disabled)
  JELLYFIN_RETRY_DELAY_SECONDS: "30",
  // How often Questorr polls Jellyfin for newly added items (seconds, 0 = disabled, default: 300)
  JELLYFIN_POLL_INTERVAL_SECONDS: "300",
  // Seconds to wait before notifying when Jellyfin has no TMDB ID yet (0 = send immediately)
  JELLYFIN_POLLER_METADATA_DELAY_SECONDS: "60",
  // Buttons shown in automatic Jellyfin poller notifications (fallback to global EMBED_SHOW_BUTTON_*)
  JELLYFIN_POLLER_SHOW_BUTTON_WATCH: "true",
  JELLYFIN_POLLER_SHOW_BUTTON_IMDB: "true",
  JELLYFIN_POLLER_SHOW_BUTTON_LETTERBOXD: "true",
  // Widget API key (optional, leave empty for public access)
  WIDGET_API_KEY: "",
  // Widget allowed iframe origins (space-separated, e.g. "https://example.com https://other.com")
  WIDGET_ALLOWED_ORIGINS: "",
  // Anonymize usernames in widget stats (true = show "User 1", "User 2" instead of real names)
  WIDGET_ANONYMIZE_STATS: "false",
  // Custom embed footer text (optional, shown on all Discord embeds)
  EMBED_FOOTER_TEXT: "",
};
