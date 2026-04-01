<div align="center">
  <img src="./assets/logo-transparent.png" alt="Questorr Logo" width="160"/>

  # Questorr

  **Ein selbst gehosteter Discord-Bot der Jellyfin und Seerr verbindet — mit intelligenten Benachrichtigungen, automatischem Kanal-Routing und einem vollständigen Web-Dashboard.**

  [![Version](https://img.shields.io/badge/version-2.1.0-brightgreen)](https://github.com/Jellyforge-Dev/Questorr/releases)
  [![Docker](https://img.shields.io/badge/Docker-jellyforge%2Fquestorr-blue?logo=docker)](https://hub.docker.com/r/jellyforge/questorr)
  [![License](https://img.shields.io/badge/License-Unlicense-lightgrey)](LICENSE)
  [![Discord](https://img.shields.io/badge/Discord-Beitreten-5865F2?logo=discord&logoColor=white)](https://discord.gg/X2jn8vhrN6)

  [🇬🇧 English Documentation](README.md) &nbsp;|&nbsp; [💬 Discord Community](https://discord.gg/X2jn8vhrN6) &nbsp;|&nbsp; [☕❤️ Kauf mir einen Kaffee](https://ko-fi.com/jellyforgedev) &nbsp;|&nbsp; [🐛 Fehler melden](https://github.com/Jellyforge-Dev/Questorr/issues)

</div>

---

> **📸 Screenshot-Hinweis:** Alle Screenshots in dieser README stammen aus einer Demo-Umgebung und zeigen keine echten Benutzerdaten. Im Livebetrieb kann die Ansicht leicht abweichen und zeigt je nach Konfiguration mehr Inhalte.

---

## ✨ Funktionen

| Funktion | Beschreibung |
|---|---|
| 🔍 `/search` | Filme und Serien suchen und direkt aus dem Embed anfordern |
| 📤 `/request` | Sofortige Medienanfragen mit optionaler Tag-, Server- und Qualitätsauswahl |
| 🔥 `/trending` | Wöchentlich trending Filme und Serien durchstöbern |
| 🔔 Intelligente Benachrichtigungen | Schöne Discord-Embeds für alle Seerr-Events (ausstehend, genehmigt, verfügbar, abgelehnt, fehlgeschlagen, Probleme) |
| 📺 Kanal-Routing | Benachrichtigungen werden anhand des Radarr/Sonarr Root-Folders automatisch in den richtigen Kanal geroutet |
| ✉️ Direktnachrichten | User erhalten eine DM wenn ihr angeforderter Inhalt auf Jellyfin verfügbar ist |
| 👤 Benutzer-Zuordnung | Discord-Accounts mit Seerr-Accounts verknüpfen damit Anfragen vom richtigen User kommen |
| 🔐 Rollen-Berechtigungen | Steuere wer Bot-Befehle nutzen kann über Discord-Rollen Allowlist / Blocklist |
| 🌟 Tägliche Empfehlung | Täglich eine Empfehlung aus deiner Jellyfin-Bibliothek posten |
| 🎲 Tägliche Zufallsauswahl | Täglich einen zufälligen Vorschlag von TMDB posten |
| 🎨 Individuelle Embed-Farben | Benachrichtigungs-Embed-Farben je Event-Typ anpassen |
| ⚙️ Web-Dashboard | Vollständige Konfiguration unter `http://dein-server:8282` — Tetris-Style UI |
| 📱 Mobil-freundlich | Responsives Dashboard, funktioniert auf Smartphones und Tablets |
| 🌍 Mehrsprachig | Englische und deutsche Benutzeroberfläche |

---

## 📋 Voraussetzungen

- Ein laufender **Jellyfin**-Server
- Eine laufende **Seerr**-Instanz (Jellyseerr oder Overseerr, verbunden mit Radarr/Sonarr)
- Ein **Discord**-Account mit Admin-Zugriff auf einen Server
- **Docker** (empfohlen) oder Node.js 20+
- API-Schlüssel: [TMDB](https://www.themoviedb.org/settings/api) (erforderlich) · [OMDb](http://www.omdbapi.com/apikey.aspx) (optional)

---

## 🚀 Schnellstart

### Docker Compose (empfohlen)

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

Danach `http://deine-server-ip:8282` öffnen und dem Einrichtungsassistenten folgen.

### Docker-Tags

| Tag | Beschreibung |
|---|---|
| `latest` | Neueste stabile Version |
| `dev` | Entwicklungs-Build (kann instabil sein) |
| `2.1.0` | Bestimmte Version |

### Manuell (Entwicklung)

```bash
git clone https://github.com/Jellyforge-Dev/Questorr.git
cd Questorr
npm install
node app.js
```

---

## ⚙️ Einrichtung

### 1. Discord Bot erstellen

1. Ins [Discord Developer Portal](https://discord.com/developers/applications) → Neue Anwendung erstellen
2. **Bot** → `Server Members Intent` aktivieren (erforderlich für Benutzer-Zuordnung)
3. **OAuth2 → URL Generator** → Bereiche: `bot` + `applications.commands`
4. Berechtigungen: `Send Messages`, `Embed Links`, `Read Message History`
5. Generierten Link kopieren, im Browser öffnen und Bot zum Server hinzufügen

### 2. Konfiguration über das Web-Dashboard

`http://deine-server-ip:8282` öffnen, Konto erstellen und alle Schritte durchgehen:

| Schritt | Was konfigurieren |
|---|---|
| 1. Discord | Bot-Token, Client-ID, Server, Standard-Benachrichtigungskanal |
| 2. Seerr | Seerr-URL, API-Schlüssel, Webhook-URL, Kanal-Routing, Root-Folder-Zuordnung |
| 3. Mediendatenbanken | TMDB API-Schlüssel (erforderlich), OMDb API-Schlüssel (optional) |
| 4. Jellyfin | Server-URL, API-Schlüssel, Server-ID, Benachrichtigungskanal |
| 5. Benutzer-Zuordnung | Discord-User mit Seerr-Konten verknüpfen |
| 6. Rollen-Berechtigungen | Allowlist / Blocklist für Bot-Befehle |
| 7. Verschiedenes | Auto-Start, DMs, tägliche Auswahl, Embed-Farben, /request-Optionen |

### 3. Seerr Webhook konfigurieren

In **Seerr → Einstellungen → Benachrichtigungen → Webhook** die URL aus Questorr unter **Schritt 2 → Seerr Webhook-URL** eintragen.

> Der **URL kopieren** Button fügt das Webhook-Secret automatisch ein. Einfach in Seerr einfügen.

### 4. Kanal-Routing

Unter **Schritt 2 → Root Folder → Kanal Zuordnung** auf **Root Folders laden** klicken, dann jedem Radarr/Sonarr Root-Folder einen Discord-Kanal zuweisen. Questorr routet `MEDIA_AVAILABLE`-Benachrichtigungen automatisch in den richtigen Kanal.

---

## 🌐 Umgebungsvariablen

| Variable | Beschreibung | Standard |
|---|---|---|
| `WEBHOOK_PORT` | Web-Server-Port | `8282` |
| `LOG_LEVEL` | `error` / `warn` / `info` / `verbose` / `debug` | `info` |

Alle anderen Einstellungen werden über das Web-Dashboard verwaltet und in `config/config.json` gespeichert.

---

## 📸 Screenshots

> Screenshots stammen aus einer Demo-Umgebung ohne echte Daten. Im Livebetrieb kann die Ansicht leicht abweichen.

### Desktop

<details>
<summary><b>Authentifizierung</b></summary>

| Registrieren | Anmelden |
|---|---|
| ![Registrieren](assets/Screenshots/DE/Desktop/DE_registrieren.png) | ![Anmelden](assets/Screenshots/DE/Desktop/DE_anmelden.png) |

</details>

<details>
<summary><b>Schritt 1 – Discord-Einstellungen</b></summary>

| Teil 1 | Teil 2 |
|---|---|
| ![Discord 1/2](assets/Screenshots/DE/Desktop/DE_discord_1-2.png) | ![Discord 2/2](assets/Screenshots/DE/Desktop/DE_discord_2-2.png) |

</details>

<details>
<summary><b>Schritt 2 – Seerr-Konfiguration</b></summary>

| Teil 1 | Teil 2 |
|---|---|
| ![Seerr 1/2](assets/Screenshots/DE/Desktop/DE_seerr_1-2.png) | ![Seerr 2/2](assets/Screenshots/DE/Desktop/DE_seerr_2-2.png) |

</details>

<details>
<summary><b>Schritt 3–4 – Mediendatenbanken & Jellyfin</b></summary>

| Mediendatenbanken | Jellyfin |
|---|---|
| ![Mediendatenbanken](assets/Screenshots/DE/Desktop/DE_mediendatenbanken.png) | ![Jellyfin](assets/Screenshots/DE/Desktop/DE_jellyfin.png) |

</details>

<details>
<summary><b>Schritt 5–6 – Benutzer-Zuordnung & Rollen-Berechtigungen</b></summary>

| Benutzer-Zuordnung | Rollen-Berechtigungen |
|---|---|
| ![Benutzer-Zuordnung](assets/Screenshots/DE/Desktop/DE_benutzerzuordnung.png) | ![Rollen-Berechtigungen](assets/Screenshots/DE/Desktop/DE_rollenberechtigungen.png) |

</details>

<details>
<summary><b>Schritt 7 – Verschiedenes & Protokolle</b></summary>

| Verschiedenes 1/2 | Verschiedenes 2/2 | Protokolle |
|---|---|---|
| ![Verschiedenes 1/2](assets/Screenshots/DE/Desktop/DE_verschiedenes_1-2.png) | ![Verschiedenes 2/2](assets/Screenshots/DE/Desktop/DE_verschiedenes_2-2.png) | ![Protokolle](assets/Screenshots/DE/Desktop/DE_protokolle.png) |

</details>

---

### Mobil

<details>
<summary><b>Mobile Ansichten</b></summary>

| Registrieren | Anmelden | Discord | Seerr |
|---|---|---|---|
| ![Registrieren](assets/Screenshots/DE/Mobile/DE_registrieren.jpg) | ![Anmelden](assets/Screenshots/DE/Mobile/DE_anmelden.png) | ![Discord](assets/Screenshots/DE/Mobile/DE_discord.png) | ![Seerr](assets/Screenshots/DE/Mobile/DE_seerr.png) |

| Mediendatenbanken | Jellyfin | Benutzer-Zuordnung | Rollen-Berechtigungen |
|---|---|---|---|
| ![Mediendatenbanken](assets/Screenshots/DE/Mobile/DE_mediendatenbanken.png) | ![Jellyfin](assets/Screenshots/DE/Mobile/DE_jellyfin.png) | ![Benutzer-Zuordnung](assets/Screenshots/DE/Mobile/DE_benutzerzuordnung.png) | ![Rollen](assets/Screenshots/DE/Mobile/DE_rollenberechtigungen.png) |

| Verschiedenes | Protokolle |
|---|---|
| ![Verschiedenes](assets/Screenshots/DE/Mobile/DE_verschiedenes.png) | ![Protokolle](assets/Screenshots/DE/Mobile/DE_protokolle.jpg) |

</details>

---

## 🐳 Aktualisieren

```bash
docker pull jellyforge/questorr:latest
docker compose up -d
```

---

## 📄 Lizenz

Veröffentlicht unter der [Unlicense](LICENSE) — Public Domain. Mach damit was du willst.

---

<div align="center">

Geforkt von [openVESSL/Anchorr](https://github.com/openVESSL/Anchorr) &nbsp;|&nbsp; Gepflegt von [Jellyforge-Dev](https://github.com/Jellyforge-Dev) &nbsp;|&nbsp; [💬 Discord](https://discord.gg/X2jn8vhrN6) &nbsp;|&nbsp; [☕❤️ Kauf mir einen Kaffee](https://ko-fi.com/jellyforgedev)

</div>
