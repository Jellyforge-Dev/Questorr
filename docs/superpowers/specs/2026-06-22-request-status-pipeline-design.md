# Request Status Pipeline + `/queue` — Design

**Date:** 2026-06-22
**Status:** Approved
**Scope:** `requestStore` foundation + Seerr poller integration + `/queue` command.
`/notify` and the Health panel are deliberately out of scope — they get their own
specs later and hang cheaply off the store this spec establishes.

## Problem

After a Discord user requests a title, both the user and the admin fly blind until
the `MEDIA_AVAILABLE` webhook fires. There is no way to ask "where is my request?".

Two existing data sources each hold half the truth, and neither alone answers the
question:

| Source | Knows | Gap |
|--------|-------|-----|
| Seerr (`fetchSeerrUserRequests`, `fetchRequests`) | real status + availability, per Seerr user | only for Discord users mapped to a Seerr user via `USER_MAPPINGS`; unmapped requests run under the API-key owner and are not distinguishable per Discord user |
| `pendingRequests` (in-memory Map in `botState.js`) | who clicked request in Discord — even unmapped | only `tmdbId-mediaType` → `Set<discordId>`; no requestId, no status, no progress |

## Key Insight

`sendRequest()` already returns the created Seerr request object, which contains the
Seerr **requestId** (`response.data.id`). `requestButton.js` currently discards this
return value. If we capture `requestId` together with `discordUserId` at click time,
the Seerr poller can later match status updates **by requestId** — which works for
mapped *and* unmapped users. The requestId bridges the mapping blind spot.

The five user-facing stages need both `request.status` (1 pending / 2 approved /
3 declined) and `media.status` (4 partial / 5 available), because "Processing" vs
"Available" lives in `media.status`, not `request.status`. `fetchRequests` already
returns both (`req.status` and `req.media.status`).

## Decisions

1. **Persistent pipeline (foundation), not a single on-demand command.** A real store
   so `/notify` and the Health panel become cheap views later.
2. **Seerr statuses only — no download %.** Pending / Approved / Processing / Available /
   Declined comes free from the already-running Seerr poll. No Radarr/Sonarr queue calls,
   no extra load, no new failure mode.
3. **This spec ships `requestStore` + `/queue` only.** `/notify` + Health panel are
   separate specs.

## Architecture (data flow)

```
Request click (requestButton / randomRequestButton)
   └─ sendRequest() → { id, ... }
        └─ requestStore.add({ requestId:id, tmdbId, mediaType, title, discordUserId })
        └─ pendingRequests.add(...)            (unchanged — Jellyfin poller dedup contract)

Seerr poller tick (only when SEERR_STATUS_POLLING_ENABLED=true)
   └─ fetchRequests(100,"all")  ← already runs, NO extra call
        └─ requestStore.updateFromSeerr(results)   (match by requestId, derive stage)

/queue (user invokes)
   └─ on-demand reconcile (fetch fresh, in case poller disabled)
   └─ requestStore.getByUser(discordUserId)
   └─ embed grouped by stage, ephemeral
```

Core idea: **`requestStore` is the source of truth, keyed on the Seerr requestId.**
The poller keeps it warm; `/queue` reconciles on demand, so the feature does not hard-
depend on the poller being enabled.

## Components

### `utils/requestStore.js` (new, standalone)

Standalone module like the Jellyfin seen-items store — **not** added to `botState.js`
(keeps `botState` lean; `botState` stays unchanged).

Record shape:

```js
{ requestId, tmdbId, mediaType, title, discordUserId,
  stage, seerrStatus, mediaStatus, requestedAt, updatedAt }
```

API:

```
add(record)                 // at click time
updateFromSeerr(reqArray)   // bulk reconcile; calls deriveStage()
getByUser(discordUserId)    // /queue view
deriveStage(req)            // status × mediaStatus → stage (see table below)
load() / save()             // config/request-store.json, atomic tmp+rename, mode 0600
prune(maxAgeDays = 30)      // drop old completed entries
```

Persistence mirrors the `pending-requests.json` pattern: atomic `tmp` write +
`rename`, file mode `0600`, corrupt file → start empty + `logger.warn`.

