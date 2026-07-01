# 📖 Questorr — Full Usage & Configuration Guide

This is the complete, beginner-friendly reference for **every** Questorr command,
feature and configuration option. If a one-line description in the README left you
guessing, this is where you find the full answer.

> 🇩🇪 Diese Anleitung gibt es auch [auf Deutsch](USAGE.de.md).

**How to read this guide**

- **Part 1 – Slash commands:** what each `/command` does, its options, and what you get back.
- **Part 2 – Features:** the things that run in the background or in the dashboard (notifications, digest, quota, …).
- **Part 3 – Configuration reference:** every setting in `config/config.json`, grouped by topic, with its default and a plain-English explanation.

---

## Part 1 · Slash Commands

A "slash command" is a command you type in Discord starting with `/`. After you
type `/`, Discord shows a list — pick **Questorr's** command, fill in the fields,
press Enter. Many fields offer **autocomplete**: start typing and Questorr
suggests matching titles/actors/genres; pick a suggestion instead of typing the
exact name.

Three commands only appear when their feature is enabled in the dashboard:
`/status`, `/random` (toggles in **Step 7 → Discord Commands**) and `/foryou`
(needs a configured Jellyfin server). All others are always available.

### 🔍 `/search <title>`
Search for a movie or TV show by name. Returns a rich embed (poster, summary,
genre, runtime, rating). If the title is not yet in your library, a **Request**
button lets you request it right there — pick a season for series, and (if
enabled) a tag, server and quality profile.
- **`title`** *(required, autocomplete)* — the title to search for.
- **Example:** `/search Dune` → embed for *Dune (2021)* with a Request button.

### 📤 `/request <title> [tag] [server] [quality]`
Skip the search step and request a title immediately. The optional fields only
appear if you enabled them in **Step 7** (otherwise the defaults are used).
- **`title`** *(required, autocomplete)* — what to request.
- **`tag`** *(optional, autocomplete)* — a Radarr/Sonarr tag, e.g. `anime`.
- **`server`** *(optional, autocomplete)* — which Radarr/Sonarr server handles it.
- **`quality`** *(optional, autocomplete)* — which quality profile to use.
- **Example:** `/request The Bear server:Sonarr-4K quality:1080p`.

### 🔥 `/trending <title>`
Browse what is trending this week. Start typing in the `title` field and pick from
the trending suggestions, then request straight from the embed.
- **`title`** *(required, autocomplete)* — select from the trending list.

### 🔎 `/status <title>`  *(only if enabled)*
Check whether a title is already requested/available in Seerr, with poster,
summary, genre, runtime, rating and age rating. Shows a **Request** button if it
has not been requested yet.
- **`title`** *(required, autocomplete)* — the title to check.

### 🎲 `/random <type>`  *(only if enabled)*
Get a random title **from your own Jellyfin library** — a "what should I watch
tonight" pick. The reply is **only visible to you** (ephemeral).
- **`type`** *(required)* — `🎬 Movie` or `📺 Series`.

