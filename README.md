<div align="center">
  <img src="./assets/logo-transparent.png" alt="Questorr Logo" width="160"/>

  # Questorr

  **A self-hosted Discord bot that bridges Jellyfin and Seerr — with smart notifications, automatic channel routing, and a fully featured web dashboard.**

  [![Version](https://img.shields.io/badge/version-2.4.5-brightgreen)](https://github.com/Jellyforge-Dev/Questorr/releases)
  [![Docker](https://img.shields.io/badge/Docker-jellyforge%2Fquestorr-blue?logo=docker)](https://hub.docker.com/r/jellyforge/questorr)
  [![License](https://img.shields.io/badge/License-AGPL--3.0-blue)](LICENSE)
  [![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/rXANrXJqVf)

  [🇬🇧 English](README.md) &nbsp;|&nbsp; [🇩🇪 Deutsch](README.de.md) &nbsp;|&nbsp; [🇫🇷 Français](README.fr.md) &nbsp;|&nbsp; [🇪🇸 Español](README.es.md) &nbsp;|&nbsp; [🇧🇷 Português (Brasil)](README.pt_br.md) &nbsp;|&nbsp; [🇸🇪 Svenska](README.sv.md)

  [💬 Discord Community](https://discord.gg/rXANrXJqVf) &nbsp;|&nbsp; [<img src="https://storage.ko-fi.com/cdn/cup-border.png" height="14" alt="Ko-fi"> Buy me a Coffee](https://ko-fi.com/jellyforgedev) &nbsp;|&nbsp; [🐛 Report a Bug](https://github.com/Jellyforge-Dev/Questorr/issues)

</div>

---

> **📸 Demo notice:** All GIFs in this README are recorded from a test server with no real user data. The live version may look slightly different and shows more content depending on your configuration.

<div align="center">
  <img src="GIFs/Request_Process-BotSetup.gif" alt="Search, request, admin approval and availability notification in action" width="100%"/>
</div>

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔍 `/search` | Search for movies and TV shows, request directly from the embed |
| 📤 `/request` | Instant media requests with optional tag, server and quality selection |
| 🔥 `/trending` | Browse weekly trending movies and TV shows |
| 🔎 `/status` | Check the Seerr request status of any title — with poster, summary, genre, runtime, rating and age rating. Shows a Request button if not yet requested |
| 🎲 `/random` | Get a random movie or series from your Jellyfin library — with poster, summary, genre, runtime and rating. Only visible to the user who ran the command |
| 🐛 `/report` | Report a problem (video / audio / subtitle) with a Jellyfin title (`/report movie` · `/report series`). Opens a Seerr issue; admins comment & resolve straight from Discord, and the reporter gets DMs |
| 💡 `/recommend` | Get recommendations based on a movie or TV show via TMDB |
| 🧭 `/discover` | Discover media by genre, year and minimum rating |
| 📦 `/collection` | View all movies in a franchise/collection with availability |
| 🎭 `/cast` | Browse an actor's full filmography with pagination |
| 🔗 `/similar` | Find similar titles based on genre and keywords |
| 📥 `/queue` | Track the status of **your own** requests — grouped by stage (waiting, downloading, available, declined, failed) |
| 🔔 `/subscribe` | Subscribe to a series for a DM when a new season drops, plus an opt-in **personalised weekly recommendation DM** |
| ✨ `/foryou` | Personalised recommendations based on your Jellyfin watch history |
| 🔖 `/watchlist` | View recent media requests from Seerr |
| 🕘 `/history` | View recently added movies and series on Jellyfin |
| 📅 `/upcoming` | Browse upcoming movie releases and new TV shows from TMDB |
| ❓ `/help` | Show all available commands with quick-action buttons |
| 🆕 Weekly digest | Opt-in weekly post of new movies, series **and episodes** added to your Jellyfin library |
| 🚦 Per-user quota | Optional rolling 7-day request limit per user, with bypass roles and unlimited users |
| 🔔 Smart notifications | Rich Discord embeds for all Seerr events (pending, approved, available, declined, failed, issues) |
| 📺 Channel routing | Notifications automatically routed to the correct channel based on Radarr/Sonarr root folder |
| 🔕 Private events | New request and declined notifications go directly to the requester as a DM — not to the public channel |
| ✉️ Private DMs | Users receive a DM when their requested content is approved, declined or becomes available |
| 🔘 Button toggles | Choose which buttons (View on Seerr, Watch Now, Letterboxd, IMDb) appear on notification embeds |
| 👤 User mapping | Link Discord accounts to Seerr accounts so requests appear from the correct user |
| 🔐 Role permissions | Control who can use bot commands via Discord role allowlist / blocklist |
| 🌟 Daily recommendation | Post a daily pick from your existing Jellyfin library |
| 🎲 Daily random pick | Post a daily random suggestion from TMDB |
| 🎨 Custom embed colors | Customize the search-results and success-confirmation embed colors |
| ⚙️ Web dashboard | Full configuration at `http://your-server:8282` — Tetris-style UI |
| 🎨 Dark / light theme | Retro-dark default plus a Paper-Terminal light theme; the toggle is persisted per browser |
| 🛡️ Audit log | Dashboard **Audit** tab: who approved/declined a request, changed config, started/stopped the bot, or logged in |
| 🚨 Health alerts | Optional: posts to an admin channel when Seerr or Jellyfin goes **down** or **recovers** |
| ❤️ Container health check | Built-in Docker `HEALTHCHECK` on `/api/health` — Portainer / Docker / Uptime Kuma see the container as healthy |
| 📱 Mobile-friendly | Responsive dashboard, works on smartphones and tablets |
| ✅ Availability status | All embed lists show Seerr status: ✅ available, ⏳ requested, 📥 partial |
| 🎬 Content ratings | FSK/MPAA age ratings in search embeds, configurable by country |
| 📡 Streaming providers | Show where a title is available for streaming (Netflix, Disney+, etc.) |
| ▶️ Trailer buttons | YouTube trailer links in /search and /request embeds |
| 💚 Health-check bar | Real-time service status display in the dashboard |
| 📊 Statistics dashboard | Command usage statistics with per-user breakdown |
| 🧩 Embeddable widget | HTML widget for Homarr/Homepage/Organizr with bot status and controls |
| 🌍 Multi-language | Dashboard and bot fully translated into English, German, French, Spanish, Brazilian Portuguese and Swedish |

> 📖 **New here?** The [**Full Usage & Configuration Guide**](docs/USAGE.md) explains
> **every** command, feature and setting in plain language — including the Seerr
> webhook status badge and the common Docker URL pitfall.

---

## 📋 Prerequisites

- A running **[Jellyfin](https://jellyfin.org/)** server
- A running **[Seerr](https://github.com/seerr-team/seerr)** instance (connected to [Radarr](https://github.com/Radarr/Radarr)/[Sonarr](https://github.com/Sonarr/Sonarr))
- A **Discord** account with admin access to a server
- **Docker** (recommended) or Node.js 20+
- API keys: [TMDB](https://www.themoviedb.org/settings/api) (required) · [OMDb](http://www.omdbapi.com/apikey.aspx) (optional)

---

## 🚀 Quick Start

### Docker Compose (recommended)

**Standard setup** — direct access via IP and port:

```yaml
services:
  questorr:
    image: jellyforge/questorr:latest
    container_name: questorr
    restart: unless-stopped
    environment:
      - WEBHOOK_PORT=8282
      - NODE_ENV=production
    ports:
      - "8282:8282"
    volumes:
      - ./questorr-data:/usr/src/app/config
```

Then open `http://your-server-ip:8282` and follow the setup wizard.

**With a reverse proxy** ([Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager), [Traefik](https://github.com/traefik/traefik), [Caddy](https://github.com/caddyserver/caddy)) — remove `ports` and add the shared network instead:

```yaml
services:
  questorr:
    image: jellyforge/questorr:latest
    container_name: questorr
    restart: unless-stopped
    environment:
      - WEBHOOK_PORT=8282
      - NODE_ENV=production
    volumes:
      - ./questorr-data:/usr/src/app/config
    networks:
      - proxy             # Must match the network name of your reverse proxy

networks:
  proxy:                  # Must match the network name of your reverse proxy
    external: true
```

Reverse proxy forward settings: Scheme: `http` · Host / Forward hostname: `questorr` · Port: `8282`

### Docker Tags

| Tag | Description |
|---|---|
| `latest` | Latest stable release |
| `dev` | Development build (may be unstable) |
| e.g. `2.4.5` | Specific pinned version — see [Releases](https://github.com/Jellyforge-Dev/Questorr/releases) for all tags |

### Manual (Development)

```bash
git clone https://github.com/Jellyforge-Dev/Questorr.git
cd Questorr
npm install
node app.js
```

---

## ⚙️ Setup

### 1. Create a Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → New Application
2. **Bot** → Reset Token to get a token, then enable `Server Members Intent` (required for user mapping)
3. **OAuth2** → copy the **Client ID**
4. Paste both into Questorr's dashboard (Step 1) and click **"Invite Bot to Server"** — the dashboard builds the invite link for you with exactly the permissions needed (`Send Messages`, `Embed Links`, `Pin Messages`), no manual OAuth2 URL Generator step required

### 2. Configure via Web Dashboard

Open `http://your-server-ip:8282`, create an account and complete all steps:

| Step | What to configure |
|---|---|
| 1. Discord | Bot token, client ID, server, default notification channel |
| 2. Seerr | Seerr URL, API key, webhook URL, channel routing, root folder mapping |
| 3. Media Databases | TMDB API key (required), OMDb API key (optional) |
| 4. Jellyfin | Server URL, API key, server ID, notification channel |
| 5. User Mapping | Link Discord users to Seerr accounts |
| 6. Role Permissions | Allowlist / blocklist for bot commands |
| 7. Miscellaneous | Auto-start, DMs, daily picks, embed colors, `/request` options, Discord commands, notification buttons |

### 3. Configure Seerr Webhook

In **Seerr → Settings → Notifications → Webhook**, configure the following:

| Field | Value |
|---|---|
| Webhook URL | The URL shown in Questorr under **Step 2 → Seerr Webhook URL** |
| Authorization Header | Paste the secret shown under **Step 2 → Copy Secret** |

> The secret is transmitted via the `Authorization` header — it never appears in the URL or server logs.

**Recommended: enable all notification types in Seerr** so Questorr can forward the full request lifecycle to Discord:

| Seerr event | What Questorr does |
|---|---|
| Request pending approval | Posts to the **admin channel** (with Approve/Decline buttons) · sends DM to requester |
| Request approved / auto-approved | Posts to default channel · sends DM to requester |
| Media available | Posts to the matching root folder channel · sends DM to requester |
| Request declined | Sends DM to the requester only |
| Download failed | Posts to admin channel |
| Issue created | Posts to the **admin channel** (with Comment / Resolve buttons) |
| Issue comment / resolved / reopened | Sends a **DM to the reporter** (for `/report` follow-ups) |

> **For `/report` to work**, enable issues in **Seerr → Settings → General**
> (*Enable Issue Reporting*) and tick the **Issue** webhook events above.
> Because Questorr acts as the **mapped Seerr user** (Step 5), that user needs
> the matching Seerr permission for each action — **Request** to request,
> **Auto-Approve** for instant approval, **Report Issues** for `/report`.

> ⚠️ **Make your admin channel private.** The Approve/Decline buttons on a
> pending-request post have **no separate permission check** of their own —
> clicking them calls Seerr with Questorr's own API key, which is allowed to
> approve or decline *any* request. Anyone who can see that channel can
> effectively act with the same power as your Seerr API key. If you don't
> use Seerr's auto-approve, restrict the admin channel's Discord permissions
> so only trusted admins/moderators can view it — otherwise any member who
> stumbles into that channel can approve their own (or anyone else's)
> requests.

### 4. Channel Routing

Under **Step 2 → Root Folder → Channel Mapping**, click **Load Root Folders**, then assign a Discord channel to each Radarr/Sonarr root folder. Questorr will automatically route `MEDIA_AVAILABLE` notifications to the correct channel — for example, anime requests go to `#anime`, movies to `#movies`.

### 5. Notification Buttons

Under **Step 7 → Notification Buttons**, you can individually enable or disable which buttons appear on Discord notification embeds:

| Button | Description |
|---|---|
| View on Seerr | Links to the media page in Seerr |
| ▶ Watch Now! | Direct link to the Jellyfin player (available content only) |
| Letterboxd | Links to the Letterboxd page (movies only) |
| IMDb | Links to the IMDb page |

Use the **Test Buttons** button to send a preview notification to your admin channel showing the currently active buttons.

---

## 🌐 Environment Variables

| Variable | Description | Default |
|---|---|---|
| `WEBHOOK_PORT` | Web server port | `8282` |
| `LOG_LEVEL` | `error` / `warn` / `info` / `verbose` / `debug` | `info` |
| `TRUST_PROXY` | Set to `false` to disable trust proxy (e.g. without reverse proxy) | `true` |

All other settings are managed through the web dashboard and saved to `config/config.json`.

---

## 🔒 Security

Questorr includes the following security hardening:

| Feature | Details |
|---|---|
| Non-root container | Process runs as `app` user via `entrypoint.sh` + `su-exec` |
| Content Security Policy | Strict CSP headers via `helmet` — inline scripts blocked, `frame-ancestors: none` |
| Authorization header | Webhook secret transmitted via `Authorization` header, never in the URL |
| Brute-force protection | Login lockouts persist across container restarts (written to disk) |
| Rate limiting | API, config and webhook endpoints are rate-limited |
| Configurable trust proxy | `TRUST_PROXY=false` disables proxy trust for direct deployments |
| Directory permissions | Config directories created with `0o755` instead of `0o777` |
| Audit logging | Webhook secret and widget API key access are logged |
| Dependency updates | All npm dependencies updated, 0 known vulnerabilities |

---

## 🔮 Roadmap

Approved feature requests are tracked on the public project board:

➡️ **[Questorr Roadmap →](https://github.com/orgs/Jellyforge-Dev/projects/1)**

Got an idea? [Open a feature request](https://github.com/Jellyforge-Dev/Questorr/issues/new?template=feature_request.yml) — once it's reviewed and approved, it moves onto the board.

---

## 🎬 See it in action

> GIFs are recorded from a test server with no real user data.

### Using the bot

<details>
<summary><b>The complete request flow — search, request, admin approval, "now available"</b></summary>

![Request flow](GIFs/Request_Process-BotSetup.gif)

</details>

<details>
<summary><b>The /help wizard — quick-action buttons for every feature</b></summary>

![For You](GIFs/ForYou-BotSetup.gif)

</details>

<details>
<summary><b>Random Movie / Random Series</b></summary>

![Random Movie / Series](GIFs/Random_Movie_Series-BotSetup.gif)

</details>

<details>
<summary><b>Daily recommendations & the embeddable status widget</b></summary>

![Recommendations](GIFs/Miscellaneous_Recommendation-BotSetup.gif)

</details>

---

### Dashboard setup walkthrough

<details>
<summary><b>Step 1 – Discord Settings</b></summary>

![Discord setup](GIFs/Discord-BotSetup.gif)

</details>

<details>
<summary><b>Step 2 – Seerr Configuration</b></summary>

![Seerr setup](GIFs/Seerr-BotSetup.gif)

> **Root Folder → Channel Mapping** routes "now available" notifications by
> which Radarr/Sonarr root folder a download landed in (e.g. your Anime
> root folder → `#anime`). This needs Seerr talking to Radarr/Sonarr, and
> it's the *first* routing tier Questorr tries — see Step 4 below for what
> happens when it doesn't match (or isn't set up at all).

</details>

<details>
<summary><b>Step 3 – Media Databases (TMDB / OMDb)</b></summary>

![Media Databases setup](GIFs/Media_Databases-BotSetup.gif)

</details>

<details>
<summary><b>Step 4 – Jellyfin Connection</b></summary>

![Jellyfin setup](GIFs/Jellyfin-BotSetup.gif)

> **Jellyfin Library → Channel Mapping** does two jobs. First, it's the
> *second* routing tier for Seerr-triggered notifications, used when the
> root-folder mapping above (Step 2) doesn't match. Second — and
> independently — it powers Questorr's own Jellyfin library watcher, which
> detects new content directly in Jellyfin (however it got there) and posts
> to the channel matching that library. **You can configure only this step
> and skip Seerr/Radarr/Sonarr entirely** if all you want is Discord
> announcing new library content, with no request/approval workflow at all.

</details>

<details>
<summary><b>Step 5 – User Mapping</b></summary>

![User Mapping setup](GIFs/User_Mapping-BotSetup.gif)

</details>

<details>
<summary><b>Step 6 – Role Permissions & Request Quota</b></summary>

![Role Permissions setup](GIFs/Role_Permissions-BotSetup.gif)

</details>

<details>
<summary><b>Step 7 – Miscellaneous (Widget, Subscriptions, Daily Pick)</b></summary>

![Miscellaneous setup](GIFs/Miscellaneous_Widget-BotSetup.gif)

</details>

---

## 🐳 Updating

```bash
docker pull jellyforge/questorr:latest
docker compose up -d
```

---

## 📄 License

This project is licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE). You are free to use, modify and distribute this software under the terms of the AGPL-3.0. If you run a modified version as a web service, you must make the source code available.

---

<div align="center">

Maintained by [Jellyforge-Dev](https://github.com/Jellyforge-Dev) &nbsp;|&nbsp; [💬 Discord](https://discord.gg/rXANrXJqVf) &nbsp;|&nbsp; [<img src="https://storage.ko-fi.com/cdn/cup-border.png" height="14" alt="Ko-fi"> Buy me a Coffee](https://ko-fi.com/jellyforgedev)

</div>
