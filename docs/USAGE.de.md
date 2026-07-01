# 📖 Questorr — Vollständige Bedienungs- & Konfigurationsanleitung

Die komplette, anfängerfreundliche Referenz für **jeden** Questorr-Befehl, jedes
Feature und jede Konfigurationsoption. Wenn dich eine einzeilige Beschreibung im
README ratlos zurückgelassen hat — hier steht die ganze Antwort.

> 🇬🇧 This guide is also available [in English](USAGE.md).

**So liest du diese Anleitung**

- **Teil 1 – Slash-Befehle:** was jeder `/befehl` tut, seine Optionen, und was du zurückbekommst.
- **Teil 2 – Features:** die Dinge, die im Hintergrund oder im Dashboard laufen (Benachrichtigungen, Digest, Quota, …).
- **Teil 3 – Konfigurationsreferenz:** jede Einstellung in `config/config.json`, nach Thema gruppiert, mit Standardwert und einfacher Erklärung.

---

## Teil 1 · Slash-Befehle

Ein „Slash-Befehl" ist ein Befehl, den du in Discord mit `/` beginnst. Nach dem `/`
zeigt Discord eine Liste — wähle **Questorrs** Befehl, fülle die Felder aus, drücke
Enter. Viele Felder bieten **Autovervollständigung**: tippe an, und Questorr
schlägt passende Titel/Schauspieler/Genres vor — wähle einen Vorschlag, statt den
exakten Namen zu tippen.

Drei Befehle erscheinen nur, wenn ihr Feature im Dashboard aktiviert ist:
`/status`, `/random` (Schalter unter **Schritt 7 → Discord-Befehle**) und
`/foryou` (braucht einen konfigurierten Jellyfin-Server). Alle anderen sind immer
verfügbar.

### 🔍 `/search <titel>`
Suche einen Film oder eine Serie per Name. Liefert ein reichhaltiges Embed (Poster,
Inhalt, Genre, Laufzeit, Bewertung). Ist der Titel noch nicht in deiner Bibliothek,
erscheint ein **Anfragen**-Button — wähle bei Serien eine Staffel und (falls
aktiviert) Tag, Server und Qualitätsprofil.
- **`title`** *(Pflicht, Autovervollständigung)* — der zu suchende Titel.
- **Beispiel:** `/search Dune` → Embed für *Dune (2021)* mit Anfragen-Button.

### 📤 `/request <titel> [tag] [server] [qualität]`
Überspringe die Suche und frage einen Titel sofort an. Die optionalen Felder
erscheinen nur, wenn du sie in **Schritt 7** aktiviert hast (sonst gelten die
Standardwerte).
- **`title`** *(Pflicht, Autovervollständigung)* — was angefragt wird.
- **`tag`** *(optional, Autovervollständigung)* — ein Radarr/Sonarr-Tag, z. B. `anime`.
- **`server`** *(optional, Autovervollständigung)* — welcher Radarr/Sonarr-Server zuständig ist.
- **`quality`** *(optional, Autovervollständigung)* — welches Qualitätsprofil genutzt wird.
- **Beispiel:** `/request The Bear server:Sonarr-4K quality:1080p`.

### 🔥 `/trending <titel>`
Stöbere durch die Wochen-Trends. Tippe im `title`-Feld an und wähle aus den
Trend-Vorschlägen, dann direkt aus dem Embed anfragen.
- **`title`** *(Pflicht, Autovervollständigung)* — aus der Trend-Liste wählen.

### 🔎 `/status <titel>`  *(nur wenn aktiviert)*
Prüfe, ob ein Titel in Seerr bereits angefragt/verfügbar ist — mit Poster, Inhalt,
Genre, Laufzeit, Bewertung und Altersfreigabe. Zeigt einen **Anfragen**-Button,
falls noch nicht angefragt.
- **`title`** *(Pflicht, Autovervollständigung)* — der zu prüfende Titel.

### 🎲 `/random <typ>`  *(nur wenn aktiviert)*
Hol dir einen Zufallstitel **aus deiner eigenen Jellyfin-Bibliothek** — ein „Was
gucke ich heute Abend"-Vorschlag. Die Antwort ist **nur für dich sichtbar**
(ephemeral).
- **`type`** *(Pflicht)* — `🎬 Film` oder `📺 Serie`.

### 🐛 `/report movie` · `/report series`  *(nur wenn aktiviert)*
Melde ein Wiedergabe-Problem zu einem Titel, der **auf deinem Jellyfin-Server**
liegt. Titel-Vorschläge kommen **nur aus der Jellyfin-Bibliothek** (du kannst nichts
melden, was nicht da ist), und das Issue wird in Seerr unter **deinem** gemappten
User geöffnet. Du erhältst eine **Zusammenfassungs-DM** deiner Meldung und eine
weitere DM, sobald ein Admin kommentiert oder das Problem löst.
- **`/report movie`** — `title` *(Pflicht, Autocomplete)*, `type`
  *(Pflicht: Video / Ton / Untertitel)*, `message` *(Pflicht)*.
- **`/report series`** — `title`, `season`, `episode`, `type` und `message`
  sind **alle Pflicht**.

Admins bearbeiten Issues direkt im **Admin-Channel**: der Post hat **💬 Kommentieren**-
und **✅ Lösen**-Buttons (keine Seerr-WebUI nötig). Die gesamte Kommunikation bleibt
privat zwischen Melder und Admins/Seerr. Schalter in **Schritt 7 → Verschiedenes**
(`SHOW_REPORT_COMMAND`).

