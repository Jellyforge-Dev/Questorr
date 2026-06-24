# Feature-Roadmap — Questorr

**Date:** 2026-06-24
**Status:** Draft (Übersichtsplan, vor Detail-Specs)
**Scope:** Übergeordnete Planung der nächsten Feature-Pakete. Jedes Paket bekommt
anschließend einen eigenen Detail-Spec → Plan → Umsetzung.

## Ausgangslage (verifiziert im Code)

Bereits vorhanden — **nicht** neu zu bauen:
- **Webhook-Test:** `POST /api/test-seerr-webhook` (app.js) + Dashboard-Button
  `test-seerr-webhook-btn`, plus `test-notification-buttons-btn`.
- **`/watchlist` + Wizard-Button** (`wizard_watchlist`). Nur die 4 Filter
  (All/Mine/Pending/Available) sind Slash-Optionen, keine eigenen Buttons.

Wiederverwendbare Basis:
- **Cron-Muster** in `bot/dailyPick.js` (`scheduleDailyRandomPick` /
  `scheduleDailyRecommendation`: „compute next run + setInterval").
- **`utils/requestStore.js`** mit `requestedAt` + `discordUserId` pro Record.
- **`bot/commandStats.js`** (`getCommandStats`) als Analytics-Datenquelle.
- **Persistente-Store-Muster** (`notificationAudit`, `requestStore`,
  `userMappingStore`): atomic tmp+rename, mode 0600, load/save.
- **About-Seite** (`about-page` + `about.feature_*` Locale-Keys). Aktuell fehlen
  dort u.a. `/queue` und alle neuen Features.

## Pakete

### A — Subscription-Infrastruktur: `/subscribe` + Wochenempfehlung
**Ziel:** User abonnieren (a) eine Serie → DM bei neuer Staffel, (b) optional eine
personalisierte Wochenempfehlung per DM.
**Warum zusammen:** Beide brauchen denselben **Opt-in-/Subscription-Store** und
die **Cron-Mechanik**. Gemeinsam gebaut = eine wiederverwendbare Basis.
**Komponenten (grob):** `utils/subscriptionStore.js` (Serie-Abos + Opt-in-Flags),
`bot/commands/subscribe.js` + Wizard-Button, Staffel-Erkennungs-Poller,
`bot/weeklyDigest`/`weeklyRecommendation` (Cron, baut auf `/foryou`).
**Aufwand:** L. **Abhängigkeiten:** keine (baut Basis für sich selbst).
**Offene Design-Fragen (Detail-Spec):**
- „Neue Staffel" — Erkennung via TMDB (`number_of_seasons` / next air date) oder
  via Jellyfin (neue Season-Items)? Poll-Intervall?
- Opt-in Wochenempfehlung — via Command (`/subscribe weekly`) oder Dashboard-
  Toggle? Versand-Timing (Wochentag/Uhrzeit, Zeitzone)?
- Wizard-Button „Serie abonnieren" — wie wird die Serie ausgewählt (Autocomplete
  wie `/recommend`, oder aus einem `/queue`-/Watch-Kontext)?

### B — Quota pro User (X Requests / Zeitfenster)
**Ziel:** Admin begrenzt Requests pro User; Überschreitung wird abgelehnt.
**Komponenten:** Zähl-Helper über `requestStore` (Einträge pro `discordUserId`
im Fenster), Enforcement in `requestButton`/`randomRequestButton`/`search`,
Dashboard-Config (Limit + Fenster).
**Aufwand:** M. **Abhängigkeiten:** keine.
**Offene Design-Fragen:**
- Fenster: rollierend (letzte 7 Tage) oder fixer Wochenstart (Mo 00:00)?
- Global oder pro Medientyp (Film/Serie)? Admin-/Rollen-Bypass?
- Verhalten bei Limit: ephemere Ablehnung mit „noch X übrig / Reset in Y"?

### C — Analytics-Panel (Dashboard)
**Ziel:** Admin sieht beliebteste Anfragen, aktivste User, Genre-Trends,
Command-Nutzung.
**Komponenten:** `GET /api/analytics` (aggregiert `commandStats` + `requestStore`),
Dashboard-Panel.
**Aufwand:** M. **Abhängigkeiten:** profitiert von B (gleiche Datenquelle), aber
unabhängig baubar.
**Offene Design-Fragen:** Welche Metriken genau (Top-N)? Zeitraum (alles / 30d)?

### D — Wöchentlicher „Neu in der Library"-Digest
**Ziel:** Cron-Post „Diese Woche hinzugefügt: …" in einen Channel.
**Komponenten:** `bot/weeklyDigest.js` (Cron + `fetchItemsAddedSince` aus
`api/jellyfin.js`), Channel-/Timing-Config.
**Aufwand:** S–M. **Abhängigkeiten:** teilt Cron-Basis mit A.
**Offene Design-Fragen:** Timing/Channel/Format; Verhalten wenn nichts neu
(posten „nichts Neues" oder still überspringen)?

### E — Watchlist-Filter-Buttons (klein)
**Ziel:** Die 4 `/watchlist`-Filter als Wizard-Buttons oder Select-Menu.
**Aufwand:** S. **Abhängigkeiten:** keine. Optional/Nice-to-have.

### F — About-Seite vervollständigen
**Ziel:** Alle Features (inkl. `/queue`, Audit, Preflight + neue Pakete) in
`about-page` + Locales (de/en/template) beschreiben.
**Aufwand:** S, aber rollend. **Empfehlung:** Nach jedem Paket den jeweiligen
About-Eintrag mit ausliefern (statt einmal am Ende), damit Doku und Feature
synchron bleiben. Zusätzlich gleich `/queue` nachtragen (fehlt bereits).

## Empfohlene Reihenfolge

1. **F-Teil sofort:** `/queue` in About nachtragen (1 kleiner Fix, schließt eine
   bestehende Lücke).
2. **B — Quota** (klares Admin-Feature, geringes Risiko, schnelle Lieferung).
3. **C — Analytics** (baut auf derselben Datenquelle, sichtbarer Admin-Wert).
4. **A — Subscription-Block** (größter User-Wert, größter Aufwand — danach steht
   die Cron-/Opt-in-Basis).
5. **D — Digest** (nutzt die Cron-Basis aus A).
6. **E — Watchlist-Buttons** (kleiner Abschluss).

Jedes Paket liefert seinen About-Eintrag (F) mit. Begründung der Reihenfolge:
erst die risikoarmen, in sich geschlossenen Admin-Features (B, C), dann der große
User-Block (A) der eine Basis schafft, die D mitnutzt.

## Nicht im Scope (bewusst)
- Webhook-Test (existiert).
- Request-Voting, Multi-Guild, Config-Backup-Restore — nicht angefragt.
