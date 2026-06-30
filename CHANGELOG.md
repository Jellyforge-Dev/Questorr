[🇬🇧 English](#english) | [🇩🇪 Deutsch](#deutsch)

---

## English

### 🎨 v2.4.2

#### 🆕 Dashboard redesign + dark/light theme
- **Dark/light toggle** in the navbar, persisted per browser and applied
  before paint (no flash). Dark keeps the retro neon/pixel identity; light is
  a new **Paper-Terminal** palette (parchment background, dark ink, deepened
  teal accent, pixel fonts kept).
- **Toggle switches** for boolean settings (multi-select lists stay native
  checkboxes), a **loading spinner** on the Save button, and a **pulse** on
  connected service status dots.
- **Motion layer** (GSAP, vendored locally so it works offline): login and
  dashboard entrance, About scroll reveals, and randomized falling Tetris
  pieces in the background. `prefers-reduced-motion` is honored.
- **Stats count-up** animation on the statistics summary numbers.

---

### 🛠️ v2.4.1

#### 🆕 New

- **Central image on/off switch** — `EMBED_SHOW_IMAGES` toggles backdrops **and** posters on *all* Discord messages at once, plus a hardened Jellyfin backdrop fallback so daily picks keep their artwork.
- **Filterable, paginated log viewer** in the dashboard — filter by level, source tag and free text, with a running "showing X of Y" count and a *Load more* button instead of the old fixed last-1000 dump.
- **Clearer "Added to the Library" header** for new-in-Jellyfin notifications — localized per bot language and overridable via `NOTIF_TITLE_JELLYFIN_NEW`.
- **Notifications now wait** until poster/backdrop *and* description are ready (up to ~30 min, then a basic post), so new items no longer arrive bare.

#### 🐛 Fixes

- **DMs were completely broken** — Questorr tried to send to the unrendered `{{requestedBy_settings_discordId}}` placeholder. Now rejected, with the `USER_MAPPINGS` fallback restored, so request/approve/decline/available DMs arrive again.
- **Custom notification title** is now applied to the DM author line too, not only the channel embed.
- **Duplicate channel posts** for Seerr-tracked titles eliminated — the Jellyfin poller no longer double-announces what the Seerr webhook also reports. Externally added titles (not in Seerr) are still announced via a persistent metadata-wait queue that survives restarts.
- **Channel notification titles resolve live** instead of being frozen at startup — they now follow the configured bot language (e.g. German "Verfügbar" instead of English "Now Available!").

---

### 🎉 What's New in v2.4.0

#### 🆕 Weekly Library Digest
An opt-in weekly post listing what was added to your Jellyfin library in the last 7 days — new **movies**, new **series**, and **new episodes** of existing series (aggregated per series, e.g. "Breaking Bad — 8 new episodes"). Channel, day and time are configurable; nothing is posted on a quiet week. Includes a **"Send test digest now"** button with diagnostic output (how many items were found and why).

#### 🔔 `/subscribe`
Subscribe to a series and get a DM when a new season appears on Jellyfin. `/subscribe remove` unsubscribes (with autocomplete of your own subscriptions), `/subscribe list` shows your subscriptions, and `/subscribe weekly` opts into a **personalised weekly recommendation DM** based on your watch history. Also available as a button in the `/help` wizard.

#### 🚦 Per-User Request Quota
An optional rolling 7-day limit on how many requests each user can make through Questorr. Bypass roles and individual unlimited users are configurable; `0` disables it.

#### 🎛️ Dashboard Improvements
- **Role filter + Discord avatars** for member pickers (quota unlimited-users, user mapping) — pick a role to narrow a long member list
- **Channel / member dropdowns** instead of raw ID fields
- UI **language now persists per browser** — no more reverting to the default on reload/login
- **Cache-busted assets** so dashboard updates are never served stale, even behind a reverse proxy
- **Cron timing changes apply live on save** — no bot restart needed for digest/weekly/cleanup schedules

### 🎉 What's New in v2.3.0

#### New Commands

**💡 `/recommend <title>`**
Get TMDB-powered recommendations based on a movie or TV show. Select a title via autocomplete, and Questorr returns up to 5 similar titles with poster, rating, overview and availability status. Watch Now buttons link directly to Jellyfin for available items.

**🧭 `/discover <type> [genre] [year] [rating]`**
Discover media by genre, year and minimum rating. Results are randomized so every call surfaces different titles. Includes availability status and Jellyfin Watch Now links.

**📦 `/collection <title>`**
View all movies in a franchise or collection (e.g. "Harry Potter", "Marvel Avengers"). Shows each entry with release year, rating and Jellyfin availability — making it easy to spot which parts of a franchise are missing.

**🎭 `/cast <name>`**
Browse an actor's full filmography with pagination (10 items per page). Each entry shows the character name, year, rating and whether it's available in Jellyfin. Navigate through the full list with Previous/Next buttons.

**🔗 `/similar <title>`**
Find similar titles based on genre and keywords — uses a different TMDB algorithm than `/recommend` for broader discovery. Shows up to 5 results with rating, overview and availability status.

#### New Features

**✅ Availability status**
All embed lists (`/search`, `/discover`, `/recommend`, `/upcoming`, `/similar`) now show Seerr status icons next to each title: ✅ available, ⏳ requested, 📥 partially available. At a glance you can see what's already in your library.

**🎬 Content ratings**
Search embeds now display FSK/MPAA age ratings (e.g. "FSK 12", "PG-13"). The rating country is configurable via `CONTENT_RATING_COUNTRY` in the dashboard.

**📡 Streaming providers**
Shows where a title is currently available for streaming (Netflix, Disney+, Amazon Prime, etc.) via the TMDB Watch Providers API. The provider country is configurable via `PROVIDER_COUNTRY`.

**▶️ Trailer buttons**
YouTube trailer links are automatically added as buttons to `/search` and `/request` embeds when a trailer is available on TMDB.

**💚 Health-check bar**
The dashboard now shows a real-time service status bar displaying the connection state of Seerr, Jellyfin and Discord at a glance.

**📊 Statistics dashboard**
Command usage statistics with per-user breakdown and top commands. Accessible from the dashboard to see how your community uses the bot.

**🧩 Embeddable widget**
An HTML widget for Homarr, Homepage or Organizr showing bot status, uptime, command stats and start/stop controls. Configurable via the dashboard with an optional anonymization toggle (`WIDGET_ANONYMIZE_STATS`).

**🌟 Daily recommendation & random pick**
Two scheduled posting modes: a daily recommendation from your existing Jellyfin library, and a daily random pick from TMDB. Both post to a configurable Discord channel at a configurable interval.

**👤 Requester info in admin notifications**
`MEDIA_PENDING` embeds in the admin channel now show who requested the media — username and avatar are displayed in the embed footer.

**⚠️ Unsaved changes warning**
The browser now warns before navigating away from the dashboard when there are unsaved configuration changes.

#### Fixes

- `/recommend` autocomplete parsing fixed — TMDB 404 errors caused by wrong offset in the `id|mediaType` format
- Watch Now button now appears for partially available TV series (Seerr status 4 in addition to 5)
- `/cast` rewritten with full pagination (PAGE_SIZE=10) instead of showing only the first 15 items
- 8 silent `catch(_){}` blocks replaced with proper `logger.debug` error logging across all bot commands

#### Privacy

- `/watchlist` now hides other users' real names — displayed as "A User"
- Widget stats anonymization toggle (`WIDGET_ANONYMIZE_STATS`) replaces usernames with "User 1", "User 2" etc.
- Removed TMDB from system status display (not self-hosted, always reachable)

#### Security

| Fix | Details |
|-----|---------|
| Directory permissions | Config directories created with `0o755` instead of `0o777` |
| Audit logging | Webhook secret and widget API key access endpoints are now logged |
| Dependency updates | All npm dependencies updated to resolve CVEs (axios, express, undici, jws, etc.) — 0 vulnerabilities |
| JSDoc documentation | Security documentation added for user mapping endpoint |

---

## Deutsch

### 🎨 v2.4.2

#### 🆕 Dashboard-Redesign + Dark/Light-Theme
- **Dark/Light-Umschalter** in der Navbar, pro Browser gemerkt und vor dem
  Paint angewendet (kein Flackern). Dark behält die Retro-Neon/Pixel-Identität;
  Light ist ein neues **Paper-Terminal** (Pergament-BG, dunkle Tinte,
  abgedunkelter Teal-Akzent, Pixel-Fonts bleiben).
- **Toggle-Switches** für Boolean-Einstellungen (Mehrfach-Auswahl-Listen
  bleiben native Checkboxen), **Lade-Spinner** am Speichern-Button und ein
  **Puls** auf verbundenen Service-Status-Punkten.
- **Animations-Layer** (GSAP, lokal gebündelt → offline lauffähig): Login-
  und Dashboard-Entrance, About-Scroll-Reveals und zufällig fallende
  Tetris-Blöcke im Hintergrund. `prefers-reduced-motion` wird respektiert.
- **Count-Up** auf den Statistik-Zahlen.

---

### 🛠️ v2.4.1

#### 🆕 Neu

- **Zentraler Bild-Schalter** — `EMBED_SHOW_IMAGES` aktiviert/deaktiviert Backdrops **und** Poster auf *allen* Discord-Nachrichten auf einen Schlag, plus gehärteter Jellyfin-Backdrop-Fallback, damit Tagesempfehlungen ihr Artwork behalten.
- **Filterbarer, paginierter Log-Viewer** im Dashboard — Filter nach Level, Quelle-Tag und Freitext, mit laufender „Zeige X von Y"-Anzeige und *Mehr laden*-Button statt des alten festen Last-1000-Dumps.
- **Klarerer „Neu in der Mediathek"-Header** für Neu-in-Jellyfin-Benachrichtigungen — pro Bot-Sprache lokalisiert und über `NOTIF_TITLE_JELLYFIN_NEW` überschreibbar.
- **Benachrichtigungen warten** jetzt, bis Poster/Backdrop *und* Beschreibung bereit sind (bis ~30 Min, dann ein Basis-Post), damit neue Titel nicht mehr nackt ankommen.

#### 🐛 Fixes

- **DMs waren komplett kaputt** — Questorr versuchte an den nicht gerenderten Platzhalter `{{requestedBy_settings_discordId}}` zu senden. Wird nun abgewiesen, der `USER_MAPPINGS`-Fallback wurde wiederhergestellt, sodass DMs für Anfrage/Genehmigung/Ablehnung/Verfügbarkeit wieder ankommen.
- **Eigener Benachrichtigungs-Titel** wird jetzt auch in der DM-Author-Zeile angewendet, nicht nur im Channel-Embed.
- **Doppelte Channel-Posts** für Seerr-getrackte Titel beseitigt — der Jellyfin-Poller kündigt nicht mehr doppelt an, was auch der Seerr-Webhook meldet. Extern hinzugefügte Titel (nicht in Seerr) werden weiterhin angekündigt, über eine persistente Metadaten-Warteschlange, die Neustarts übersteht.
- **Channel-Titel werden live aufgelöst** statt beim Start eingefroren — sie folgen jetzt der konfigurierten Bot-Sprache (z.B. deutsch „Verfügbar" statt englisch „Now Available!").

---

### 🎉 Neues in v2.4.0

#### 🆕 Wöchentlicher Library-Digest
Ein optionaler Wochenpost mit allem, was in den letzten 7 Tagen zur Jellyfin-Library hinzugefügt wurde — neue **Filme**, neue **Serien** und **neue Folgen** bestehender Serien (pro Serie aggregiert, z.B. „Breaking Bad — 8 neue Folgen"). Channel, Tag und Uhrzeit sind konfigurierbar; in einer ruhigen Woche wird nichts gepostet. Inklusive **„Test-Digest jetzt senden"**-Button mit Diagnose-Ausgabe (wie viele Items gefunden wurden und warum).

#### 🔔 `/subscribe`
Eine Serie abonnieren und eine DM erhalten, sobald auf Jellyfin eine neue Staffel erscheint. `/subscribe remove` beendet das Abo (mit Autocomplete der eigenen Abos), `/subscribe list` zeigt deine Abos, und `/subscribe weekly` aktiviert eine **personalisierte Wochenempfehlung per DM** basierend auf deinem Sehverlauf. Auch als Button im `/help`-Wizard verfügbar.

#### 🚦 Anfragelimit pro Benutzer
Ein optionales rollierendes 7-Tage-Limit, wie viele Anfragen jeder Benutzer über Questorr stellen kann. Bypass-Rollen und einzelne unbegrenzte Benutzer sind konfigurierbar; `0` deaktiviert es.

#### 🎛️ Dashboard-Verbesserungen
- **Rollen-Filter + Discord-Avatare** für Benutzer-Auswahl (Quota-Unbegrenzt, Benutzer-Zuordnung) — Rolle wählen, um eine lange Liste einzugrenzen
- **Channel-/Benutzer-Dropdowns** statt roher ID-Felder
- UI-**Sprache bleibt jetzt pro Browser erhalten** — kein Zurückspringen auf den Standard beim Neuladen/Login
- **Cache-Busting** für Dashboard-Assets — keine veralteten Auslieferungen mehr, auch hinter einem Reverse Proxy
- **Cron-Zeitänderungen greifen sofort beim Speichern** — kein Bot-Neustart für Digest-/Weekly-/Cleanup-Zeitpläne nötig

### 🎉 Neues in v2.3.0

#### Neue Befehle

**💡 `/recommend <Titel>`**
TMDB-basierte Empfehlungen auf Basis eines Films oder einer Serie. Titel über Autocomplete auswählen, und Questorr liefert bis zu 5 ähnliche Titel mit Poster, Bewertung, Beschreibung und Verfügbarkeitsstatus. Jetzt-Ansehen-Buttons verlinken direkt zu Jellyfin für verfügbare Inhalte.

**🧭 `/discover <Typ> [Genre] [Jahr] [Bewertung]`**
Medien nach Genre, Jahr und Mindestbewertung entdecken. Ergebnisse werden zufällig sortiert, sodass jeder Aufruf andere Titel zeigt. Inklusive Verfügbarkeitsstatus und Jellyfin-Jetzt-Ansehen-Links.

**📦 `/collection <Titel>`**
Alle Filme einer Filmreihe oder Kollektion anzeigen (z.B. „Harry Potter", „Marvel Avengers"). Zeigt jeden Eintrag mit Erscheinungsjahr, Bewertung und Jellyfin-Verfügbarkeit — so lässt sich leicht erkennen, welche Teile einer Reihe fehlen.

**🎭 `/cast <Name>`**
Vollständige Filmografie eines Schauspielers mit Pagination durchsuchen (10 Einträge pro Seite). Jeder Eintrag zeigt den Rollennamen, Jahr, Bewertung und ob der Titel in Jellyfin verfügbar ist. Mit Zurück/Weiter-Buttons durch die gesamte Liste navigieren.

**🔗 `/similar <Titel>`**
Ähnliche Titel basierend auf Genre und Keywords finden — nutzt einen anderen TMDB-Algorithmus als `/recommend` für breitere Entdeckung. Zeigt bis zu 5 Ergebnisse mit Bewertung, Beschreibung und Verfügbarkeitsstatus.

#### Neue Funktionen

**✅ Verfügbarkeitsstatus**
Alle Embed-Listen (`/search`, `/discover`, `/recommend`, `/upcoming`, `/similar`) zeigen jetzt Seerr-Status-Icons neben jedem Titel: ✅ verfügbar, ⏳ angefragt, 📥 teilweise verfügbar. Auf einen Blick sehen, was bereits in der Bibliothek ist.

**🎬 Altersfreigabe**
Such-Embeds zeigen jetzt FSK/MPAA-Altersfreigaben an (z.B. „FSK 12", „PG-13"). Das Land für die Bewertung ist über `CONTENT_RATING_COUNTRY` im Dashboard konfigurierbar.

**📡 Streaming-Anbieter**
Zeigt wo ein Titel aktuell zum Streaming verfügbar ist (Netflix, Disney+, Amazon Prime, etc.) über die TMDB Watch Providers API. Das Anbieterland ist über `PROVIDER_COUNTRY` konfigurierbar.

**▶️ Trailer-Buttons**
YouTube-Trailer-Links werden automatisch als Buttons zu `/search` und `/request` Embeds hinzugefügt, wenn ein Trailer auf TMDB verfügbar ist.

**💚 Health-Check-Leiste**
Das Dashboard zeigt jetzt eine Echtzeit-Statusleiste mit dem Verbindungsstatus von Seerr, Jellyfin und Discord auf einen Blick.

**📊 Statistik-Dashboard**
Befehlsnutzungsstatistiken mit Aufschlüsselung pro Nutzer und Top-Befehlen. Über das Dashboard einsehbar, um zu sehen wie die Community den Bot nutzt.

**🧩 Einbettbares Widget**
Ein HTML-Widget für Homarr, Homepage oder Organizr mit Bot-Status, Uptime, Befehlsstatistiken und Start/Stop-Steuerung. Konfigurierbar über das Dashboard mit optionalem Anonymisierungs-Toggle (`WIDGET_ANONYMIZE_STATS`).

**🌟 Tägliche Empfehlung & Zufallsauswahl**
Zwei geplante Posting-Modi: eine tägliche Empfehlung aus der bestehenden Jellyfin-Bibliothek und eine tägliche Zufallsauswahl von TMDB. Beide posten in einen konfigurierbaren Discord-Kanal in konfigurierbarem Intervall.

**👤 Anfragersteller in Admin-Benachrichtigungen**
`MEDIA_PENDING`-Embeds im Admin-Kanal zeigen jetzt wer das Medium angefragt hat — Benutzername und Avatar werden im Embed-Footer angezeigt.

**⚠️ Warnung bei ungespeicherten Änderungen**
Der Browser warnt jetzt vor dem Verlassen des Dashboards, wenn es ungespeicherte Konfigurationsänderungen gibt.

#### Fehlerbehebungen

- `/recommend` Autocomplete-Parsing behoben — TMDB-404-Fehler durch falschen Offset im `id|mediaType`-Format
- Jetzt-Ansehen-Button erscheint jetzt auch bei teilweise verfügbaren Serien (Seerr-Status 4 zusätzlich zu 5)
- `/cast` mit vollständiger Pagination umgeschrieben (PAGE_SIZE=10) statt nur die ersten 15 Einträge anzuzeigen
- 8 stille `catch(_){}`-Blöcke durch ordentliches `logger.debug`-Error-Logging in allen Bot-Befehlen ersetzt

#### Datenschutz

- `/watchlist` verbirgt jetzt die echten Namen anderer Nutzer — angezeigt als „A User"
- Widget-Statistik-Anonymisierung (`WIDGET_ANONYMIZE_STATS`) ersetzt Benutzernamen durch „User 1", „User 2" etc.
- TMDB aus der System-Statusanzeige entfernt (nicht selbst gehostet, immer erreichbar)

#### Sicherheit

| Fix | Details |
|-----|---------|
| Verzeichnisberechtigungen | Konfigurationsverzeichnisse werden mit `0o755` statt `0o777` erstellt |
| Audit-Logging | Webhook-Secret- und Widget-API-Key-Zugriffs-Endpunkte werden jetzt protokolliert |
| Abhängigkeits-Updates | Alle npm-Abhängigkeiten aktualisiert um CVEs zu beheben (axios, express, undici, jws, etc.) — 0 Schwachstellen |
| JSDoc-Dokumentation | Sicherheitsdokumentation für den User-Mapping-Endpunkt hinzugefügt |

---

[💬 Discord](https://discord.gg/rXANrXJqVf) | [🐛 Report a Bug / Fehler melden](https://github.com/Jellyforge-Dev/Questorr/issues) | [<img src="https://storage.ko-fi.com/cdn/cup-border.png" height="14" alt="Ko-fi"> Ko-fi](https://ko-fi.com/jellyforgedev)

---

## [2.2.0] - 2026-04-07

See [v2.2.0 Release Notes](https://github.com/Jellyforge-Dev/Questorr/releases/tag/v2.2.0)

## [2.1.1] - 2026-04-03

See [v2.1.1 Release Notes](https://github.com/Jellyforge-Dev/Questorr/releases/tag/v2.1.1)