### `seerrStatusPoller.js` (modify)

After the existing `fetchRequests(...)` in `poll()`, call
`requestStore.updateFromSeerr(results)` once. Reuses already-fetched data — no extra
HTTP call. Skip during the seed phase (same as existing DM-suppression logic).

### `requestButton.js` + `randomRequestButton.js` (modify)

Capture the `sendRequest` return value, read `id`, call `requestStore.add(...)`. Keep
the existing `pendingRequests` write untouched. Fallback when no `id` is returned
(older Seerr): use a pseudo-key `tmdbId-mediaType`, stage `Pending`; the poller can
later attach real status by matching `tmdbId` + requester.

### `bot/commands/queue.js` (new)

`reconcile → getByUser → embed`. Ephemeral reply. Empty store → "no open requests"
message. For mapped users the on-demand reconcile uses the `requestedBy` filter
(`fetchSeerrUserRequests`) so it is not subject to the poller's 100-request window;
for unmapped users it reconciles against the global recent fetch.

### `discord/commands.js` (modify)

Register `/queue` in the slash command set.

## `/queue` output (embed)

```
📋 Deine Anfragen

⏳ Wartet auf Freigabe
   • Dune: Part Two (Film)

⬇️ Lädt
   • Shogun (Serie)

🎬 Verfügbar
   • Fallout (Serie)

❌ Abgelehnt
   • Madame Web (Film)
```

Strings go through `utils/botStrings.js` (`t(...)`) with keys added to
`locales/template.json`, `locales/en.json`, `locales/de.json`.

## Stage derivation (single source of truth)

| `seerrStatus` | `mediaStatus` | stage |
|---|---|---|
| 3 | * | ❌ Declined |
| 1 | * | ⏳ Pending |
| 2 | 5 | 🎬 Available |
| 2 | 4 | 🎬 Partially Available |
| 2 | anything else | ⬇️ Processing |

## Errors & limitations (explicit)

- **Poller fetch window:** the poll fetches the 100 most-recent requests. An unmapped
  user whose request is older than that window will see its status freeze. Mapped
  users are unaffected — `/queue` uses the `requestedBy` filter. Documented, not fixed
  in v1.
- **No `id` in `sendRequest` return** (older Seerr): pseudo-key fallback degrades
  gracefully to a `Pending` entry.
- **Requests created directly in the Seerr UI** (not via Questorr) are not in the
  store, so `/queue` does not show them — by design ("your Questorr requests").

## Two overlapping stores — rationale

`requestStore` and `pendingRequests` coexist intentionally. They use different keys
and serve different consumers: `pendingRequests` (`tmdbId-mediaType` → discord IDs) is
the Jellyfin poller's dedup contract; `requestStore` (requestId → lifecycle) is the
status view. Folding status into `pendingRequests` would break the Jellyfin poller's
expectations, so the stores stay separate.

## Assumptions (risk)

The stages depend on Seerr's internal status integers (request 1/2/3, media 4/5). If
Seerr/Jellyseerr changes these, `deriveStage` breaks. Low likelihood, but it is an
assumption, isolated in one function so a change is a one-place fix.

## Tests (vitest)

- `requestStore` unit: `add` / `getByUser` / `updateFromSeerr` / persistence round-trip
  (`save` then `load`) / `prune`.
- `deriveStage` table test: every `status × mediaStatus` combination from the table.
- Discord interaction layer: no test harness — verify `/queue` manually in Discord.

## Files

| File | Change |
|------|--------|
| `utils/requestStore.js` | new — store + persistence + `deriveStage` |
| `bot/commands/queue.js` | new — `/queue` command + embed |
| `bot/seerrStatusPoller.js` | modify — call `updateFromSeerr` after fetch |
| `bot/handlers/requestButton.js` | modify — capture requestId, `requestStore.add` |
| `bot/handlers/randomRequestButton.js` | modify — capture requestId, `requestStore.add` |
| `discord/commands.js` | modify — register `/queue` |
| `locales/template.json`, `en.json`, `de.json` | modify — `/queue` strings |
| `tests/requestStore.test.js` | new — unit + `deriveStage` table tests |
