<div align="center">
  <img src="./assets/logo-transparent.png" alt="Questorr Logo" width="160"/>

  # Questorr

  **A self-hosted Discord bot that bridges Jellyfin and Seerr — with smart notifications, automatic channel routing, and a fully featured web dashboard.**

  [![Version](https://img.shields.io/badge/version-2.3.0-brightgreen)](https://github.com/Jellyforge-Dev/Questorr/releases)
  [![Docker](https://img.shields.io/badge/Docker-jellyforge%2Fquestorr-blue?logo=docker)](https://hub.docker.com/r/jellyforge/questorr)
  [![License](https://img.shields.io/badge/License-AGPL--3.0-blue)](LICENSE)
  [![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/rXANrXJqVf)

  [🇩🇪 Deutsche Dokumentation](README.de.md) &nbsp;|&nbsp; [💬 Discord Community](https://discord.gg/rXANrXJqVf) &nbsp;|&nbsp; [<img src="https://storage.ko-fi.com/cdn/cup-border.png" height="14" alt="Ko-fi"> Buy me a Coffee](https://ko-fi.com/jellyforgedev) &nbsp;|&nbsp; [🐛 Report a Bug](https://github.com/Jellyforge-Dev/Questorr/issues)

</div>

---

> **📸 Screenshot notice:** All screenshots in this README were taken from a demo environment and show no real user data. The live version may look slightly different and shows more content depending on your configuration.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔍 `/search` | Search for movies and TV shows, request directly from the embed |
| 📤 `/request` | Instant media requests with optional tag, server and quality selection |
| 🔥 `/trending` | Browse weekly trending movies and TV shows |
| 🔎 `/status` | Check the Seerr request status of any title — with poster, summary, genre, runtime, rating and age rating. Shows a Request button if not yet requested |
| 🎲 `/random` | Get a random movie or series from your Jellyfin library — with poster, summary, genre, runtime and rating. Only visible to the user who ran the command |
| 💡 `/recommend` | Get recommendations based on a movie or TV show via TMDB |
| 🧭 `/discover` | Discover media by genre, year and minimum rating |
| 📦 `/collection` | View all movies in a franchise/collection with availability |
| 🎭 `/cast` | Browse an actor's full filmography with pagination |
| 🔗 `/similar` | Find similar titles based on genre and keywords |
| 🔔 Smart notifications | Rich Discord embeds for all Seerr events (pending, approved, available, declined, failed, issues) |
| 📺 Channel routing | Notifications automatically routed to the correct channel based on Radarr/Sonarr root folder |
| 🔕 Private events | New request and declined notifications go directly to the requester as a DM — not to the public channel |
| ✉️ Private DMs | Users receive a DM when their requested content is approved, declined or becomes available |
| 🔘 Button toggles | Choose which buttons (View on Seerr, Watch Now, Letterboxd, IMDb) appear on notification embeds |
| 👤 User mapping | Link Discord accounts to Seerr accounts so requests appear from the correct user |
| 🔐 Role permissions | Control who can use bot commands via Discord role allowlist / blocklist |
| 🌟 Daily recommendation | Post a daily pick from your existing Jellyfin library |
| 🎲 Daily random pick | Post a daily random suggestion from TMDB |
| 🎨 Custom embed colors | Customize notification embed colors per event type |
| ⚙️ Web dashboard | Full configuration at `http://your-server:8282` — Tetris-style UI |
| 📱 Mobile-friendly | Responsive dashboard, works on smartphones and tablets |
| ✅ Availability status | All embed lists show Seerr status: ✅ available, ⏳ requested, 📥 partial |
| 🎬 Content ratings | FSK/MPAA age ratings in search embeds, configurable by country |
| 📡 Streaming providers | Show where a title is available for streaming (Netflix, Disney+, etc.) |
| ▶️ Trailer buttons | YouTube trailer links in /search and /request embeds |
| 💚 Health-check bar | Real-time service status display in the dashboard |
| 📊 Statistics dashboard | Command usage statistics with per-user breakdown |
| 🧩 Embeddable widget | HTML widget for Homarr/Homepage/Organizr with bot status and controls |
| 🌍 Multi-language | English and German dashboard interface |

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
| `2.3.0` | Specific version |

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
2. **Bot** → Enable `Server Members Intent` (required for user mapping)
3. **OAuth2 → URL Generator** → Scopes: `bot` + `applications.commands`
4. Permissions: `Send Messages`, `Embed Links`, `Read Message History`
5. Copy the generated URL, open it in your browser and add the bot to your server

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
| Request pending approval | Sends DM to the requester only |
| Request approved / auto-approved | Posts to default channel · sends DM to requester |
| Media available | Posts to the matching root folder channel · sends DM to requester |
| Request declined | Sends DM to the requester only |
| Download failed | Posts to admin channel |
| Issue created / commented | Posts to default channel |

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

Questorr v2.3.0 includes the following security hardening:

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

## 🔮 Planned Features

These features are on the roadmap and may be added in future releases:

- **`/status <title>`** ✅ *Added in v2.1.1*
- **`/random movie|series`** ✅ *Added in v2.2.0*
- **Notification button toggles** ✅ *Added in v2.2.0*
- **Webhook Test Log** — view the last received webhook events in the dashboard for easier debugging
- **Config Export / Import** — download and restore the full configuration as a JSON backup
- **Bot Status Widget** ✅ *Added in v2.3.0*
- **Multi-language bot responses** — Discord bot replies in the user's preferred language
- **Statistics** ✅ *Added in v2.3.0*

---

## 📸 Screenshots

> Screenshots are from a demo environment with no real data. The live version may look slightly different.

### Desktop

<details>
<summary><b>Authentication</b></summary>

| Register | Login |
|---|---|
| ![Register](assets/Screenshots/EN/Desktop/EN_register.png) | ![Login](assets/Screenshots/EN/Desktop/EN_login.png) |

</details>

<details>
<summary><b>Step 1 – Discord Settings</b></summary>

| Part 1 | Part 2 |
|---|---|
| ![Discord 1/2](assets/Screenshots/EN/Desktop/EN_discord_1-2.png) | ![Discord 2/2](assets/Screenshots/EN/Desktop/EN_discord_2-2.png) |

</details>

<details>
<summary><b>Step 2 – Seerr Configuration</b></summary>

| Part 1 | Part 2 |
|---|---|
| ![Seerr 1/2](assets/Screenshots/EN/Desktop/EN_seerr_1-2.png) | ![Seerr 2/2](assets/Screenshots/EN/Desktop/EN_seerr_2-2.png) |

</details>

<details>
<summary><b>Step 3–4 – Media Databases & Jellyfin</b></summary>

| Media Databases | Jellyfin |
|---|---|
| ![Media Databases](assets/Screenshots/EN/Desktop/EN_mediadatabases.png) | ![Jellyfin](assets/Screenshots/EN/Desktop/EN_jellyfin.png) |

</details>

<details>
<summary><b>Step 5–6 – User Mapping & Role Permissions</b></summary>

| User Mapping | Role Permissions |
|---|---|
| ![User Mapping](assets/Screenshots/EN/Desktop/EN_usermapping.png) | ![Role Permissions](assets/Screenshots/EN/Desktop/EN_rolepermissions.png) |

</details>

<details>
<summary><b>Step 7 – Miscellaneous & Logs</b></summary>

| Miscellaneous 1/2 | Miscellaneous 2/2 | Logs |
|---|---|---|
| ![Misc 1/2](assets/Screenshots/EN/Desktop/EN_miscellaneous_1-2.png) | ![Misc 2/2](assets/Screenshots/EN/Desktop/EN_miscellaneous_2-2.png) | ![Logs](assets/Screenshots/EN/Desktop/EN_logs.png) |

</details>

---

### Mobile

<details>
<summary><b>Mobile Views</b></summary>

| Register | Login | Discord | Seerr |
|---|---|---|---|
| ![Register](assets/Screenshots/EN/Mobile/EN_register.png) | ![Login](assets/Screenshots/EN/Mobile/EN_login.png) | ![Discord](assets/Screenshots/EN/Mobile/EN_discord.png) | ![Seerr](assets/Screenshots/EN/Mobile/EN_seerr.png) |

| Media Databases | Jellyfin | User Mapping | Role Permissions |
|---|---|---|---|
| ![Media DB](assets/Screenshots/EN/Mobile/EN_mediadatabases.jpg) | ![Jellyfin](assets/Screenshots/EN/Mobile/EN_jellyfin.png) | ![User Mapping](assets/Screenshots/EN/Mobile/EN_usermapping.png) | ![Roles](assets/Screenshots/EN/Mobile/EN_rolepermissions.png) |

| Miscellaneous | Logs |
|---|---|
| ![Misc](assets/Screenshots/EN/Mobile/EN_miscellaneous.png) | ![Logs](assets/Screenshots/EN/Mobile/EN_logs.jpg) |

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

Forked from [openVESSL/Anchorr](https://github.com/openVESSL/Anchorr) &nbsp;|&nbsp; Maintained by [Jellyforge-Dev](https://github.com/Jellyforge-Dev) &nbsp;|&nbsp; [💬 Discord](https://discord.gg/rXANrXJqVf) &nbsp;|&nbsp; [<img src="https://storage.ko-fi.com/cdn/cup-border.png" height="14" alt="Ko-fi"> Buy me a Coffee](https://ko-fi.com/jellyforgedev)

</div>
