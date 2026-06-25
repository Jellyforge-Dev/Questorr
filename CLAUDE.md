# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Questorr** is a self-hosted Discord bot (Node.js, ES Modules) that bridges Jellyfin, Seerr (Overseerr/Jellyseerr), TMDB and OMDb. It provides Discord slash commands for media search/discovery/requests plus a web-based configuration dashboard on port 8282 (`WEBHOOK_PORT`).

## Commands

```bash
npm run dev                 # Start with nodemon (hot reload)
npm start                   # Production start (node app.js)
npm test                    # Run the vitest suite (tests/*.test.js)
npm run create-translation  # Scaffold a new locale file
```

Run a single test file: `npx vitest run tests/seerr.test.js`

Docker:
```bash
docker compose up -d
```

## Architecture

### Entry Point

`app.js` initializes the Express server, applies Helmet security headers + rate limiting, loads/migrates config (`.env` → `config/config.json`), mounts all routers under `/api`, serves the `web/` dashboard as static files, and manages the bot lifecycle (`AUTO_START_BOT`, `/api/start-bot`, `/api/stop-bot`).

### Key Layers

| Layer | Files | Responsibility |
|-------|-------|----------------|
| Bot core | `bot/botManager.js`, `bot/interactions.js`, `bot/botState.js` | Discord client init, interaction dispatch, shared mutable state (running flag, `pendingRequests` map persisted to `config/pending-requests.json`) |
| Slash commands | `bot/commands/*.js` | One file per command: `search`, `status`, `random`, `recommend`, `discover`, `collection`, `cast`, `similar`, `watchlist`, `history`, `foryou`, `upcoming`, `help` |
| Component handlers | `bot/handlers/*.js` | Button/select/modal interactions (request buttons, season select, tag select, approve/decline, "did you mean", setup wizard) |
| Autocomplete | `bot/autocomplete/index.js` | Slash command autocomplete providers |
| Embeds | `bot/embeds.js` | All Discord embed builders |
| Pollers/daily jobs | `bot/jellyfinPoller.js`, `bot/seerrStatusPoller.js`, `bot/dailyPick.js`, `bot/cleanupAdvisor.js` | Background polling for Jellyfin/Seerr state and scheduled daily-pick posts |
| Discord registration | `discord/commands.js` | Builds and registers the slash command set with Discord's REST API |
| Webhooks | `seerrWebhook.js` | Receives Seerr events, dispatches Discord notifications with channel routing |
| API clients | `api/seerr.js`, `api/tmdb.js`, `api/jellyfin.js`, `api/omdb.js`, `api/streamystats.js` | External API wrappers |
| Jellyfin resolution | `jellyfin/libraryResolver.js` | Maps TMDB IDs to Jellyfin library items for availability/routing lookups |
| Routes | `routes/*.js` (auth, config, seerr, jellyfin, userMapping, log, bot) | Express endpoints mounted under `/api`, mostly behind `authenticateToken` |
| Config | `lib/config.js` (Joi-validated template), `utils/configFile.js` (read/write `config/config.json`, `.env` migration) | Single source of truth for all env-style settings |
| Sanitization/Validation | `utils/configSanitize.js`, `utils/validation.js` | Mask sensitive fields before sending to frontend; Joi request validation |
| Other utils | `utils/auth.js`, `utils/cache.js`, `utils/axiosRetry.js`, `utils/notifyDedup.js`, `utils/userStore.js`, `utils/userMappingStore.js`, `utils/secrets.js`, `utils/dateFormat.js`, `utils/seerrUrl.js`, `utils/url.js`, `utils/time.js`, `utils/logger.js` | Auth/JWT, request caching, retry wrapper for axios, webhook dedup, on-disk user/mapping stores, date/URL formatting helpers, Winston logging |
| Dashboard | `web/` (`index.html`, `script.js`, `style.css`) | Vanilla JS single-page app with a multi-step setup wizard |
| i18n | `locales/*.json`, `utils/botStrings.js` | Locale JSON files (`en`, `de`); `template.json` is the source of truth for keys |
| Tests | `tests/*.test.js` (vitest) | Unit tests for axios retry, bot utils, rate limiting, config encryption, media-type routing, Seerr/TMDB clients |

### Webhook Channel Routing

`seerrWebhook.js` routes each Seerr event to a Discord channel in this priority order (see header comment in that file):
1. Root folder → channel mapping (`SEERR_ROOT_FOLDER_CHANNELS`, per Radarr/Sonarr server)
2. Jellyfin library → channel mapping (`JELLYFIN_NOTIFICATION_LIBRARIES`, matched via TMDB ID lookup)
3. Media-type → channel mapping (`CHANNEL_MOVIES` / `CHANNEL_SERIES`)
4. `SEERR_CHANNEL_ID` fallback
5. `JELLYFIN_CHANNEL_ID` fallback

Some events (e.g. `MEDIA_AVAILABLE`) don't reliably include `rootFolder` in the webhook payload — `fetchRootFolderFromSeerr()` falls back to the Seerr request/media API and then Radarr/Sonarr directly before giving up.

Pending request notifications and decline notifications are sent as a DM to the requester only, not to a public channel.

### Configuration

All configuration lives in `config/config.json` (created on first run, auto-migrated from `.env` if present). The Joi-validated template in `lib/config.js` defines every setting; sensitive fields are masked by `utils/configSanitize.js` before being sent to the frontend. Most `/api` routes require a JWT (`authenticateToken`, set via the dashboard login).

Pending Discord requests survive restarts via `config/pending-requests.json`.

### Adding a Translation

1. Copy `locales/template.json` → `locales/<lang>.json`
2. Update the `_meta` section (language name, code, contributors, completion %)
3. Translate values only — keep keys unchanged, preserve HTML and `{{placeholders}}`
4. Run `npm run create-translation` if scaffolding is needed
