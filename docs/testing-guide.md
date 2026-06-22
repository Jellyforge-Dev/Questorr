# Questorr – Test-Anleitung (neue & geänderte Funktionen)

Diese Anleitung deckt alle Features ab, die in den letzten Arbeitsblöcken neu
gebaut oder geändert wurden. Jeder Abschnitt nennt **Schritte**, **erwartetes
Ergebnis** und **wo du schauen sollst** (Discord, Logs, Dashboard, Dateien).

> Voraussetzung: Bot läuft (`npm run dev` oder `docker compose up -d`),
> Dashboard erreichbar auf `http://<host>:8282`, Seerr/Jellyfin/TMDB konfiguriert.
> Automatisierte Tests jederzeit mit `npm test` (aktuell 183 grün).

Schnell-Orientierung, wo Daten liegen:

| Datei | Inhalt |
|-------|--------|
| `config/request-store.json` | Lifecycle aller via Questorr/Seerr getrackten Requests |
| `config/notification-audit.json` | Audit-Trail (was wurde gepostet/übersprungen) |
| `config/notify-prefs.json` | Wer hat `/notify` aktiviert |
| `config/notify-dedup.json` | Cross-Source-Dedup-Fenster (48h) |
| `logs/combined-*.log`, `logs/error-*.log` | Bot-Logs (mit Secret-Redaktion) |

---

## 1. Secret-Redaktion in Logs

**Was:** API-Keys, Bearer-Tokens und Passwörter werden vor dem Schreiben aus den
Logs entfernt (`<redacted>`). Gilt für Datei- und Konsolen-Logs.

**Schritte:**
1. Bot starten und eine Aktion auslösen, die Seerr/Jellyfin/TMDB anspricht
   (z.B. im Dashboard „Verbindung testen", oder eine Slash-Command-Suche).
2. Optional gezielt provozieren: im Dashboard absichtlich einen **falschen**
   API-Key bei einem Verbindungstest eingeben → der fehlerhafte Request wird
   geloggt.

**Erwartetes Ergebnis:**
- In `logs/combined-*.log` und `logs/error-*.log` erscheinen **keine** Klartext-
  Secrets. Stellen wie `X-Api-Key`, `?api_key=…`, `Bearer …`, `password=…`
  zeigen `<redacted>`.
- Normale Log-Inhalte (Titel, Channel-IDs, Statusmeldungen) bleiben unverändert.

**Wo schauen:** `logs/combined-*.log`, `logs/error-*.log`. Im Dashboard unter
dem Log-Viewer (sofern sichtbar) ebenfalls redigiert.

**Gegencheck (negativ):** Ein normaler Satz wie „Sent notification for Dune to
channel 12345" darf **nicht** verändert werden.

---

## 2. Input-Validierung der Verbindungstests

**Was:** Die zuvor ungeprüften Endpunkte validieren jetzt ihren Request-Body
(Joi). Betroffen: Seerr-Verbindungstest, Quality-Profiles, Server,
Root-Folders; Jellyfin-Libraries, Jellyfin-Test, Poll-Now.

**Schritte (Dashboard, normaler Weg):**
1. Setup-Wizard / Einstellungen öffnen, Seerr- und Jellyfin-Verbindung wie
   gewohnt testen.

**Erwartetes Ergebnis:** Funktioniert exakt wie vorher – valide Eingaben werden
nicht abgewiesen.

**Schritte (Fehlerfall erzwingen, optional, via API):**
```bash
# Token aus dem Browser holen (localStorage "questorr_token") und einsetzen:
curl -X POST http://<host>:8282/api/test-seerr \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"url":"http://seerr:5055"}'      # apiKey fehlt absichtlich
```

**Erwartetes Ergebnis:** HTTP **400** mit
`{"success":false,"message":"Validation failed","errors":[…]}` statt eines
unkontrollierten Fehlers.

**Wo schauen:** HTTP-Antwort (curl / Browser-DevTools → Network). Server-Log
zeigt keinen Stacktrace mehr für solche Fälle.

---

## 3. Notification-Dispatcher + Audit-Trail

**Was:** Die Doppelpost-Vermeidung zwischen Seerr-Webhook und Jellyfin-Poller
läuft jetzt über **eine** zentrale Stelle. Jede Entscheidung (gepostet /
übersprungen, von welcher Quelle, in welchen Channel, mit welchem Grund) wird
protokolliert.

**Schritte:**
1. Einen Titel verfügbar werden lassen, der **nicht** über Questorr angefragt
   wurde (z.B. direkt in der Jellyseerr-UI anfragen, herunterladen lassen).
2. Warten, bis Jellyfin gescannt hat und/oder der Seerr-`MEDIA_AVAILABLE`-
   Webhook feuert.
3. Audit abrufen:
```bash
curl http://<host>:8282/api/notifications/audit?limit=20 \
  -H "Authorization: Bearer <TOKEN>"
```

**Erwartetes Ergebnis:**
- In Discord erscheint **genau eine** „Now Available!"-Nachricht (kein
  Doppelpost).
