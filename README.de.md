<div align="center">
  <img src="./assets/logo-transparent.png" alt="Questorr Logo" width="160"/>

  # Questorr

  **Ein selbst gehosteter Discord-Bot, der Jellyfin und Seerr verbindet — mit smarten Benachrichtigungen, automatischem Channel-Routing und einem vollständigen Web-Dashboard.**

  [![Version](https://img.shields.io/badge/version-2.2.0-brightgreen)](https://github.com/Jellyforge-Dev/Questorr/releases)
  [![Docker](https://img.shields.io/badge/Docker-jellyforge%2Fquestorr-blue?logo=docker)](https://hub.docker.com/r/jellyforge/questorr)
  [![License](https://img.shields.io/badge/License-AGPL--3.0-blue)](LICENSE)
  [![Discord](https://img.shields.io/badge/Discord-Beitreten-5865F2?logo=discord&logoColor=white)](https://discord.gg/rXANrXJqVf)

  [🇬🇧 English Documentation](README.md) &nbsp;|&nbsp; [💬 Discord Community](https://discord.gg/rXANrXJqVf) &nbsp;|&nbsp; [<img src="https://storage.ko-fi.com/cdn/cup-border.png" height="14" alt="Ko-fi"> Kauf mir einen Kaffee](https://ko-fi.com/jellyforgedev) &nbsp;|&nbsp; [🐛 Fehler melden](https://github.com/Jellyforge-Dev/Questorr/issues)

</div>

---

> **📸 Screenshot-Hinweis:** Alle Screenshots in dieser README wurden in einer Demo-Umgebung aufgenommen und enthalten keine echten Nutzerdaten. Die Live-Version kann leicht abweichen und zeigt je nach Konfiguration mehr Inhalte.

---

## ✨ Funktionen

| Funktion | Beschreibung |
|---|---|
| 🔍 `/search` | Filme und Serien suchen, direkt aus dem Embed anfordern |
| 📤 `/request` | Sofortige Medienanfragen mit optionaler Tag-, Server- und Qualitätsauswahl |
| 🔥 `/trending` | Die meistgesehenen Filme und Serien der Woche durchsuchen |
| 🔎 `/status` | Seerr-Anfragestatus eines Titels abfragen — mit Poster, Zusammenfassung, Genre, Laufzeit, Bewertung und Altersfreigabe. Zeigt einen Request-Button wenn noch nicht angefragt |
| 🎲 `/random` | Zufälligen Film oder Serie aus der Jellyfin-Bibliothek anzeigen — mit Poster, Zusammenfassung, Genre, Laufzeit und Bewertung. Nur für den Ausführenden sichtbar |
| 🔔 Smarte Benachrichtigungen | Reichhaltige Discord-Embeds für alle Seerr-Events (ausstehend, genehmigt, verfügbar, abgelehnt, fehlgeschlagen, Probleme) |
| 📺 Channel-Routing | Benachrichtigungen werden automatisch basierend auf dem Radarr/Sonarr Root-Folder in den richtigen Kanal geleitet |
| 🔕 Private Events | Neue Anfragen und abgelehnte Anfragen werden nur als DM an den Anfrager gesendet — nicht in den öffentlichen Kanal |
| ✉️ Private Direktnachrichten | Nutzer erhalten eine DM wenn ihr angeforderter Inhalt genehmigt, abgelehnt oder verfügbar wird |
| 🔘 Button-Toggles | Auswählen welche Buttons (In Seerr ansehen, Jetzt ansehen, Letterboxd, IMDb) in Benachrichtigungs-Embeds erscheinen |
| 👤 Nutzerzuordnung | Discord-Accounts mit Seerr-Konten verknüpfen, damit Anfragen dem richtigen Nutzer zugeordnet werden |
| 🔐 Rollenberechtigungen | Steuern wer Bot-Befehle nutzen darf über Discord Rollen Allowlist / Blocklist |
| 🌟 Tagesempfehlung | Täglich einen Vorschlag aus der bestehenden Jellyfin-Bibliothek posten |
| 🎲 Tägliche Zufallsauswahl | Täglich einen zufälligen Vorschlag von TMDB posten |
| 🎨 Benutzerdefinierte Embed-Farben | Embed-Farben für jeden Event-Typ individuell anpassen |
| ⚙️ Web-Dashboard | Vollständige Konfiguration unter `http://dein-server:8282` — Tetris-Style-Oberfläche |
| 📱 Mobil-freundlich | Responsives Dashboard, funktioniert auf Smartphones und Tablets |
| 🌍 Mehrsprachig | Englische und deutsche Dashboard-Oberfläche |

---

## 📋 Voraussetzungen

- Ein laufender **[Jellyfin](https://jellyfin.org/)**-Server
- Eine laufende **[Seerr](https://github.com/seerr-team/seerr)**-Instanz (verbunden mit [Radarr](https://github.com/Radarr/Radarr)/[Sonarr](https://github.com/Sonarr/Sonarr))
- Ein **Discord**-Konto mit Admin-Zugang zu einem Server
- **Docker** (empfohlen) oder Node.js 20+
- API-Schlüssel: [TMDB](https://www.themoviedb.org/settings/api) (erforderlich) · [OMDb](http://www.omdbapi.com/apikey.aspx) (optional)

---

## 🚀 Schnellstart

### Docker Compose (empfohlen)

**Standard-Setup** — direkter Zugriff über IP und Port:

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

Dann `http://deine-server-ip:8282` öffnen und dem Setup-Assistenten folgen.

**Mit einem Reverse Proxy** ([Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager), [Traefik](https://github.com/traefik/traefik), [Caddy](https://github.com/caddyserver/caddy)) — `ports` entfernen und stattdessen das gemeinsame Netzwerk hinzufügen:

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
      - proxy             # Muss mit dem Netzwerknamen des Reverse Proxys übereinstimmen

networks:
  proxy:                  # Muss mit dem Netzwerknamen des Reverse Proxys übereinstimmen
    external: true
```

Reverse-Proxy-Weiterleitungseinstellungen: Schema: `http` · Host / Forward-Hostname: `questorr` · Port: `8282`

### Docker-Tags

| Tag | Beschreibung |
|---|---|
| `latest` | Neueste stabile Version |
| `dev` | Entwicklungs-Build (kann instabil sein) |
| `2.2.0` | Bestimmte Version |

### Manuell (Entwicklung)

```bash
git clone https://github.com/Jellyforge-Dev/Questorr.git
cd Questorr
npm install
node app.js
```

---

## ⚙️ Einrichtung

### 1. Discord-Bot erstellen

1. Zum [Discord Developer Portal](https://discord.com/developers/applications) → Neue Anwendung
2. **Bot** → `Server Members Intent` aktivieren (erforderlich für Nutzerzuordnung)
3. **OAuth2 → URL Generator** → Scopes: `bot` + `applications.commands`
4. Berechtigungen: `Nachrichten senden`, `Eingebettete Links`, `Nachrichtenverlauf lesen`
5. Die generierte URL kopieren, im Browser öffnen und den Bot zum Server hinzufügen

### 2. Über das Web-Dashboard konfigurieren

`http://deine-server-ip:8282` öffnen, ein Konto erstellen und alle Schritte abschließen:

| Schritt | Was zu konfigurieren ist |
|---|---|
| 1. Discord | Bot-Token, Client-ID, Server, Standard-Benachrichtigungskanal |
| 2. Seerr | Seerr-URL, API-Schlüssel, Webhook-URL, Channel-Routing, Root-Folder-Zuordnung |
| 3. Mediendatenbanken | TMDB API-Schlüssel (erforderlich), OMDb API-Schlüssel (optional) |
| 4. Jellyfin | Server-URL, API-Schlüssel, Server-ID, Benachrichtigungskanal |
| 5. Nutzerzuordnung | Discord-Nutzer mit Seerr-Konten verknüpfen |
| 6. Rollenberechtigungen | Allowlist / Blocklist für Bot-Befehle |
| 7. Verschiedenes | Auto-Start, DMs, tägliche Picks, Embed-Farben, `/request`-Optionen, Discord-Befehle, Benachrichtigungs-Buttons |

### 3. Seerr-Webhook konfigurieren

In **Seerr → Einstellungen → Benachrichtigungen → Webhook** folgendes eintragen:

| Feld | Wert |
|---|---|
| Webhook-URL | Die URL aus Questorr unter **Schritt 2 → Seerr Webhook-URL** |
| Autorisierungsüberschrift | Das Secret aus Questorr unter **Schritt 2 → Secret kopieren** einfügen |

> Das Secret wird über den `Authorization`-Header übertragen — es erscheint nie in der URL oder in Server-Logs.

**Empfohlen: alle Benachrichtigungstypen in Seerr aktivieren**, damit Questorr den gesamten Anfrage-Lebenszyklus an Discord weiterleiten kann:

| Seerr-Event | Was Questorr macht |
|---|---|
| Anfrage ausstehend | Sendet DM nur an den Anfrager |
| Anfrage genehmigt / automatisch genehmigt | Postet in Standard-Kanal · sendet DM an Anfrager |
| Medium verfügbar | Postet in den passenden Root-Folder-Kanal · sendet DM an Anfrager |
| Anfrage abgelehnt | Sendet DM nur an den Anfrager |
| Download fehlgeschlagen | Postet in Admin-Kanal |
| Problem gemeldet / kommentiert | Postet in Standard-Kanal |

### 4. Channel-Routing

Unter **Schritt 2 → Root-Folder → Channel-Zuordnung** auf **Root-Folders laden** klicken, dann jedem Radarr/Sonarr Root-Folder einen Discord-Kanal zuweisen. Questorr leitet `MEDIA_AVAILABLE`-Benachrichtigungen automatisch in den richtigen Kanal — z.B. Anime-Anfragen nach `#anime`, Filme nach `#filme`.

### 5. Benachrichtigungs-Buttons

Unter **Schritt 7 → Benachrichtigungs-Buttons** können einzelne Buttons in Discord-Benachrichtigungs-Embeds aktiviert oder deaktiviert werden:

| Button | Beschreibung |
|---|---|
| In Seerr ansehen | Link zur Medienseite in Seerr |
| ▶ Jetzt ansehen! | Direktlink zum Jellyfin-Player (nur für verfügbare Inhalte) |
| Letterboxd | Link zur Letterboxd-Seite (nur Filme) |
| IMDb | Link zur IMDb-Seite |

Mit dem **Buttons testen**-Button kann eine Vorschau-Benachrichtigung an den Admin-Kanal gesendet werden, die die aktuell aktiven Buttons zeigt.

---

## 🌐 Umgebungsvariablen

| Variable | Beschreibung | Standard |
|---|---|---|
| `WEBHOOK_PORT` | Web-Server-Port | `8282` |
| `LOG_LEVEL` | `error` / `warn` / `info` / `verbose` / `debug` | `info` |
| `TRUST_PROXY` | Auf `false` setzen um Trust-Proxy zu deaktivieren (z.B. ohne Reverse Proxy) | `true` |

Alle anderen Einstellungen werden über das Web-Dashboard verwaltet und in `config/config.json` gespeichert.

---

## 🔒 Sicherheit

Questorr v2.2.0 enthält folgende Sicherheitshärtung:

| Funktion | Details |
|---|---|
| Nicht-Root-Container | Prozess läuft als `app`-Nutzer via `entrypoint.sh` + `su-exec` |
| Content Security Policy | Strikte CSP-Header via `helmet` — Inline-Skripte blockiert, `frame-ancestors: none` |
| Authorization-Header | Webhook-Secret wird über den `Authorization`-Header übertragen, nie in der URL |
| Brute-Force-Schutz | Login-Sperren bleiben auch nach Container-Neustarts erhalten (auf Disk geschrieben) |
| Rate-Limiting | API-, Konfigurations- und Webhook-Endpunkte sind rate-limitiert |
| Konfigurierbarer Trust-Proxy | `TRUST_PROXY=false` deaktiviert Proxy-Trust für direkte Deployments |

---

## 🔮 Geplante Funktionen

Diese Funktionen sind auf der Roadmap und werden möglicherweise in zukünftigen Versionen hinzugefügt:

- **`/status <Titel>`** ✅ *Hinzugefügt in v2.1.1*
- **`/random movie|series`** ✅ *Hinzugefügt in v2.2.0*
- **Benachrichtigungs-Button-Toggles** ✅ *Hinzugefügt in v2.2.0*
- **Webhook-Testprotokoll** — die letzten empfangenen Webhook-Events im Dashboard anzeigen für einfacheres Debugging
- **Konfigurations-Export / Import** — die vollständige Konfiguration als JSON-Backup herunterladen und wiederherstellen
- **Bot-Status-Widget** — Uptime und aktuelle Aktivität im Dashboard anzeigen
- **Mehrsprachige Bot-Antworten** — Discord-Bot antwortet in der bevorzugten Sprache des Nutzers
- **Statistiken** — `/stats`-Befehl mit Bibliotheksgröße, kürzlichen Ergänzungen und Anfragezählern

---

## 📸 Screenshots

> Screenshots sind aus einer Demo-Umgebung ohne echte Daten. Die Live-Version kann leicht abweichen.

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
<summary><b>Schritt 5–6 – Nutzerzuordnung & Rollenberechtigungen</b></summary>

| Nutzerzuordnung | Rollenberechtigungen |
|---|---|
| ![Nutzerzuordnung](assets/Screenshots/DE/Desktop/DE_benutzerzuordnung.png) | ![Rollenberechtigungen](assets/Screenshots/DE/Desktop/DE_rollenberechtigungen.png) |

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

| Mediendatenbanken | Jellyfin | Nutzerzuordnung | Rollenberechtigungen |
|---|---|---|---|
| ![Mediendatenbanken](assets/Screenshots/DE/Mobile/DE_mediendatenbanken.png) | ![Jellyfin](assets/Screenshots/DE/Mobile/DE_jellyfin.png) | ![Nutzerzuordnung](assets/Screenshots/DE/Mobile/DE_benutzerzuordnung.png) | ![Rollenberechtigungen](assets/Screenshots/DE/Mobile/DE_rollenberechtigungen.png) |

| Verschiedenes | Protokolle |
|---|---|
| ![Verschiedenes](assets/Screenshots/DE/Mobile/DE_verschiedenes.png) | ![Protokolle](assets/Screenshots/DE/Mobile/DE_protokolle.jpg) |

</details>

---

## 🐳 Aktualisierung

```bash
docker pull jellyforge/questorr:latest
docker compose up -d
```

---

## 📄 Lizenz

Dieses Projekt ist unter der [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE) lizenziert. Du kannst diese Software unter den Bedingungen der AGPL-3.0 frei verwenden, modifizieren und verteilen. Wenn du eine modifizierte Version als Webdienst betreibst, musst du den Quellcode zugänglich machen.

---

<div align="center">

Geforkt von [openVESSL/Anchorr](https://github.com/openVESSL/Anchorr) &nbsp;|&nbsp; Gepflegt von [Jellyforge-Dev](https://github.com/Jellyforge-Dev) &nbsp;|&nbsp; [💬 Discord](https://discord.gg/rXANrXJqVf) &nbsp;|&nbsp; [<img src="https://storage.ko-fi.com/cdn/cup-border.png" height="14" alt="Ko-fi"> Kauf mir einen Kaffee](https://ko-fi.com/jellyforgedev)

</div>
