## [2.3.0] - 2026-04-14

### New Commands
- `/recommend <title>` — Get TMDB-powered recommendations based on a movie or TV show
- `/discover <type> [genre] [year] [rating]` — Discover media by genre, year and minimum rating with randomized results
- `/collection <title>` — View all movies in a franchise/collection with Jellyfin availability
- `/cast <name>` — Browse an actor's full filmography with pagination, character names and availability
- `/similar <title>` — Find similar titles based on genre and keywords (different algorithm than /recommend)

### New Features
- **Availability status** — All embed lists (/search, /discover, /recommend, /upcoming) now show Seerr status icons: ✅ available, ⏳ requested, 📥 partially available
- **Content ratings** — FSK/MPAA age ratings shown in search embeds, configurable by country via `CONTENT_RATING_COUNTRY`
- **Streaming providers** — Show where a title is available for streaming (Netflix, Disney+, etc.) via TMDB Watch Providers API, configurable via `PROVIDER_COUNTRY`
- **Trailer buttons** — YouTube trailer links automatically added to /search and /request embeds when available on TMDB
- **Health-check bar** — Real-time service status display (Seerr, Jellyfin, Discord) in the dashboard
- **Statistics dashboard** — Command usage statistics with per-user breakdown and top commands
- **Embeddable widget** — HTML widget for Homarr, Homepage or Organizr with bot status, uptime, command stats and start/stop controls
- **Daily random pick** — Scheduled random media recommendation to a Discord channel (configurable interval)
- **Daily recommendation** — Scheduled recommendation from Jellyfin library to a Discord channel
- **Requester info in admin notifications** — MEDIA_PENDING embeds in admin channel now show who requested the media (username + avatar in footer)
- **Unsaved changes warning** — Browser warns before navigating away from the dashboard with unsaved config changes
- **Dashboard configuration toggles** — New UI toggles for content rating, streaming providers and country selection

### Fixes
- `/recommend` autocomplete parsing fixed (TMDB 404 errors due to wrong offset in `id|mediaType` format)
- Watch Now button now appears for partially available TV series (status 4 in addition to 5)
- `/cast` rewritten with full pagination (PAGE_SIZE=10) instead of showing only 15 items
- 8 silent `catch(_){}` blocks replaced with proper error logging across all bot commands

### Privacy
- `/watchlist` now hides other users' real names (displayed as "A User")
- Widget stats anonymization toggle (`WIDGET_ANONYMIZE_STATS`) replaces usernames with "User 1", "User 2" etc.
- Removed TMDB from system status display (not self-hosted, always reachable)

### Security
- Directory permissions tightened from `0o777` to `0o755` (config directory creation)
- Audit logging added for webhook secret and widget API key access endpoints
- All npm dependencies updated to resolve CVEs (axios, express, undici, jws, etc.) — 0 vulnerabilities
- JSDoc security documentation for user mapping endpoint

---

## [2.1.1] - 2026-04-03

### Security
- Container runs as non-root user via entrypoint.sh + su-exec
- Enabled Content Security Policy (CSP) with strict policy
- Webhook secret transmitted via Authorization header instead of URL query parameter
- Brute-force lockouts now persist across container restarts
- Trust proxy configurable via TRUST_PROXY environment variable