### 🐛 `/report movie` · `/report series`  *(only if enabled)*
Report a playback problem with a title that's **on your Jellyfin server**. Title
suggestions come **only from the Jellyfin library** (you can't report something
that isn't there), and the issue is opened in Seerr under **your** mapped user.
You get a **summary DM** of what you filed, and another DM when an admin
comments or resolves it.
- **`/report movie`** — `title` *(required, autocomplete)*, `type`
  *(required: Video / Audio / Subtitle)*, `message` *(required)*.
- **`/report series`** — `title`, `season`, `episode`, `type` and `message`
  are **all required**.

Admins handle issues straight from the **admin channel**: the post carries
**💬 Comment** and **✅ Resolve** buttons (no Seerr web UI needed). The whole
conversation stays private between the reporter and the admins/Seerr.
Toggle the command in **Step 7 → Misc** (`SHOW_REPORT_COMMAND`).

> **Seerr requirements.** Issues are a Seerr feature, so:
> - **Enable Issues** in **Seerr → Settings → General** (the global *Enable Issue
>   Reporting* toggle).
> - The reporter must be **mapped** (Step 5) to a Seerr user, and that user needs
>   the **Report Issues** permission in Seerr — otherwise the issue can't be
>   created on their behalf.
> - Enable the **Issue** webhook events (see above) so comment/resolve DMs reach
>   the reporter.

### 💡 `/recommend <title>`
Get TMDB recommendations based on a movie or show you like.
- **`title`** *(required, autocomplete)* — the title to base recommendations on.
- **Example:** `/recommend Interstellar` → similar sci-fi titles, each with availability status.

### 🧭 `/discover <type> [genre] [year] [rating]`
Browse the catalogue by filters instead of a known title.
- **`type`** *(required)* — `🎬 Movies` or `📺 TV Shows`.
- **`genre`** *(optional, autocomplete)* — e.g. *Action*, *Comedy*.
- **`year`** *(optional, 1900–2030)* — release year.
- **`rating`** *(optional, 1–10)* — minimum TMDB rating.
- **Example:** `/discover type:Movies genre:Horror year:2023 rating:7` → highly-rated 2023 horror.

### 📦 `/collection <title>`
Show every movie in a franchise/collection (e.g. all *John Wick* films) with each
title's availability.
- **`title`** *(required, autocomplete)* — any movie in the collection; Questorr finds the rest.

### 🎭 `/cast <name>`
Browse an actor's full filmography, paginated, with library availability shown per title.
- **`name`** *(required, autocomplete)* — actor or actress name.

### 🔗 `/similar <title>`
Find titles similar to a given one, matched by genre and keywords.
- **`title`** *(required, autocomplete)* — the reference title.

### 📥 `/queue`
Show the status of **your own** requests, grouped by stage: waiting, downloading,
available, declined, failed. No options — it always shows the caller's requests.

### 🔔 `/subscribe …`
Manage personal subscriptions. Four subcommands:
- **`/subscribe series <title>`** — get a **DM when a new season** of that series
  appears on Jellyfin. `title` is autocompleted.
- **`/subscribe remove <title>`** — unsubscribe from a series. `title` autocompletes
  to **your own** subscriptions only.
- **`/subscribe weekly`** — toggle a **personalised weekly recommendation DM** on/off.
- **`/subscribe list`** — show everything you are currently subscribed to.

### ✨ `/foryou [filter]`  *(needs Jellyfin)*
Personalised recommendations built from **your** Jellyfin watch history.
- **`filter`** *(optional)* — `🌐 All recommendations` (lets you request missing
  titles) or `✅ Only available in library`.

### 🔖 `/watchlist [filter]`
View recent media requests from Seerr.
- **`filter`** *(optional)* — `📋 All Requests`, `👤 My Requests`, `⏳ Pending` or `✅ Available`.

### 🕘 `/history [type]`
View recently added movies and series on Jellyfin.
- **`type`** *(optional)* — `📋 All`, `🎬 Movies` or `📺 Series`.

### 📅 `/upcoming [type]`
Browse upcoming movie releases and new TV shows from TMDB.
- **`type`** *(optional)* — `📋 All`, `🎬 Movies` or `📺 TV Shows`.

### ❓ `/help`
Show all available commands with quick-action buttons. Good starting point for new users.

---

## Part 2 · Features

These run in the background or live in the dashboard. They are configured once and
then work automatically.

### 🔔 Seerr Webhook & the status "traffic light"

This is how Questorr learns about Seerr events (request approved, media available,
declined, …) and turns them into Discord messages. **It is the single most
important integration to get right**, so follow carefully.

**1. Set a webhook secret in Questorr.** In **Step 2 → Seerr Webhook URL**, copy
the **Secret**. Without a secret, Questorr rejects all incoming webhooks with
HTTP 503 (`NO_SECRET`).

**2. Enter the URL and secret in Seerr.** In **Seerr → Settings → Notifications →
Webhook**:
- **Webhook URL** → the URL shown in Questorr.
- **Authorization Header** → paste the secret (exactly, no extra spaces — a
  mismatch is rejected with HTTP 401 / `AUTH_FAIL`).
- Enable the webhook and tick the notification types you want. For `/report`
  follow-ups to reach the reporter, also enable the **Issue** events
  (Issue Created / Comment / Resolved / Reopened).

> ⚠️ **Docker URL gotcha (the #1 cause of "nothing arrives").** The URL Questorr
> shows uses the address *you* opened the dashboard with, e.g.
> `http://localhost:8283/seerr-webhook`. That will **not** work from inside the
> Seerr container, where `localhost` means Seerr itself. Use an address Seerr can
> actually reach:
> - **Same Docker network:** the Questorr container name + internal port, e.g.
>   `http://questorr:8282/seerr-webhook`.
> - **Separate hosts:** your server's LAN IP, e.g. `http://192.168.1.10:8282/seerr-webhook`.
> - **Reverse proxy:** your public URL, e.g. `https://questorr.example.com/seerr-webhook`.

**3. Confirm it works — read the traffic light.** The setup box shows a live
status badge that polls every 30 seconds:
- 🟡 **Never received** — no webhook has ever arrived. Expected before the first
  event. To turn it green, click **Test** in Seerr's webhook settings (it sends a
  `TEST_NOTIFICATION`), or trigger any real Seerr event.
- 🔴 **Auth error** — a webhook arrived but the secret did not match. The tooltip
  shows a length/prefix hint. Re-copy the secret into Seerr's **Authorization
  Header** field (not the URL).
- 🟢 **OK** — the last webhook was accepted. You are done.

| Badge | Meaning | Fix |
|---|---|---|
| 🟡 Never received | Seerr has never reached Questorr | Check the URL (Docker gotcha above), then click **Test** in Seerr |
| 🔴 Auth error | Wrong/missing secret | Re-paste the secret into Seerr's *Authorization Header* |
| 🟢 OK | Working | — |

### 📺 Channel routing
Questorr decides which Discord channel each Seerr event goes to, in this order:
1. **Root folder → channel** (`SEERR_ROOT_FOLDER_CHANNELS`) — e.g. anime root
   folder → `#anime`. Configure under **Step 2 → Root Folder → Channel Mapping**
   (click *Load Root Folders* first).
2. **Jellyfin library → channel** (`JELLYFIN_NOTIFICATION_LIBRARIES`) — matched via TMDB ID.
3. **Media-type → channel** (`CHANNEL_MOVIES` / `CHANNEL_SERIES`).
4. **`SEERR_CHANNEL_ID`** — the default Seerr channel.
5. **`JELLYFIN_CHANNEL_ID`** — final fallback.

Some events (e.g. *Media available*) don't include the root folder in the payload;
Questorr then asks Seerr, and Radarr/Sonarr, before falling back.

### 🔕 Private events & DMs
- **Pending approval** and **declined** notifications go **only as a DM** to the
  requester — never to a public channel.
- Requesters get a DM when their content is **approved, declined or available**.
- With `APPROVAL_DM_ONLY` (default on), approval events are DM-only to keep
  channels quiet.

### 🆕 Weekly library digest
An opt-in weekly post listing what's **new in your Jellyfin library** since the
last digest: new movies, new series, **and new episodes** of series you already
have. Enable it under the **Digest** section (set channel, day, time). Use the
**Send test digest now** button to preview it immediately; the diagnostic output
tells you why a digest would be empty (nothing new, no channel, disabled, …).

### 🚦 Per-user request quota
An optional **rolling 7-day** limit on how many requests each user may make.
- `QUOTA_WEEKLY_LIMIT` — `0` means unlimited (off). Any positive number is the cap.
- **Bypass roles** — members with these Discord roles ignore the limit.
- **Unlimited users** — specific members who ignore the limit. The dashboard lets
  you pick a Discord **role first**, then choose members from that role (with avatars).

### 👤 User mapping
Links a Discord account to a Seerr account so requests show up under the correct
Seerr user (and Seerr's own per-user quotas apply). Configure under user mapping;
you can filter the member picker by a Discord role first.

> **Seerr permissions matter.** Questorr acts *as the mapped Seerr user* (via the
> `x-api-user` header). That user must have the relevant Seerr permission for the
> action to succeed: **Request** to send requests, **Auto-Approve** if you want
> instant approval, and **Report Issues** for `/report`. An unmapped user falls
> back to the API-key owner (admin).

### 🔐 Role permissions
Control who may use Questorr's commands:
- **Allowlist** (`ROLE_ALLOWLIST`) — if set, *only* these roles may use commands.
- **Blocklist** (`ROLE_BLOCKLIST`) — these roles may *never* use commands.
Leave both empty to allow everyone.

### 🌟 Daily picks & 🎲 daily random
- **Daily recommendation** — posts a daily pick from your **existing Jellyfin
  library**.
- **Daily random pick** — posts a daily random suggestion from **TMDB**.
Each can run on a fixed interval or at a fixed time of day, in its own channel.

### 🧹 Cleanup advisor
A weekly post listing **rarely-watched movies** as deletion candidates, based on
age, play count and time since last play. Server-aggregated, movies only,
opt-in. Useful for keeping a NAS tidy.

### 🔄 Seerr status poller
A safety net for missed `MEDIA_APPROVED` webhooks (e.g. when an admin approves
directly in the Seerr UI without that notification type enabled). When enabled, it
polls Seerr and DMs the requester on pending → approved/declined transitions.

### 📡 Jellyfin poller
Detects newly added Jellyfin content **without** the Jellyfin webhook plugin. It
polls every `JELLYFIN_POLL_INTERVAL_SECONDS`, optionally triggers a library scan
first (`JELLYFIN_AUTO_REFRESH`), and only notifies items added within the last
`JELLYFIN_RECENT_ADDED_DAYS` days.

### 🧩 Embeddable status widget
An HTML widget (for Homarr / Homepage / Organizr) showing bot status, statistics
and start/stop controls. Protect it with `WIDGET_API_KEY`, restrict embedding with
`WIDGET_ALLOWED_ORIGINS`, and hide real names with `WIDGET_ANONYMIZE_STATS`.

### 💚 Health-check bar & 📊 statistics
The dashboard shows a real-time health bar (is Discord/Seerr/Jellyfin/TMDB
reachable?) and a statistics panel with command usage broken down per user.

### 🐛 Issue reporting & resolution
Users file playback problems with `/report` (see Part 1). Issues are **private**:
they go to the **admin channel** only and are opened in Seerr under the reporter's
mapped user. The admin post carries **💬 Comment** and **✅ Resolve** buttons, so
admins handle everything from Discord. Commenting / resolving flows back through
Seerr's `ISSUE_COMMENT` / `ISSUE_RESOLVED` webhooks, which **DM the reporter** — so
enable those issue events on your Seerr webhook. Toggle the command with
`SHOW_REPORT_COMMAND`.

### 🛡️ Admin audit log
The dashboard log viewer has an **Audit** tab recording security-relevant admin
actions: request **approve/decline** (which Discord user), **config saves**
(changed key names only — never secret values), **bot start/stop**, and
**dashboard logins** (success + failure with IP). Stored in a bounded
`config/admin-audit.json`.

### 🚨 Proactive health alerts
Optional watchdog (**Step 7 → Misc**, off by default). When enabled, Questorr
periodically checks whether **Seerr** and **Jellyfin** are reachable and posts to
an admin channel when a service **goes down** or **recovers** — so you notice an
outage before users do. The **first** check after start only records a baseline
(no alert), so a restart never spams. Settings:
- `HEALTH_ALERTS_ENABLED` — master switch.
- `HEALTH_ALERT_INTERVAL_SECONDS` — how often to check (default `120`, min 30).
- `HEALTH_ALERT_CHANNEL_ID` — where to post; empty falls back to the admin
  channel (`SEERR_ADMIN_CHANNEL_ID` → `SEERR_CHANNEL_ID` → `JELLYFIN_CHANNEL_ID`).

### 🎨 Dashboard themes (dark / light)
The dashboard ships a **retro neon/pixel dark** theme (default) and a
**Paper-Terminal light** theme. The navbar toggle is applied before paint (no
flash) and remembered per browser. Motion (entrance, scroll reveals, the falling
Tetris background) honors `prefers-reduced-motion`.

### 🌍 Multi-language
The dashboard and bot speak **English** and **German**. UI language is remembered
per browser; bot language is set separately (`BOT_LANGUAGE`).

---

## Part 3 · Configuration Reference

Every setting lives in `config/config.json` (created on first run, also editable in
the dashboard). Values are stored as strings unless noted. **Defaults are shown in
`code`.** You rarely need to touch most of these — the dashboard wizard sets the
important ones for you.

### Core · Discord
| Setting | Default | Meaning |
|---|---|---|
| `DISCORD_TOKEN` | `""` | Your Discord bot token. Required. |
| `BOT_ID` | `""` | The bot's application/client ID. Required. |
| `GUILD_ID` | `""` | Your Discord server ID. Commands register instantly to this server; empty = global registration (up to 1 h delay). |
| `AUTO_START_BOT` | `"true"` | Start the bot automatically when Questorr launches. |
| `COMMAND_RATE_LIMIT` | `"10"` | Max commands per user per minute. |
| `JWT_SECRET` | `""` | Secret for dashboard login sessions. Auto-generated if empty. |
| `DEBUG` | `"false"` | Verbose logging. Leave off in normal use. |

### Seerr
| Setting | Default | Meaning |
|---|---|---|
| `SEERR_URL` | `"http://localhost:5055"` | Base URL of your Overseerr/Jellyseerr. |
| `SEERR_API_KEY` | `""` | Seerr API key. Required for requests/status. |
| `SEERR_AUTO_APPROVE` | `"true"` | Auto-approve requests made through Questorr. |

### Media databases
| Setting | Default | Meaning |
|---|---|---|
| `TMDB_API_KEY` | `""` | **Required.** Powers search, discover, posters, recommendations. |
| `OMDB_API_KEY` | `""` | Optional. Adds extra ratings (IMDb/Rotten Tomatoes). |

### Jellyfin
| Setting | Default | Meaning |
|---|---|---|
| `JELLYFIN_BASE_URL` | `""` | Jellyfin server URL. Needed for `/random`, `/foryou`, availability. |
| `JELLYFIN_API_KEY` | `""` | Jellyfin API key. |
| `JELLYFIN_SERVER_ID` | `""` | Jellyfin server ID (used for deep links). |
| `JELLYFIN_CHANNEL_ID` | `""` | Final fallback channel for notifications. |
| `JELLYFIN_EPISODE_CHANNEL_ID` | `""` | Channel for new-episode notifications. |
| `JELLYFIN_SEASON_CHANNEL_ID` | `""` | Channel for new-season notifications. |
| `JELLYFIN_NOTIFICATION_LIBRARIES` | `{}` | Map of Jellyfin library → Discord channel (routing). |
| `JELLYFIN_NOTIFY_MOVIES` | `"true"` | Notify when a movie is added. |
| `JELLYFIN_NOTIFY_SERIES` | `"true"` | Notify when a series is added. |
| `JELLYFIN_NOTIFY_SEASONS` | `"false"` | Notify when a new season is added. |
| `JELLYFIN_NOTIFY_EPISODES` | `"false"` | Notify when a new episode is added. |

### Jellyfin poller (newly-added detection)
| Setting | Default | Meaning |
|---|---|---|
| `JELLYFIN_POLL_INTERVAL_SECONDS` | `"120"` | How often to check Jellyfin for new items. `0` disables polling. |
| `JELLYFIN_AUTO_REFRESH` | `"true"` | Trigger a Jellyfin library scan before each poll (throttled to once/60 s). |
| `JELLYFIN_RECENT_ADDED_DAYS` | `"7"` | Only notify items added within the last N days. `0` disables the filter (power-user; lets a manual scan spam your whole library). |
| `JELLYFIN_RETRY_DELAY_SECONDS` | `"30"` | Delay before retrying a `MEDIA_AVAILABLE` event. `0` = off. |
| `JELLYFIN_POLLER_METADATA_DELAY_SECONDS` | `"60"` | Wait this long for a TMDB ID before notifying. `0` = send immediately. |
| `JELLYFIN_POLLER_SHOW_BUTTON_WATCH` | `"true"` | Show *Watch Now* button on poller notifications. |
| `JELLYFIN_POLLER_SHOW_BUTTON_IMDB` | `"true"` | Show *IMDb* button on poller notifications. |
| `JELLYFIN_POLLER_SHOW_BUTTON_LETTERBOXD` | `"true"` | Show *Letterboxd* button on poller notifications. |

### Webhook
| Setting | Default | Meaning |
|---|---|---|
| `WEBHOOK_PORT` | `"8282"` | Port for the dashboard and the Seerr webhook endpoint. |
| `WEBHOOK_SECRET` | `""` | Shared secret Seerr must send in the `Authorization` header. **Required for webhooks.** |
| `WEBHOOK_DEBOUNCE_MS` | `"15000"` | Ignore duplicate events arriving within this window (ms). |

### Notification channels & routing
| Setting | Default | Meaning |
|---|---|---|
| `SEERR_CHANNEL_ID` | `""` | Default channel for Seerr events. |
| `SEERR_ADMIN_CHANNEL_ID` | `""` | Admin channel (pending approval, download failed). Empty = same as default. |
| `SEERR_ROOT_FOLDER_CHANNELS` | `{}` | Map of Radarr/Sonarr root folder → channel (highest-priority routing). |
| `CHANNEL_MOVIES` | `""` | Channel for movie events (media-type routing). |
| `CHANNEL_SERIES` | `""` | Channel for series events. |
| `POST_HELP_CHANNEL_ID` | `""` | Channel where the `/help` overview can be posted. |

### Notification behaviour
| Setting | Default | Meaning |
|---|---|---|
| `NOTIFY_ON_AVAILABLE` | `"true"` | Send a notification when media becomes available. |
| `APPROVAL_DM_ONLY` | `"true"` | Send approval events only as a DM, not to a public channel. |
| `PRIVATE_MESSAGE_MODE` | `"false"` | Deprecated / no-op — **all** command replies are now always private (ephemeral, only visible to the user who ran the command). |

### Seerr status poller
| Setting | Default | Meaning |
|---|---|---|
| `SEERR_STATUS_POLLING_ENABLED` | `"false"` | Poll Seerr to catch missed approval/decline webhooks. |
| `SEERR_STATUS_POLL_INTERVAL_SECONDS` | `"120"` | How often to poll. |
| `HEALTH_ALERTS_ENABLED` | `"false"` | Post to an admin channel when Seerr/Jellyfin goes down or recovers. |
| `HEALTH_ALERT_INTERVAL_SECONDS` | `"120"` | How often to check reachability (min 30, max 3600). |
| `HEALTH_ALERT_CHANNEL_ID` | `""` | Health-alert channel; empty falls back to the admin channel. |

### Per-user quota
| Setting | Default | Meaning |
|---|---|---|
| `QUOTA_WEEKLY_LIMIT` | `"0"` | Rolling 7-day request cap per user. `0` = unlimited. |
| `QUOTA_BYPASS_ROLES` | `[]` | Discord roles exempt from the quota. |
| `QUOTA_UNLIMITED_USERS` | `[]` | Specific users exempt from the quota. |

### Subscriptions & weekly recommendation
| Setting | Default | Meaning |
|---|---|---|
| `SUBSCRIPTION_POLL_INTERVAL_MINUTES` | `"60"` | How often to check subscribed series for new seasons. |
| `WEEKLY_RECOMMENDATION_DAY` | `"sunday"` | Day for the weekly recommendation DM (`monday`…`sunday`). |
| `WEEKLY_RECOMMENDATION_TIME` | `"18:00"` | Time (HH:MM, 24 h) for that DM. |

### Weekly digest
| Setting | Default | Meaning |
|---|---|---|
| `DIGEST_ENABLED` | `"false"` | Turn the weekly "new in library" digest on. |
| `DIGEST_CHANNEL_ID` | `""` | Channel to post the digest in. |
| `DIGEST_DAY` | `"monday"` | Day to post (`monday`…`sunday`). |
| `DIGEST_TIME` | `"09:00"` | Time to post (HH:MM, 24 h). |

### Daily random pick (from TMDB)
| Setting | Default | Meaning |
|---|---|---|
| `DAILY_RANDOM_PICK_ENABLED` | `"false"` | Enable the daily random pick. |
| `DAILY_RANDOM_PICK_CHANNEL_ID` | `""` | Channel for it. |
| `DAILY_RANDOM_PICK_INTERVAL` | `"1440"` | Interval in minutes (1440 = daily). |
| `DAILY_RANDOM_PICK_TIME` | `""` | Fixed time (HH:MM). If set, overrides the interval. |

### Daily recommendation (from your library)
| Setting | Default | Meaning |
|---|---|---|
| `DAILY_RECOMMENDATION_ENABLED` | `"false"` | Enable the daily library recommendation. |
| `DAILY_RECOMMENDATION_CHANNEL_ID` | `""` | Channel for it. |
| `DAILY_RECOMMENDATION_INTERVAL` | `"1440"` | Interval in minutes. |
| `DAILY_RECOMMENDATION_TIME` | `""` | Fixed time (HH:MM); overrides the interval. |

### Cleanup advisor
| Setting | Default | Meaning |
|---|---|---|
| `CLEANUP_ADVISOR_ENABLED` | `"false"` | Enable the weekly deletion-candidate post. |
| `CLEANUP_ADVISOR_CHANNEL_ID` | `""` | Channel for it. |
| `CLEANUP_ADVISOR_DAY` | `"sunday"` | Day to post (`monday`…`sunday`). |
| `CLEANUP_ADVISOR_TIME` | `"09:00"` | Time to post (HH:MM). |
| `CLEANUP_MIN_AGE_DAYS` | `"365"` | Movie must have been in the library at least N days. |
| `CLEANUP_MAX_PLAYCOUNT` | `"1"` | Only include movies played at most N times. |
| `CLEANUP_MIN_DAYS_SINCE_PLAYED` | `"180"` | If ever played, the last play must be older than N days. |
| `CLEANUP_MAX_RESULTS` | `"25"` | Max titles listed per post. |
| `CLEANUP_FETCH_TIMEOUT_SECONDS` | `"60"` | Per-page Jellyfin timeout (raise for very large libraries). |

### Request UI & defaults
| Setting | Default | Meaning |
|---|---|---|
| `SHOW_TAG_SELECTION` | `"true"` | Show the `tag` option on `/request`. |
| `SHOW_SERVER_SELECTION` | `"true"` | Show the `server` option on `/request`. |
| `SHOW_QUALITY_SELECTION` | `"true"` | Show the `quality` option on `/request`. |
| `SHOW_STATUS_COMMAND` | `"true"` | Register the `/status` command. |
| `SHOW_RANDOM_COMMAND` | `"true"` | Register the `/random` command. |
| `SHOW_REPORT_COMMAND` | `"true"` | Register the `/report` command (issue reporting). |
| `DEFAULT_QUALITY_PROFILE_MOVIE` | `""` | Default quality profile for movie requests. |
| `DEFAULT_QUALITY_PROFILE_TV` | `""` | Default quality profile for TV requests. |
| `DEFAULT_SERVER_MOVIE` | `""` | Default Radarr server for movies. |
| `DEFAULT_SERVER_TV` | `""` | Default Sonarr server for TV. |

### Embed appearance
| Setting | Default | Meaning |
|---|---|---|
| `EMBED_SHOW_BACKDROP` | `"true"` | Show the large backdrop image. |
| `EMBED_SHOW_OVERVIEW` | `"true"` | Show the plot summary. |
| `EMBED_SHOW_GENRE` | `"true"` | Show genres. |
| `EMBED_SHOW_RUNTIME` | `"true"` | Show runtime. |
| `EMBED_SHOW_RATING` | `"true"` | Show rating. |
| `EMBED_SHOW_CONTENT_RATING` | `"true"` | Show age rating (FSK/MPAA). |
| `CONTENT_RATING_COUNTRY` | `""` | Country code for the age rating (e.g. `US`, `DE`). |
| `EMBED_SHOW_PROVIDERS` | `"true"` | Show streaming providers (Netflix, Disney+, …). |
| `PROVIDER_COUNTRY` | `""` | Country code for provider availability. |
| `EMBED_FOOTER_TEXT` | `""` | Custom footer text on all embeds. |
| `EMBED_SHOW_BUTTON_SEERR` | `"true"` | Show the *View on Seerr* button. |
| `EMBED_SHOW_BUTTON_WATCH` | `"true"` | Show the *Watch Now* button. |
| `EMBED_SHOW_BUTTON_LETTERBOXD` | `"true"` | Show the *Letterboxd* button. |
| `EMBED_SHOW_BUTTON_IMDB` | `"true"` | Show the *IMDb* button. |
| `EMBED_COLOR_MOVIE` | `"#1ec8a0"` | Embed colour for movies. |
| `EMBED_COLOR_SERIES` | `"#1ec8a0"` | Embed colour for series. |
| `EMBED_COLOR_SEASON` | `"#17b8c4"` | Embed colour for season notifications. |
| `EMBED_COLOR_EPISODE_SINGLE` | `"#17b8c4"` | Colour for a single new episode. |
| `EMBED_COLOR_EPISODE_FEW` | `"#17b8c4"` | Colour for a few new episodes. |
| `EMBED_COLOR_EPISODE_MANY` | `"#17b8c4"` | Colour for many new episodes. |
| `EMBED_COLOR_SEARCH` | `"#f0a05a"` | Colour for search embeds. |
| `EMBED_COLOR_SUCCESS` | `"#2ecc8e"` | Colour for success/confirmation embeds. |

### Per-event title & button overrides
These two families let you fine-tune **individual** notification types. Each is
empty by default, which means "use the global default".

- **`NOTIF_TITLE_<EVENT>`** — override the embed title for one event. Events:
  `MEDIA_PENDING`, `MEDIA_APPROVED`, `MEDIA_AUTO_APPROVED`, `MEDIA_AVAILABLE`,
  `MEDIA_DECLINED`, `MEDIA_FAILED`, `ISSUE_CREATED`, `ISSUE_COMMENT`,
  `ISSUE_RESOLVED`, `ISSUE_REOPENED`, `TEST`, `DAILY_RANDOM`, `DAILY_RECOMMENDATION`.
  Empty = use the `BOT_LANGUAGE` default title.
- **`NOTIF_BUTTONS_<EVENT>`** — comma-separated list of buttons to show for one
  event, chosen from `seerr, watch, letterboxd, imdb`. Empty = use the global
  `EMBED_SHOW_BUTTON_*` toggles. There are also `_DM` variants
  (`NOTIF_BUTTONS_<EVENT>_DM`) that control buttons in the DM version of an event;
  empty means no buttons in the DM (except `MEDIA_AVAILABLE`, which inherits the
  channel config for backward compatibility).

### Permissions & mapping
| Setting | Default | Meaning |
|---|---|---|
| `USER_MAPPINGS` | `[]` | Discord ↔ Seerr account links. |
| `ROLE_ALLOWLIST` | `[]` | If set, only these roles may use commands. |
| `ROLE_BLOCKLIST` | `[]` | These roles may never use commands. |

### Localization & formatting
| Setting | Default | Meaning |
|---|---|---|
| `LANGUAGE` | `"en"` | Dashboard language (`en` / `de`). Per-browser choice overrides this. |
| `BOT_LANGUAGE` | `"en"` | Language for Discord messages/embeds. |
| `DATE_FORMAT` | `"auto"` | Date format; `auto` picks a sensible regional default. |
| `TIME_FORMAT` | `"auto"` | Time format; `auto` = 24 h for de, 12 h (AM/PM) for en. |

### Widget
| Setting | Default | Meaning |
|---|---|---|
| `WIDGET_API_KEY` | `""` | Protect the status widget with a key. Empty = public. |
| `WIDGET_ALLOWED_ORIGINS` | `""` | Space-separated list of origins allowed to embed the widget in an iframe. |
| `WIDGET_ANONYMIZE_STATS` | `"false"` | Show "User 1", "User 2" instead of real names in widget stats. |

---

*Questorr is a self-hosted hobby project for home servers. If something here is
unclear or wrong, please open an issue — the docs should be as easy as the bot.*