> **Seerr-Voraussetzungen.** Issues sind ein Seerr-Feature, daher:
> - **Issues aktivieren** in **Seerr → Einstellungen → Allgemein** (der globale
>   Schalter *Problem-Meldungen aktivieren*).
> - Der Melder muss (Schritt 5) einem Seerr-User **zugeordnet** sein, und dieser
>   User braucht in Seerr die Berechtigung **Probleme melden** — sonst kann das
>   Issue nicht in seinem Namen erstellt werden.
> - Die **Issue**-Webhook-Events aktivieren (siehe oben), damit Kommentar-/Lösungs-
>   DMs beim Melder ankommen.

### 💡 `/recommend <titel>`
TMDB-Empfehlungen basierend auf einem Film/einer Serie, die du magst.
- **`title`** *(Pflicht, Autovervollständigung)* — Grundlage der Empfehlungen.
- **Beispiel:** `/recommend Interstellar` → ähnliche Sci-Fi-Titel, jeweils mit Verfügbarkeitsstatus.

### 🧭 `/discover <typ> [genre] [jahr] [bewertung]`
Stöbere nach Filtern statt nach einem bekannten Titel.
- **`type`** *(Pflicht)* — `🎬 Filme` oder `📺 Serien`.
- **`genre`** *(optional, Autovervollständigung)* — z. B. *Action*, *Komödie*.
- **`year`** *(optional, 1900–2030)* — Erscheinungsjahr.
- **`rating`** *(optional, 1–10)* — Mindest-TMDB-Bewertung.
- **Beispiel:** `/discover type:Filme genre:Horror year:2023 rating:7` → gut bewerteter Horror von 2023.

### 📦 `/collection <titel>`
Zeigt jeden Film eines Franchises/einer Sammlung (z. B. alle *John Wick*-Filme) mit
Verfügbarkeit je Titel.
- **`title`** *(Pflicht, Autovervollständigung)* — irgendein Film der Sammlung; Questorr findet den Rest.

### 🎭 `/cast <name>`
Stöbere durch die komplette Filmografie eines Schauspielers, seitenweise, mit
Bibliotheks-Verfügbarkeit je Titel.
- **`name`** *(Pflicht, Autovervollständigung)* — Name des Schauspielers / der Schauspielerin.

### 🔗 `/similar <titel>`
Finde Titel, die einem gegebenen ähneln, abgeglichen über Genre und Schlagworte.
- **`title`** *(Pflicht, Autovervollständigung)* — der Referenztitel.

### 📥 `/queue`
Zeigt den Status **deiner eigenen** Anfragen, gruppiert nach Phase: wartend,
ladend, verfügbar, abgelehnt, fehlgeschlagen. Keine Optionen — zeigt immer die
Anfragen des Aufrufers.

### 🔔 `/subscribe …`
Persönliche Abonnements verwalten. Vier Unterbefehle:
- **`/subscribe series <titel>`** — bekomme eine **DM, wenn eine neue Staffel** der
  Serie auf Jellyfin erscheint. `title` mit Autovervollständigung.
- **`/subscribe remove <titel>`** — Serie deabonnieren. `title` vervollständigt nur
  **deine eigenen** Abos.
- **`/subscribe weekly`** — schaltet eine **persönliche wöchentliche
  Empfehlungs-DM** an/aus.
- **`/subscribe list`** — zeigt alles, was du aktuell abonniert hast.

### ✨ `/foryou [filter]`  *(braucht Jellyfin)*
Persönliche Empfehlungen aus **deinem** Jellyfin-Verlauf.
- **`filter`** *(optional)* — `🌐 Alle Empfehlungen` (lässt dich Fehlendes anfragen)
  oder `✅ Nur in Bibliothek verfügbar`.

### 🔖 `/watchlist [filter]`
Zeigt aktuelle Medienanfragen aus Seerr.
- **`filter`** *(optional)* — `📋 Alle Anfragen`, `👤 Meine Anfragen`, `⏳ Ausstehend` oder `✅ Verfügbar`.

### 🕘 `/history [typ]`
Zeigt zuletzt zu Jellyfin hinzugefügte Filme und Serien.
- **`type`** *(optional)* — `📋 Alle`, `🎬 Filme` oder `📺 Serien`.

### 📅 `/upcoming [typ]`
Stöbere durch kommende Filmstarts und neue Serien von TMDB.
- **`type`** *(optional)* — `📋 Alle`, `🎬 Filme` oder `📺 Serien`.

### ❓ `/help`
Zeigt alle verfügbaren Befehle mit Schnellzugriff-Buttons. Guter Startpunkt für neue Nutzer.

---

## Teil 2 · Features

Diese laufen im Hintergrund oder leben im Dashboard. Einmal konfiguriert, arbeiten
sie automatisch.

### 🔔 Seerr-Webhook & die Status-„Ampel"

So erfährt Questorr von Seerr-Ereignissen (Anfrage genehmigt, Medium verfügbar,
abgelehnt, …) und macht daraus Discord-Nachrichten. **Das ist die wichtigste
Integration überhaupt**, also folge genau.

**1. Setze ein Webhook-Secret in Questorr.** Unter **Schritt 2 → Seerr Webhook URL**
das **Secret** kopieren. Ohne Secret weist Questorr alle eingehenden Webhooks mit
HTTP 503 (`NO_SECRET`) ab.