- Die Audit-Antwort enthält Einträge mit `status: "posted"` **und** ggf.
  `status: "skipped"` (Quelle, die als zweite kam), jeweils mit `source`
  (`seerr-webhook` / `jellyfin-poller`), `tmdbId`, `title`, `channelId`,
  `reason`, `at`.

**Wo schauen:**
- Discord: der Ziel-Channel (nur eine Nachricht).
- API: `GET /api/notifications/audit`.
- Datei: `config/notification-audit.json` (Ring-Puffer, max 200 Einträge).
- Logs: `[SEERR WEBHOOK] Skipping duplicate …` bzw. Poller-`Skipping … already
  notified`.

---

## 4. `/notify` – Opt-in-DM bei Verfügbarkeit

**Was:** User können per `/notify` eine DM abonnieren, die kommt, sobald eine
ihrer Anfragen den Status **Verfügbar** erreicht.

**Voraussetzung:** Der Seerr-Status-Poller muss laufen
(`SEERR_STATUS_POLLING_ENABLED=true`), da die Übergangserkennung dort sitzt.

**Schritte:**
1. In Discord `/notify` ausführen → es sollte „🔔 Du bekommst jetzt eine DM …"
   (ephemer) erscheinen. Nochmal `/notify` → „🔕 … ausgeschaltet."
2. `/notify` wieder **aktivieren**.
3. Einen Film/eine Serie via Questorr anfragen (Request-Button), der noch nicht
   verfügbar ist.
4. Den Request verfügbar werden lassen (Download abschließen, bis Seerr
   `media.status = 5` meldet). Auf den nächsten Poll-Tick warten
   (Default 120 s, via `SEERR_STATUS_POLL_INTERVAL_SECONDS`).

**Erwartetes Ergebnis:**
- Schritt 1: korrekte Ein-/Aus-Bestätigung, jeweils nur für dich sichtbar.
- Schritt 4: Du erhältst eine **DM**: „🎬 **<Titel>** ist jetzt auf Jellyfin
  verfügbar. Viel Spaß!".
- Hast du `/notify` **nicht** aktiviert, kommt **keine** DM.

**Wo schauen:**
- Discord: ephemere Antwort + DM vom Bot.
- Datei: `config/notify-prefs.json` enthält deine Discord-ID, wenn aktiviert.
- Logs: `[/notify] DM sent to <id> for "<Titel>" (now available)`.

**Schnelltest ohne echten Download:** `config/request-store.json` bei
gestopptem Bot editieren – einen Eintrag mit deiner `discordUserId` und
`stage: "Processing"` anlegen, Bot starten, `/notify` aktivieren, dann in Seerr
den Status auf verfügbar bringen; beim nächsten Tick erkennt der Poller den
Übergang Processing → Available und schickt die DM.

---

## 5. `/queue` – Backfill, Titel-Auflösung, Stages

**Was:** `/queue` (auch über den „Meine Anfragen"-Button im `/help`-Embed)
zeigt deine Requests gruppiert nach Stage. Neu: Backfill alter Requests,
echte Titel statt „TMDB <id>", Stages **Verfügbar/Fehlgeschlagen**.

**Schritte:**
1. In Discord `/help` aufrufen → Button **„Meine Anfragen"** klicken
   (alternativ `/queue` direkt).
2. Anzeige prüfen.

**Erwartetes Ergebnis (gemappter User):**
- Gruppierte Liste: ⏳ Wartet auf Freigabe / ⬇️ Lädt / 🎬 Teilweise verfügbar /
  🎬 Verfügbar / ❌ Abgelehnt / ⚠️ Fehlgeschlagen.
- **Echte Titel** statt „TMDB 12345" – auch für ältere Requests (Backfill +
  TMDB-Titel-Auflösung beim ersten Aufruf; danach persistiert).
