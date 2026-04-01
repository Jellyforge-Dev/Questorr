# Questorr Changelog

## v2.0.0 – Initial Release (2026-03-30)

Questorr is a complete rewrite and rebrand, built on the foundation of media request management and smart notification routing.

### ✨ New Features

#### Seerr Webhook Integration
- Full Jellyseerr webhook support with 11 event types: `MEDIA_PENDING`, `MEDIA_APPROVED`, `MEDIA_AUTO_APPROVED`, `MEDIA_AVAILABLE`, `MEDIA_DECLINED`, `MEDIA_FAILED`, `ISSUE_CREATED`, `ISSUE_COMMENT`, `ISSUE_RESOLVED`, `ISSUE_REOPENED`, `TEST_NOTIFICATION`
- Admin-only channel for pending/failed events (`SEERR_ADMIN_CHANNEL_ID`)
- DM to requesting user on approved/declined/available events
- Test webhook button in dashboard

#### Smart Channel Routing
- Root Folder → Discord Channel mapping (Radarr/Sonarr paths → specific channels)
- Automatic Jellyfin library detection via title search and TMDB ID verification
- Fallback chain: Root Folder → Jellyfin Library → Default Seerr Channel

#### Rich Discord Embeds
- TMDB backdrop images for approved/available content
- Poster thumbnails
- **Watch Now!** button linking directly to Jellyfin
- **View on Seerr** button
- **IMDb** button
- All buttons use verified Jellyfin item IDs

#### Daily Recommendation
- Posts a daily recommendation from your *existing* Jellyfin library (not TMDB)
- Configurable channel and interval
- Watch Now, IMDb and Letterboxd buttons

#### /request Command Options
- Toggle Tag, Server and Quality options per-user visibility
- Simplified UX for non-technical users

### ⚙️ Improvements
- Questorr brand colors (teal/dark theme) throughout the dashboard
- Transparent logo support
- `LOG_LEVEL` environment variable for fine-tuned logging without DEBUG mode
- Verbose log level for detailed troubleshooting
- Cleaned up dashboard: removed Jellyfin Webhook Plugin dependency
- Step 4 simplified to just Jellyfin connection settings

### 🔒 Security
- Seerr webhook endpoint is rate-limited
- All API routes require authentication
- Config secrets (tokens, API keys) are base64-encoded at rest