**2. Trage URL und Secret in Seerr ein.** Unter **Seerr → Einstellungen →
Benachrichtigungen → Webhook**:
- **Webhook-URL** → die in Questorr angezeigte URL.
- **Authorization Header** → das Secret einfügen (exakt, keine Leerzeichen — eine
  Abweichung wird mit HTTP 401 / `AUTH_FAIL` abgewiesen).
- Webhook aktivieren und die gewünschten Notification Types anhaken. Damit
  `/report`-Folgenachrichten beim Melder ankommen, auch die **Issue**-Events
  aktivieren (Issue Created / Comment / Resolved / Reopened).

> ⚠️ **Docker-URL-Falle (Ursache Nr. 1 für „nichts kommt an").** Die URL, die
> Questorr zeigt, nutzt die Adresse, mit der *du* das Dashboard geöffnet hast, z. B.
> `http://localhost:8283/seerr-webhook`. Das funktioniert **nicht** aus dem
> Seerr-Container, wo `localhost` Seerr selbst meint. Nutze eine Adresse, die Seerr
> tatsächlich erreicht:
> - **Gleiches Docker-Netz:** Container-Name + interner Port, z. B.
>   `http://questorr:8282/seerr-webhook`.
> - **Getrennte Hosts:** die LAN-IP deines Servers, z. B. `http://192.168.1.10:8282/seerr-webhook`.
> - **Reverse Proxy:** deine öffentliche URL, z. B. `https://questorr.example.com/seerr-webhook`.

**3. Prüfe, ob es läuft — lies die Ampel.** Der Setup-Kasten zeigt ein Live-Badge,
das alle 30 Sekunden pollt:
- 🟡 **Noch nie empfangen** — es kam noch nie ein Webhook an. Vor dem ersten
  Ereignis normal. Zum Grün-Schalten in Seerrs Webhook-Einstellungen **Test**
  klicken (sendet `TEST_NOTIFICATION`), oder ein echtes Seerr-Ereignis auslösen.
- 🔴 **Auth-Fehler** — ein Webhook kam an, aber das Secret passte nicht. Der
  Tooltip zeigt einen Längen-/Prefix-Hinweis. Secret erneut in Seerrs Feld
  **Authorization Header** kopieren (nicht in die URL).
- 🟢 **OK** — der letzte Webhook wurde akzeptiert. Fertig.

| Ampel | Bedeutung | Lösung |
|---|---|---|
| 🟡 Noch nie empfangen | Seerr hat Questorr nie erreicht | URL prüfen (Docker-Falle oben), dann in Seerr **Test** klicken |
| 🔴 Auth-Fehler | Falsches/fehlendes Secret | Secret erneut in Seerrs *Authorization Header* einfügen |
| 🟢 OK | Funktioniert | — |

### 📺 Channel-Routing
Questorr entscheidet, in welchen Discord-Channel jedes Seerr-Ereignis geht, in
dieser Reihenfolge:
1. **Root Folder → Channel** (`SEERR_ROOT_FOLDER_CHANNELS`) — z. B. Anime-Root-Folder
   → `#anime`. Einrichten unter **Schritt 2 → Root Folder → Channel-Zuordnung**
   (erst *Root Folders laden*).
2. **Jellyfin-Bibliothek → Channel** (`JELLYFIN_NOTIFICATION_LIBRARIES`) — abgeglichen über TMDB-ID.
3. **Medientyp → Channel** (`CHANNEL_MOVIES` / `CHANNEL_SERIES`).
4. **`SEERR_CHANNEL_ID`** — der Standard-Seerr-Channel.
5. **`JELLYFIN_CHANNEL_ID`** — letzter Rückfall.

Manche Ereignisse (z. B. *Medium verfügbar*) enthalten den Root Folder nicht im
Payload; Questorr fragt dann Seerr und Radarr/Sonarr, bevor es zurückfällt.

### 🔕 Private Ereignisse & DMs
- **Ausstehende Genehmigung** und **Ablehnung** gehen **nur als DM** an den
  Anfragenden — nie in einen öffentlichen Channel.
- Anfragende bekommen eine DM, wenn ihr Inhalt **genehmigt, abgelehnt oder
  verfügbar** wird.
- Mit `APPROVAL_DM_ONLY` (Standard an) sind Genehmigungen DM-only, um Channels ruhig zu halten.

### 🆕 Wöchentlicher Bibliotheks-Digest
Ein opt-in Wochenpost, der listet, was seit dem letzten Digest **neu in deiner
Jellyfin-Bibliothek** ist: neue Filme, neue Serien **und neue Episoden** zu Serien,
die du schon hast. Aktivieren im **Digest**-Bereich (Channel, Tag, Zeit setzen).
Der Button **Test-Digest jetzt senden** zeigt sofort eine Vorschau; die
Diagnose-Ausgabe sagt dir, warum ein Digest leer wäre (nichts Neues, kein Channel,
deaktiviert, …).

### 🚦 Pro-Nutzer-Anfragelimit (Quota)
Ein optionales **gleitendes 7-Tage**-Limit, wie viele Anfragen jeder Nutzer stellen darf.
- `QUOTA_WEEKLY_LIMIT` — `0` heißt unbegrenzt (aus). Jede positive Zahl ist das Limit.
- **Bypass-Rollen** — Mitglieder mit diesen Discord-Rollen ignorieren das Limit.
- **Unbegrenzte Nutzer** — bestimmte Mitglieder ohne Limit. Im Dashboard wählst du
  erst eine Discord-**Rolle**, dann Mitglieder aus dieser Rolle (mit Avataren).

### 👤 Benutzerzuordnung
Verknüpft ein Discord-Konto mit einem Seerr-Konto, damit Anfragen unter dem
richtigen Seerr-Nutzer erscheinen (und Seerrs eigene Pro-Nutzer-Quotas greifen).
Einrichten unter Benutzerzuordnung; die Mitgliederauswahl lässt sich erst nach
einer Discord-Rolle filtern.

> **Seerr-Berechtigungen sind entscheidend.** Questorr handelt *als der gemappte
> Seerr-User* (über den `x-api-user`-Header). Dieser User braucht in Seerr die
> jeweilige Berechtigung, damit die Aktion klappt: **Anfragen** zum Requesten,
> **Auto-Genehmigen** für sofortige Freigabe und **Probleme melden** für
> `/report`. Ein nicht zugeordneter User fällt auf den API-Key-Owner (Admin) zurück.

### 🔐 Rollen-Berechtigungen
Steuere, wer Questorrs Befehle nutzen darf:
- **Allowlist** (`ROLE_ALLOWLIST`) — wenn gesetzt, dürfen *nur* diese Rollen Befehle nutzen.
- **Blocklist** (`ROLE_BLOCKLIST`) — diese Rollen dürfen *nie* Befehle nutzen.
Beide leer = alle dürfen.

### 🌟 Tägliche Tipps & 🎲 täglicher Zufall
- **Tägliche Empfehlung** — postet täglich einen Tipp aus deiner **bestehenden
  Jellyfin-Bibliothek**.
- **Täglicher Zufalls-Tipp** — postet täglich einen Zufallsvorschlag aus **TMDB**.
Jeder läuft auf festem Intervall oder zu fester Tageszeit, in eigenem Channel.

### 🧹 Aufräum-Berater
Ein Wochenpost, der **selten geschaute Filme** als Löschkandidaten listet, basierend
auf Alter, Abspielzahl und Zeit seit letztem Abspielen. Server-aggregiert, nur
Filme, opt-in. Praktisch, um ein NAS aufgeräumt zu halten.

### 🔄 Seerr-Status-Poller
Ein Sicherheitsnetz für verpasste `MEDIA_APPROVED`-Webhooks (z. B. wenn ein Admin
direkt in der Seerr-UI genehmigt, ohne diesen Notification Type aktiviert zu haben).
Aktiviert, pollt er Seerr und schickt dem Anfragenden eine DM bei Übergängen
ausstehend → genehmigt/abgelehnt.

### 📡 Jellyfin-Poller
Erkennt neu hinzugefügte Jellyfin-Inhalte **ohne** das Jellyfin-Webhook-Plugin.
Pollt alle `JELLYFIN_POLL_INTERVAL_SECONDS`, stößt optional vorher einen
Bibliotheks-Scan an (`JELLYFIN_AUTO_REFRESH`) und benachrichtigt nur Inhalte, die
in den letzten `JELLYFIN_RECENT_ADDED_DAYS` Tagen hinzukamen.

### 🧩 Einbettbares Status-Widget
Ein HTML-Widget (für Homarr / Homepage / Organizr) mit Bot-Status, Statistiken und
Start/Stop-Steuerung. Mit `WIDGET_API_KEY` schützen, mit `WIDGET_ALLOWED_ORIGINS`
das Einbetten beschränken, mit `WIDGET_ANONYMIZE_STATS` echte Namen verbergen.

### 💚 Health-Check-Leiste & 📊 Statistiken
Das Dashboard zeigt eine Echtzeit-Health-Leiste (sind Discord/Seerr/Jellyfin/TMDB
erreichbar?) und ein Statistik-Panel mit Befehlsnutzung pro Nutzer.

### 🐛 Problem-Meldungen & Lösung
Nutzer melden Wiedergabe-Probleme mit `/report` (siehe Teil 1). Issues sind
**privat**: sie gehen nur in den **Admin-Channel** und werden in Seerr unter dem
gemappten User des Melders geöffnet. Der Admin-Post hat **💬 Kommentieren**- und
**✅ Lösen**-Buttons, sodass Admins alles aus Discord erledigen. Kommentieren /
Lösen läuft über Seerrs `ISSUE_COMMENT` / `ISSUE_RESOLVED`-Webhooks zurück, die den
**Melder per DM** benachrichtigen — aktiviere diese Issue-Events also an deinem
Seerr-Webhook. Befehl schaltbar über `SHOW_REPORT_COMMAND`.

### 🛡️ Admin-Audit-Log
Der Dashboard-Log-Viewer hat einen **Audit**-Tab, der sicherheitsrelevante
Admin-Aktionen protokolliert: Request **Approve/Decline** (welcher Discord-User),
**Config-Speicherungen** (nur geänderte Key-Namen — keine Secret-Werte),
**Bot Start/Stop** und **Dashboard-Logins** (Erfolg + Fehlversuch mit IP).
Gespeichert in einer begrenzten `config/admin-audit.json`.

### 🚨 Proaktive Health-Alerts
Optionaler Watchdog (**Schritt 7 → Verschiedenes**, standardmäßig aus). Aktiviert
prüft Questorr regelmäßig, ob **Seerr** und **Jellyfin** erreichbar sind, und
postet in einen Admin-Channel, wenn ein Dienst **ausfällt** oder **wiederkommt** —
so merkst du einen Ausfall vor den Nutzern. Die **erste** Prüfung nach dem Start
setzt nur eine Basislinie (kein Alert), damit ein Neustart nicht spammt.
Einstellungen:
- `HEALTH_ALERTS_ENABLED` — Hauptschalter.
- `HEALTH_ALERT_INTERVAL_SECONDS` — Prüfintervall (Standard `120`, min. 30).
- `HEALTH_ALERT_CHANNEL_ID` — wohin gepostet wird; leer = Admin-Channel
  (`SEERR_ADMIN_CHANNEL_ID` → `SEERR_CHANNEL_ID` → `JELLYFIN_CHANNEL_ID`).

### 🎨 Dashboard-Themes (Dark / Light)
Das Dashboard bringt ein **Retro-Neon/Pixel-Dark**-Theme (Standard) und ein
**Paper-Terminal-Light**-Theme mit. Der Navbar-Umschalter wird vor dem Paint
angewendet (kein Flackern) und pro Browser gemerkt. Animationen (Entrance,
Scroll-Reveals, fallende Tetris-Blöcke) respektieren `prefers-reduced-motion`.

### 🌍 Mehrsprachigkeit
Dashboard und Bot sprechen **Englisch** und **Deutsch**. Die UI-Sprache wird pro
Browser gemerkt; die Bot-Sprache wird separat gesetzt (`BOT_LANGUAGE`).

---

## Teil 3 · Konfigurationsreferenz

Jede Einstellung liegt in `config/config.json` (beim ersten Start erzeugt, auch im
Dashboard editierbar). Werte werden als Strings gespeichert, sofern nicht anders
vermerkt. **Standardwerte stehen in `code`.** Die meisten musst du selten anfassen —
der Dashboard-Assistent setzt die wichtigen für dich.

### Kern · Discord
| Einstellung | Standard | Bedeutung |
|---|---|---|
| `DISCORD_TOKEN` | `""` | Dein Discord-Bot-Token. Pflicht. |
| `BOT_ID` | `""` | Application-/Client-ID des Bots. Pflicht. |
| `GUILD_ID` | `""` | Deine Discord-Server-ID. Befehle registrieren sich sofort auf diesem Server; leer = global (bis zu 1 h Verzögerung). |
| `AUTO_START_BOT` | `"true"` | Bot beim Start von Questorr automatisch starten. |
| `COMMAND_RATE_LIMIT` | `"10"` | Max. Befehle pro Nutzer pro Minute. |
| `JWT_SECRET` | `""` | Secret für Dashboard-Login-Sitzungen. Wird automatisch erzeugt, wenn leer. |
| `DEBUG` | `"false"` | Ausführliches Logging. Im Normalbetrieb aus lassen. |

### Seerr
| Einstellung | Standard | Bedeutung |
|---|---|---|
| `SEERR_URL` | `"http://localhost:5055"` | Basis-URL deines Overseerr/Jellyseerr. |
| `SEERR_API_KEY` | `""` | Seerr-API-Key. Pflicht für Anfragen/Status. |
| `SEERR_AUTO_APPROVE` | `"true"` | Über Questorr gestellte Anfragen automatisch genehmigen. |

### Mediendatenbanken
| Einstellung | Standard | Bedeutung |
|---|---|---|
| `TMDB_API_KEY` | `""` | **Pflicht.** Treibt Suche, Discover, Poster, Empfehlungen. |
| `OMDB_API_KEY` | `""` | Optional. Ergänzt Bewertungen (IMDb/Rotten Tomatoes). |

### Jellyfin
| Einstellung | Standard | Bedeutung |
|---|---|---|
| `JELLYFIN_BASE_URL` | `""` | Jellyfin-Server-URL. Nötig für `/random`, `/foryou`, Verfügbarkeit. |
| `JELLYFIN_API_KEY` | `""` | Jellyfin-API-Key. |
| `JELLYFIN_SERVER_ID` | `""` | Jellyfin-Server-ID (für Deep-Links). |
| `JELLYFIN_CHANNEL_ID` | `""` | Letzter Rückfall-Channel für Benachrichtigungen. |
| `JELLYFIN_EPISODE_CHANNEL_ID` | `""` | Channel für Neue-Episode-Benachrichtigungen. |
| `JELLYFIN_SEASON_CHANNEL_ID` | `""` | Channel für Neue-Staffel-Benachrichtigungen. |
| `JELLYFIN_NOTIFICATION_LIBRARIES` | `{}` | Zuordnung Jellyfin-Bibliothek → Discord-Channel (Routing). |
| `JELLYFIN_NOTIFY_MOVIES` | `"true"` | Benachrichtigen, wenn ein Film hinzukommt. |
| `JELLYFIN_NOTIFY_SERIES` | `"true"` | Benachrichtigen, wenn eine Serie hinzukommt. |
| `JELLYFIN_NOTIFY_SEASONS` | `"false"` | Benachrichtigen, wenn eine neue Staffel hinzukommt. |
| `JELLYFIN_NOTIFY_EPISODES` | `"false"` | Benachrichtigen, wenn eine neue Episode hinzukommt. |

### Jellyfin-Poller (Neuzugang-Erkennung)
| Einstellung | Standard | Bedeutung |
|---|---|---|
| `JELLYFIN_POLL_INTERVAL_SECONDS` | `"120"` | Wie oft Jellyfin auf Neuzugänge geprüft wird. `0` schaltet Polling aus. |
| `JELLYFIN_AUTO_REFRESH` | `"true"` | Vor jedem Poll einen Jellyfin-Scan anstoßen (gedrosselt auf 1×/60 s). |
| `JELLYFIN_RECENT_ADDED_DAYS` | `"7"` | Nur Inhalte der letzten N Tage benachrichtigen. `0` deaktiviert den Filter (Power-User; ein manueller Scan kann dann die ganze Bibliothek spammen). |
| `JELLYFIN_RETRY_DELAY_SECONDS` | `"30"` | Verzögerung vor Wiederholung eines `MEDIA_AVAILABLE`-Events. `0` = aus. |
| `JELLYFIN_POLLER_METADATA_DELAY_SECONDS` | `"60"` | So lange auf eine TMDB-ID warten, bevor benachrichtigt wird. `0` = sofort. |
| `JELLYFIN_POLLER_SHOW_BUTTON_WATCH` | `"true"` | *Jetzt ansehen*-Button bei Poller-Benachrichtigungen zeigen. |
| `JELLYFIN_POLLER_SHOW_BUTTON_IMDB` | `"true"` | *IMDb*-Button bei Poller-Benachrichtigungen zeigen. |
| `JELLYFIN_POLLER_SHOW_BUTTON_LETTERBOXD` | `"true"` | *Letterboxd*-Button bei Poller-Benachrichtigungen zeigen. |

### Webhook
| Einstellung | Standard | Bedeutung |
|---|---|---|
| `WEBHOOK_PORT` | `"8282"` | Port für Dashboard und Seerr-Webhook-Endpoint. |
| `WEBHOOK_SECRET` | `""` | Gemeinsames Secret, das Seerr im `Authorization`-Header senden muss. **Pflicht für Webhooks.** |
| `WEBHOOK_DEBOUNCE_MS` | `"15000"` | Doppelte Events innerhalb dieses Fensters ignorieren (ms). |

### Benachrichtigungs-Channels & Routing
| Einstellung | Standard | Bedeutung |
|---|---|---|
| `SEERR_CHANNEL_ID` | `""` | Standard-Channel für Seerr-Ereignisse. |
| `SEERR_ADMIN_CHANNEL_ID` | `""` | Admin-Channel (ausstehende Genehmigung, Download fehlgeschlagen). Leer = wie Standard. |
| `SEERR_ROOT_FOLDER_CHANNELS` | `{}` | Zuordnung Radarr/Sonarr-Root-Folder → Channel (Routing höchster Priorität). |
| `CHANNEL_MOVIES` | `""` | Channel für Film-Ereignisse (Medientyp-Routing). |
| `CHANNEL_SERIES` | `""` | Channel für Serien-Ereignisse. |
| `POST_HELP_CHANNEL_ID` | `""` | Channel, in dem die `/help`-Übersicht gepostet werden kann. |

### Benachrichtigungsverhalten
| Einstellung | Standard | Bedeutung |
|---|---|---|
| `NOTIFY_ON_AVAILABLE` | `"true"` | Benachrichtigen, wenn ein Medium verfügbar wird. |
| `APPROVAL_DM_ONLY` | `"true"` | Genehmigungs-Ereignisse nur als DM, nicht in öffentlichen Channel. |
| `PRIVATE_MESSAGE_MODE` | `"false"` | Veraltet / ohne Funktion — **alle** Command-Antworten sind jetzt immer privat (ephemeral, nur für den ausführenden Nutzer sichtbar). |

### Seerr-Status-Poller
| Einstellung | Standard | Bedeutung |
|---|---|---|
| `SEERR_STATUS_POLLING_ENABLED` | `"false"` | Seerr pollen, um verpasste Genehmigungs-/Ablehnungs-Webhooks zu fangen. |
| `SEERR_STATUS_POLL_INTERVAL_SECONDS` | `"120"` | Poll-Intervall. |
| `HEALTH_ALERTS_ENABLED` | `"false"` | In einen Admin-Channel posten, wenn Seerr/Jellyfin ausfällt oder wiederkommt. |
| `HEALTH_ALERT_INTERVAL_SECONDS` | `"120"` | Prüfintervall (min. 30, max. 3600). |
| `HEALTH_ALERT_CHANNEL_ID` | `""` | Health-Alert-Channel; leer = Admin-Channel. |

### Pro-Nutzer-Quota
| Einstellung | Standard | Bedeutung |
|---|---|---|
| `QUOTA_WEEKLY_LIMIT` | `"0"` | Gleitendes 7-Tage-Anfragelimit pro Nutzer. `0` = unbegrenzt. |
| `QUOTA_BYPASS_ROLES` | `[]` | Discord-Rollen, die vom Limit befreit sind. |
| `QUOTA_UNLIMITED_USERS` | `[]` | Einzelne Nutzer, die vom Limit befreit sind. |

### Abonnements & wöchentliche Empfehlung
| Einstellung | Standard | Bedeutung |
|---|---|---|
| `SUBSCRIPTION_POLL_INTERVAL_MINUTES` | `"60"` | Wie oft abonnierte Serien auf neue Staffeln geprüft werden. |
| `WEEKLY_RECOMMENDATION_DAY` | `"sunday"` | Tag für die wöchentliche Empfehlungs-DM (`monday`…`sunday`). |
| `WEEKLY_RECOMMENDATION_TIME` | `"18:00"` | Zeit (HH:MM, 24 h) für diese DM. |

### Wöchentlicher Digest
| Einstellung | Standard | Bedeutung |
|---|---|---|
| `DIGEST_ENABLED` | `"false"` | Den wöchentlichen „Neu in der Bibliothek"-Digest aktivieren. |
| `DIGEST_CHANNEL_ID` | `""` | Channel, in dem der Digest gepostet wird. |
| `DIGEST_DAY` | `"monday"` | Tag des Posts (`monday`…`sunday`). |
| `DIGEST_TIME` | `"09:00"` | Zeit des Posts (HH:MM, 24 h). |

### Täglicher Zufalls-Tipp (aus TMDB)
| Einstellung | Standard | Bedeutung |
|---|---|---|
| `DAILY_RANDOM_PICK_ENABLED` | `"false"` | Täglichen Zufalls-Tipp aktivieren. |
| `DAILY_RANDOM_PICK_CHANNEL_ID` | `""` | Channel dafür. |
| `DAILY_RANDOM_PICK_INTERVAL` | `"1440"` | Intervall in Minuten (1440 = täglich). |
| `DAILY_RANDOM_PICK_TIME` | `""` | Feste Zeit (HH:MM). Wenn gesetzt, überschreibt das Intervall. |

### Tägliche Empfehlung (aus deiner Bibliothek)
| Einstellung | Standard | Bedeutung |
|---|---|---|
| `DAILY_RECOMMENDATION_ENABLED` | `"false"` | Tägliche Bibliotheks-Empfehlung aktivieren. |
| `DAILY_RECOMMENDATION_CHANNEL_ID` | `""` | Channel dafür. |
| `DAILY_RECOMMENDATION_INTERVAL` | `"1440"` | Intervall in Minuten. |
| `DAILY_RECOMMENDATION_TIME` | `""` | Feste Zeit (HH:MM); überschreibt das Intervall. |

### Aufräum-Berater
| Einstellung | Standard | Bedeutung |
|---|---|---|
| `CLEANUP_ADVISOR_ENABLED` | `"false"` | Wöchentlichen Löschkandidaten-Post aktivieren. |
| `CLEANUP_ADVISOR_CHANNEL_ID` | `""` | Channel dafür. |
| `CLEANUP_ADVISOR_DAY` | `"sunday"` | Tag des Posts (`monday`…`sunday`). |
| `CLEANUP_ADVISOR_TIME` | `"09:00"` | Zeit des Posts (HH:MM). |
| `CLEANUP_MIN_AGE_DAYS` | `"365"` | Film muss mindestens N Tage in der Bibliothek sein. |
| `CLEANUP_MAX_PLAYCOUNT` | `"1"` | Nur Filme einbeziehen, die höchstens N-mal abgespielt wurden. |
| `CLEANUP_MIN_DAYS_SINCE_PLAYED` | `"180"` | Falls je abgespielt, muss das letzte Abspielen älter als N Tage sein. |
| `CLEANUP_MAX_RESULTS` | `"25"` | Max. gelistete Titel pro Post. |
| `CLEANUP_FETCH_TIMEOUT_SECONDS` | `"60"` | Jellyfin-Timeout pro Seite (für sehr große Bibliotheken erhöhen). |

### Anfrage-UI & Standardwerte
| Einstellung | Standard | Bedeutung |
|---|---|---|
| `SHOW_TAG_SELECTION` | `"true"` | `tag`-Option bei `/request` zeigen. |
| `SHOW_SERVER_SELECTION` | `"true"` | `server`-Option bei `/request` zeigen. |
| `SHOW_QUALITY_SELECTION` | `"true"` | `quality`-Option bei `/request` zeigen. |
| `SHOW_STATUS_COMMAND` | `"true"` | Den `/status`-Befehl registrieren. |
| `SHOW_RANDOM_COMMAND` | `"true"` | Den `/random`-Befehl registrieren. |
| `SHOW_REPORT_COMMAND` | `"true"` | Den `/report`-Befehl registrieren (Problem-Meldungen). |
| `DEFAULT_QUALITY_PROFILE_MOVIE` | `""` | Standard-Qualitätsprofil für Filmanfragen. |
| `DEFAULT_QUALITY_PROFILE_TV` | `""` | Standard-Qualitätsprofil für Serienanfragen. |
| `DEFAULT_SERVER_MOVIE` | `""` | Standard-Radarr-Server für Filme. |
| `DEFAULT_SERVER_TV` | `""` | Standard-Sonarr-Server für Serien. |

### Embed-Darstellung
| Einstellung | Standard | Bedeutung |
|---|---|---|
| `EMBED_SHOW_BACKDROP` | `"true"` | Großes Hintergrundbild zeigen. |
| `EMBED_SHOW_OVERVIEW` | `"true"` | Handlungszusammenfassung zeigen. |
| `EMBED_SHOW_GENRE` | `"true"` | Genres zeigen. |
| `EMBED_SHOW_RUNTIME` | `"true"` | Laufzeit zeigen. |
| `EMBED_SHOW_RATING` | `"true"` | Bewertung zeigen. |
| `EMBED_SHOW_CONTENT_RATING` | `"true"` | Altersfreigabe (FSK/MPAA) zeigen. |
| `CONTENT_RATING_COUNTRY` | `""` | Ländercode für die Altersfreigabe (z. B. `US`, `DE`). |
| `EMBED_SHOW_PROVIDERS` | `"true"` | Streaming-Anbieter zeigen (Netflix, Disney+, …). |
| `PROVIDER_COUNTRY` | `""` | Ländercode für Anbieter-Verfügbarkeit. |
| `EMBED_FOOTER_TEXT` | `""` | Eigener Fußzeilentext auf allen Embeds. |
| `EMBED_SHOW_BUTTON_SEERR` | `"true"` | *In Seerr ansehen*-Button zeigen. |
| `EMBED_SHOW_BUTTON_WATCH` | `"true"` | *Jetzt ansehen*-Button zeigen. |
| `EMBED_SHOW_BUTTON_LETTERBOXD` | `"true"` | *Letterboxd*-Button zeigen. |
| `EMBED_SHOW_BUTTON_IMDB` | `"true"` | *IMDb*-Button zeigen. |
| `EMBED_COLOR_MOVIE` | `"#1ec8a0"` | Embed-Farbe für Filme. |
| `EMBED_COLOR_SERIES` | `"#1ec8a0"` | Embed-Farbe für Serien. |
| `EMBED_COLOR_SEASON` | `"#17b8c4"` | Embed-Farbe für Staffel-Benachrichtigungen. |
| `EMBED_COLOR_EPISODE_SINGLE` | `"#17b8c4"` | Farbe für eine einzelne neue Episode. |
| `EMBED_COLOR_EPISODE_FEW` | `"#17b8c4"` | Farbe für wenige neue Episoden. |
| `EMBED_COLOR_EPISODE_MANY` | `"#17b8c4"` | Farbe für viele neue Episoden. |
| `EMBED_COLOR_SEARCH` | `"#f0a05a"` | Farbe für Such-Embeds. |
| `EMBED_COLOR_SUCCESS` | `"#2ecc8e"` | Farbe für Erfolgs-/Bestätigungs-Embeds. |

### Pro-Ereignis Titel- & Button-Overrides
Diese zwei Familien erlauben Feintuning **einzelner** Benachrichtigungstypen. Jede
ist standardmäßig leer, was „globalen Standard verwenden" bedeutet.

- **`NOTIF_TITLE_<EREIGNIS>`** — überschreibt den Embed-Titel für ein Ereignis.
  Ereignisse: `MEDIA_PENDING`, `MEDIA_APPROVED`, `MEDIA_AUTO_APPROVED`,
  `MEDIA_AVAILABLE`, `MEDIA_DECLINED`, `MEDIA_FAILED`, `ISSUE_CREATED`,
  `ISSUE_COMMENT`, `ISSUE_RESOLVED`, `ISSUE_REOPENED`, `TEST`, `DAILY_RANDOM`,
  `DAILY_RECOMMENDATION`. Leer = Standardtitel der `BOT_LANGUAGE`.
- **`NOTIF_BUTTONS_<EREIGNIS>`** — kommagetrennte Liste der Buttons für ein
  Ereignis, gewählt aus `seerr, watch, letterboxd, imdb`. Leer = globale
  `EMBED_SHOW_BUTTON_*`-Schalter verwenden. Es gibt auch `_DM`-Varianten
  (`NOTIF_BUTTONS_<EREIGNIS>_DM`), die Buttons in der DM-Version steuern; leer heißt
  keine Buttons in der DM (außer `MEDIA_AVAILABLE`, das aus Kompatibilitätsgründen
  die Channel-Konfiguration erbt).

### Berechtigungen & Zuordnung
| Einstellung | Standard | Bedeutung |
|---|---|---|
| `USER_MAPPINGS` | `[]` | Discord-↔-Seerr-Kontoverknüpfungen. |
| `ROLE_ALLOWLIST` | `[]` | Wenn gesetzt, dürfen nur diese Rollen Befehle nutzen. |
| `ROLE_BLOCKLIST` | `[]` | Diese Rollen dürfen nie Befehle nutzen. |

### Lokalisierung & Formatierung
| Einstellung | Standard | Bedeutung |
|---|---|---|
| `LANGUAGE` | `"en"` | Dashboard-Sprache (`en` / `de`). Pro-Browser-Wahl überschreibt dies. |
| `BOT_LANGUAGE` | `"en"` | Sprache für Discord-Nachrichten/Embeds. |
| `DATE_FORMAT` | `"auto"` | Datumsformat; `auto` wählt einen sinnvollen regionalen Standard. |
| `TIME_FORMAT` | `"auto"` | Zeitformat; `auto` = 24 h für de, 12 h (AM/PM) für en. |

### Widget
| Einstellung | Standard | Bedeutung |
|---|---|---|
| `WIDGET_API_KEY` | `""` | Status-Widget mit Key schützen. Leer = öffentlich. |
| `WIDGET_ALLOWED_ORIGINS` | `""` | Leerzeichen-getrennte Liste erlaubter Origins zum Einbetten per iframe. |
| `WIDGET_ANONYMIZE_STATS` | `"false"` | „User 1", „User 2" statt echter Namen in Widget-Statistiken zeigen. |

---

*Questorr ist ein selbst-gehostetes Hobbyprojekt für Heimserver. Ist hier etwas
unklar oder falsch, bitte ein Issue öffnen — die Doku soll so einfach sein wie der Bot.*