- Auch Requests, die **vor** Einführung des Stores oder **direkt in der
  Seerr-UI** gestellt wurden, tauchen auf (Backfill, nur für gemappte User).

**Stage-Spezialfälle gezielt prüfen:**
- **Verfügbar:** Ein abgeschlossener Request darf **nicht** mehr fälschlich als
  „Wartet auf Freigabe" erscheinen (Seerr setzt `request.status` auf COMPLETED=5;
  Verfügbarkeit wird aus `media.status` abgeleitet).
- **Fehlgeschlagen (Status 4):** Künstlich testen → Bot stoppen,
  `config/request-store.json` editieren, Eintrag mit deiner `discordUserId`,
  `"stage": "Failed"`, `"seerrStatus": 4`, aktuellem `updatedAt`; Bot starten,
  `/queue` → erscheint unter **⚠️ Fehlgeschlagen**.

**Wo schauen:**
- Discord: ephemere `/queue`-Antwort.
- Datei: `config/request-store.json` (Titel werden dort nach Auflösung gefüllt).
- Logs: `[queue] reconcile failed: …` nur im Fehlerfall.

**Hinweis (Limitierung):** Ungemappte User (kein `USER_MAPPINGS`-Eintrag) sehen
nur, was sie über Questorr-Buttons angefragt haben – kein Backfill, da globale
Requests nicht eindeutig einem Discord-User zuordenbar sind.

---

## 6. Quick Wins

### 6a. Autocomplete-Mindestlänge
**Schritte:** `/search` (oder `/request`, `/collection`) tippen und **1 Zeichen**
eingeben, dann ein zweites.
**Erwartet:** Bei 1 Zeichen **keine** Vorschläge; ab 2 Zeichen kommen TMDB-
Vorschläge. Spart TMDB-Calls.
**Wo schauen:** Discord-Autocomplete-Dropdown; Logs zeigen keine TMDB-Suche bei
1 Zeichen.

### 6b. Parallele Titel-Auflösung
**Schritte:** Mit vielen alten, titellosen Einträgen `/queue` erstmals aufrufen.
**Erwartet:** Titel erscheinen zügig (Lookups laufen parallel statt
nacheinander); Ergebnis identisch zu vorher, nur schneller.
**Wo schauen:** `/queue`-Antwortzeit; `config/request-store.json` (Titel gefüllt).

### 6c. Geteilter `getUserMappingsFromEnv`-Helper
**Schritte:** `/foryou` und `/queue` als **gemappter** User aufrufen.
**Erwartet:** Beide erkennen dein Mapping wie zuvor (reines Refactoring, kein
Verhaltenswechsel).
**Wo schauen:** Discord (personalisierte Ergebnisse bzw. Backfill funktionieren).

### 6d. `prune()` im Poll-Tick
**Was:** Abgeschlossene Store-Einträge (>30 Tage) werden jetzt auch laufend
beim Seerr-Poll entfernt, nicht nur beim Start.
**Schritte:** Bei gestopptem Bot in `config/request-store.json` einen
abgeschlossenen Eintrag (`stage: "Available"`) mit `updatedAt` älter als 30 Tage
anlegen; Bot starten mit aktiviertem Status-Poller; einen Poll-Tick abwarten.
**Erwartet:** Der alte Eintrag verschwindet aus `request-store.json`.
**Wo schauen:** `config/request-store.json` vor/nach dem Tick.

### 6e. Toter Code entfernt
**Was:** `api/streamystats.js` und `bot/jellyfinWebhook.js` (nirgends importiert)
wurden gelöscht.
**Erwartet:** App startet normal; keine Import-Fehler.
**Wo schauen:** Bot-Start-Log (sauberer Start), `npm test` (grün).

---

## Gesamt-Regressionscheck

```bash
npm test          # alle Unit-Tests (erwartet: grün)
npm run dev       # Bot lokal starten, Start-Logs auf Fehler prüfen
```

Danach die obigen Feature-Checks in Discord/Dashboard durchgehen. Bei
Notification-Themen immer zusätzlich `config/notification-audit.json` bzw.
`GET /api/notifications/audit` heranziehen – dort steht, **warum** etwas
gepostet oder übersprungen wurde.
