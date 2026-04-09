# Questorr Feature Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add media-type channel routing, enhanced health checks, an embeddable dashboard widget, and per-user Discord command rate limiting.

**Architecture:** Four independent features that share config infrastructure. Media-type routing extends the existing `resolveChannel()` priority chain. Health endpoint already exists (`/api/health`) and gets enhanced with service connectivity checks. Widget is a new self-contained HTML endpoint that consumes health data. Command rate limiting uses an in-memory Map in the interaction dispatcher.

**Tech Stack:** Node.js ES Modules, Express, Discord.js v14, node-cache, Joi validation

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/config.js` | Modify | Add new config keys (CHANNEL_MOVIES, CHANNEL_SERIES, COMMAND_RATE_LIMIT) |
| `utils/validation.js` | Modify | Add Joi validation for new config keys |
| `seerrWebhook.js` | Modify | Insert media-type routing step in `resolveChannel()` |
| `routes/botRoutes.js` | Modify | Enhance `/api/health` with service connectivity, add `/api/widget/stats` and `/api/widget/embed` |
| `bot/interactions.js` | Modify | Add per-user rate limiting before command dispatch |
| `bot/commandRateLimit.js` | Create | Rate limit tracker (Map-based, configurable window/max) |
| `tests/commandRateLimit.test.js` | Create | Tests for rate limiter |
| `tests/mediaTypeRouting.test.js` | Create | Tests for media-type channel resolution |

---

### Task 1: Media-Type Channel Routing

**Files:**
- Modify: `lib/config.js` (add 2 keys)
- Modify: `utils/validation.js` (add validation)
- Modify: `seerrWebhook.js:170-207` (`resolveChannel()`)
- Create: `tests/mediaTypeRouting.test.js`

- [ ] **Step 1: Add config keys**

In `lib/config.js`, add after `SEERR_ROOT_FOLDER_CHANNELS`:

```javascript
  CHANNEL_MOVIES: "",
  CHANNEL_SERIES: "",
```

- [ ] **Step 2: Add Joi validation**

In `utils/validation.js`, inside the `configSchema` object, add:

```javascript
  CHANNEL_MOVIES: Joi.string().allow("").optional(),
  CHANNEL_SERIES: Joi.string().allow("").optional(),
```

- [ ] **Step 3: Write the failing test**

Create `tests/mediaTypeRouting.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from "vitest";

// We test the logic inline since resolveChannel is not exported.
// Instead, test the media-type routing decision function we'll extract.

import { resolveMediaTypeChannel } from "../seerrWebhook.js";

describe("resolveMediaTypeChannel", () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns CHANNEL_MOVIES for movie type", () => {
    process.env.CHANNEL_MOVIES = "111111111111111111";
    process.env.CHANNEL_SERIES = "222222222222222222";
    expect(resolveMediaTypeChannel("movie")).toBe("111111111111111111");
  });

  it("returns CHANNEL_SERIES for tv type", () => {
    process.env.CHANNEL_MOVIES = "111111111111111111";
    process.env.CHANNEL_SERIES = "222222222222222222";
    expect(resolveMediaTypeChannel("tv")).toBe("222222222222222222");
  });

  it("returns null when no mapping configured", () => {
    delete process.env.CHANNEL_MOVIES;
    delete process.env.CHANNEL_SERIES;
    expect(resolveMediaTypeChannel("movie")).toBeNull();
  });

  it("returns null for movie when only CHANNEL_SERIES set", () => {
    delete process.env.CHANNEL_MOVIES;
    process.env.CHANNEL_SERIES = "222222222222222222";
    expect(resolveMediaTypeChannel("movie")).toBeNull();
  });

  it("returns null for tv when only CHANNEL_MOVIES set", () => {
    process.env.CHANNEL_MOVIES = "111111111111111111";
    delete process.env.CHANNEL_SERIES;
    expect(resolveMediaTypeChannel("tv")).toBeNull();
  });

  it("returns null for unknown media type", () => {
    process.env.CHANNEL_MOVIES = "111111111111111111";
    process.env.CHANNEL_SERIES = "222222222222222222";
    expect(resolveMediaTypeChannel("person")).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests, verify they fail**

Run: `npx vitest run tests/mediaTypeRouting.test.js`
Expected: FAIL — `resolveMediaTypeChannel` is not exported

- [ ] **Step 5: Implement resolveMediaTypeChannel and integrate into resolveChannel**

In `seerrWebhook.js`, add the exported function before `resolveChannel()`:

```javascript
/**
 * Media-type channel routing.
 * Returns the channel ID for movie or tv, or null if not configured.
 */
export function resolveMediaTypeChannel(mediaType) {
  if (mediaType === "movie" && process.env.CHANNEL_MOVIES) {
    return process.env.CHANNEL_MOVIES;
  }
  if (mediaType === "tv" && process.env.CHANNEL_SERIES) {
    return process.env.CHANNEL_SERIES;
  }
  return null;
}
```

Then modify `resolveChannel()` — insert after Jellyfin library mapping (step 2) and before the fallback (step 3):

```javascript
async function resolveChannel(rootFolder, tmdbId, mediaType) {
  // 1. Root-folder mapping
  // ... existing code ...

  // 2. Jellyfin library mapping via TMDB ID
  // ... existing code ...

  // 3. Media-type routing (movie → CHANNEL_MOVIES, tv → CHANNEL_SERIES)
  if (mediaType) {
    const mediaTypeChannel = resolveMediaTypeChannel(mediaType);
    if (mediaTypeChannel) {
      logger.info(`[SEERR WEBHOOK] ✅ Media type "${mediaType}" → channel ${mediaTypeChannel}`);
      return mediaTypeChannel;
    }
  }

  // 4 & 5. Fallbacks
  const fallback = process.env.SEERR_CHANNEL_ID || process.env.JELLYFIN_CHANNEL_ID;
  if (fallback) logger.debug(`[SEERR WEBHOOK] Using fallback channel: ${fallback}`);
  return fallback || null;
}
```

Update the file header comment to reflect new priority:

```
 * Channel routing priority:
 *   1. Root-folder → channel mapping  (SEERR_ROOT_FOLDER_CHANNELS)
 *   2. Jellyfin library → channel mapping (JELLYFIN_NOTIFICATION_LIBRARIES)
 *   3. Media-type → channel mapping (CHANNEL_MOVIES / CHANNEL_SERIES)
 *   4. SEERR_CHANNEL_ID
 *   5. JELLYFIN_CHANNEL_ID
```

- [ ] **Step 6: Run tests, verify they pass**

Run: `npx vitest run tests/mediaTypeRouting.test.js`
Expected: 6 tests PASS

- [ ] **Step 7: Syntax check**

Run: `node --check seerrWebhook.js && node --check lib/config.js && node --check utils/validation.js`

- [ ] **Step 8: Commit**

```bash
git add lib/config.js utils/validation.js seerrWebhook.js tests/mediaTypeRouting.test.js
git commit -m "feat: media-type channel routing (CHANNEL_MOVIES / CHANNEL_SERIES)

- Route movie notifications to CHANNEL_MOVIES, series to CHANNEL_SERIES
- Inserts as priority 3 in routing chain (after root folder + library mapping)
- Falls back to SEERR_CHANNEL_ID if not configured"
```

---

### Task 2: Enhance Health-Check Endpoint

**Files:**
- Modify: `routes/botRoutes.js:22-53` (enhance `/api/health`)

The existing `/api/health` endpoint already returns bot status, cache stats, memory, and uptime. We enhance it with external service connectivity checks and pending request count.

- [ ] **Step 1: Add service connectivity and pending requests to /api/health**

In `routes/botRoutes.js`, add import at top:

```javascript
import { pendingRequests } from "../bot/botState.js";
import axios from "axios";
```

Replace the existing `router.get("/health", ...)` handler:

```javascript
router.get("/health", async (req, res) => {
  const uptime = process.uptime();
  const cacheStats = cache.getStats();
  const totalHits = cacheStats.tmdb.hits + cacheStats.seerr.hits;
  const totalMisses = cacheStats.tmdb.misses + cacheStats.seerr.misses;
  const totalKeys = cacheStats.tmdb.keys + cacheStats.seerr.keys;

  // Service connectivity checks (parallel, with 3s timeout)
  const services = {};
  const checks = [];

  if (process.env.SEERR_URL && process.env.SEERR_API_KEY) {
    checks.push(
      axios.get(`${process.env.SEERR_URL}/api/v1/status`, {
        headers: { "X-Api-Key": process.env.SEERR_API_KEY },
        timeout: 3000,
      }).then(() => { services.seerr = "reachable"; })
        .catch(() => { services.seerr = "unreachable"; })
    );
  } else {
    services.seerr = "not_configured";
  }

  if (process.env.JELLYFIN_BASE_URL && process.env.JELLYFIN_API_KEY) {
    checks.push(
      axios.get(`${process.env.JELLYFIN_BASE_URL}/System/Info`, {
        headers: { "X-Emby-Token": process.env.JELLYFIN_API_KEY },
        timeout: 3000,
      }).then(() => { services.jellyfin = "reachable"; })
        .catch(() => { services.jellyfin = "unreachable"; })
    );
  } else {
    services.jellyfin = "not_configured";
  }

  if (process.env.TMDB_API_KEY) {
    checks.push(
      axios.get("https://api.themoviedb.org/3/configuration", {
        params: { api_key: process.env.TMDB_API_KEY },
        timeout: 3000,
      }).then(() => { services.tmdb = "reachable"; })
        .catch(() => { services.tmdb = "unreachable"; })
    );
  } else {
    services.tmdb = "not_configured";
  }

  await Promise.allSettled(checks);

  const allReachable = Object.values(services).every(s => s !== "unreachable");

  res.json({
    status: allReachable ? "healthy" : "degraded",
    version: APP_VERSION,
    uptime: Math.floor(uptime),
    uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
    bot: {
      running: botState.isBotRunning,
      username: botState.isBotRunning && botState.discordClient?.user ? botState.discordClient.user.tag : null,
      connected: botState.discordClient?.ws?.status === 0,
    },
    services,
    pendingRequests: pendingRequests.size,
    cache: {
      hits: totalHits,
      misses: totalMisses,
      keys: totalKeys,
      hitRate: totalHits + totalMisses > 0 ? ((totalHits / (totalHits + totalMisses)) * 100).toFixed(2) + "%" : "0%",
      tmdb: cacheStats.tmdb,
      seerr: cacheStats.seerr,
    },
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + " MB",
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + " MB",
    },
    timestamp: new Date().toISOString(),
  });
});
```

- [ ] **Step 2: Syntax check**

Run: `node --check routes/botRoutes.js`

- [ ] **Step 3: Commit**

```bash
git add routes/botRoutes.js
git commit -m "feat: enhance /api/health with service connectivity and pending requests

- Parallel connectivity checks for Seerr, Jellyfin, TMDB (3s timeout each)
- Status 'healthy' or 'degraded' based on service reachability
- Add pendingRequests count to response"
```

---

### Task 3: Widget API + HTML Widget

**Files:**
- Modify: `routes/botRoutes.js` (add `/api/widget/stats` and `/api/widget/embed`)

- [ ] **Step 1: Add /api/widget/stats endpoint**

In `routes/botRoutes.js`, add after the `/health` handler:

```javascript
router.get("/widget/stats", async (req, res) => {
  const uptime = process.uptime();
  const cacheStats = cache.getStats();

  res.json({
    status: botState.isBotRunning ? "online" : "offline",
    botUsername: botState.isBotRunning && botState.discordClient?.user ? botState.discordClient.user.tag : null,
    uptime: Math.floor(uptime),
    uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
    pendingRequests: pendingRequests.size,
    cacheKeys: cacheStats.tmdb.keys + cacheStats.seerr.keys,
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
  });
});
```

- [ ] **Step 2: Add /api/widget/embed endpoint**

In `routes/botRoutes.js`, add the self-contained HTML widget:

```javascript
router.get("/widget/embed", (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const theme = req.query.theme === "light" ? "light" : "dark";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Questorr Widget</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: ${theme === "dark" ? "#1a1a2e" : "#f5f5f5"};
    color: ${theme === "dark" ? "#e0e0e0" : "#333"};
    padding: 12px;
  }
  .widget {
    background: ${theme === "dark" ? "#16213e" : "#fff"};
    border-radius: 12px;
    padding: 16px;
    border: 1px solid ${theme === "dark" ? "#0f3460" : "#ddd"};
    max-width: 320px;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .header h2 {
    font-size: 16px;
    font-weight: 600;
    color: ${theme === "dark" ? "#1ec8a0" : "#0d7a5f"};
  }
  .status-dot {
    width: 10px; height: 10px;
    border-radius: 50%;
    display: inline-block;
  }
  .status-dot.online { background: #2ecc71; box-shadow: 0 0 6px #2ecc71; }
  .status-dot.offline { background: #e74c3c; box-shadow: 0 0 6px #e74c3c; }
  .stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 12px;
  }
  .stat {
    background: ${theme === "dark" ? "#1a1a2e" : "#f0f0f0"};
    border-radius: 8px;
    padding: 8px 10px;
    text-align: center;
  }
  .stat .value {
    font-size: 18px;
    font-weight: 700;
    color: ${theme === "dark" ? "#1ec8a0" : "#0d7a5f"};
  }
  .stat .label {
    font-size: 11px;
    opacity: 0.7;
    margin-top: 2px;
  }
  .controls {
    display: flex;
    gap: 8px;
  }
  .controls button {
    flex: 1;
    padding: 8px;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
  }
  .controls button:hover { opacity: 0.85; }
  .controls button:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-start { background: #2ecc71; color: #fff; }
  .btn-stop { background: #e74c3c; color: #fff; }
  .bot-name {
    font-size: 12px;
    opacity: 0.6;
    margin-bottom: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .error { color: #e74c3c; font-size: 12px; margin-top: 8px; }
</style>
</head>
<body>
<div class="widget" id="w">
  <div class="header">
    <h2>Questorr</h2>
    <span class="status-dot offline" id="dot"></span>
  </div>
  <div class="bot-name" id="botName">Loading...</div>
  <div class="stats">
    <div class="stat"><div class="value" id="uptime">--</div><div class="label">Uptime</div></div>
    <div class="stat"><div class="value" id="pending">--</div><div class="label">Pending</div></div>
    <div class="stat"><div class="value" id="memory">--</div><div class="label">RAM (MB)</div></div>
    <div class="stat"><div class="value" id="cache">--</div><div class="label">Cache Keys</div></div>
  </div>
  <div class="controls">
    <button class="btn-start" id="startBtn" onclick="ctrl('start')" disabled>Start</button>
    <button class="btn-stop" id="stopBtn" onclick="ctrl('stop')" disabled>Stop</button>
  </div>
  <div class="error" id="err"></div>
</div>
<script>
const API = "${baseUrl}/api";
async function refresh() {
  try {
    const r = await fetch(API + "/widget/stats");
    const d = await r.json();
    document.getElementById("dot").className = "status-dot " + d.status;
    document.getElementById("botName").textContent = d.botUsername || "Bot offline";
    document.getElementById("uptime").textContent = d.uptimeFormatted;
    document.getElementById("pending").textContent = d.pendingRequests;
    document.getElementById("memory").textContent = d.memoryMB;
    document.getElementById("cache").textContent = d.cacheKeys;
    document.getElementById("startBtn").disabled = d.status === "online";
    document.getElementById("stopBtn").disabled = d.status === "offline";
    document.getElementById("err").textContent = "";
  } catch (e) {
    document.getElementById("err").textContent = "Connection failed";
  }
}
async function ctrl(action) {
  try {
    document.getElementById("err").textContent = "";
    const r = await fetch(API + "/" + action + "-bot", { method: "POST", credentials: "include" });
    const d = await r.json();
    if (!r.ok) document.getElementById("err").textContent = d.message || d.error;
    setTimeout(refresh, 1000);
  } catch (e) {
    document.getElementById("err").textContent = "Action failed: " + e.message;
  }
}
refresh();
setInterval(refresh, 15000);
</script>
</body>
</html>`;

  res.type("html").send(html);
});
```

- [ ] **Step 3: Syntax check**

Run: `node --check routes/botRoutes.js`

- [ ] **Step 4: Commit**

```bash
git add routes/botRoutes.js
git commit -m "feat: widget API and embeddable HTML widget

- GET /api/widget/stats — lightweight JSON stats for dashboards
- GET /api/widget/embed — self-contained HTML widget (dark/light theme)
- Auto-refreshes every 15s, start/stop controls, no external dependencies"
```

---

### Task 4: Per-User Discord Command Rate Limiting

**Files:**
- Create: `bot/commandRateLimit.js`
- Create: `tests/commandRateLimit.test.js`
- Modify: `lib/config.js` (add COMMAND_RATE_LIMIT)
- Modify: `utils/validation.js` (add validation)
- Modify: `bot/interactions.js` (integrate rate limiter)
- Modify: `utils/botStrings.js` (add i18n key)

- [ ] **Step 1: Add config key**

In `lib/config.js`, add:

```javascript
  COMMAND_RATE_LIMIT: "10",
```

In `utils/validation.js`, add to `configSchema`:

```javascript
  COMMAND_RATE_LIMIT: Joi.alternatives().try(
    Joi.number().integer().min(1).max(100),
    Joi.string().pattern(/^\d+$/).allow("")
  ).optional(),
```

- [ ] **Step 2: Write the failing test**

Create `tests/commandRateLimit.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkCommandRateLimit, _resetForTest } from "../bot/commandRateLimit.js";

describe("checkCommandRateLimit", () => {
  beforeEach(() => {
    _resetForTest();
  });

  it("allows first command from a user", () => {
    expect(checkCommandRateLimit("user1", 5)).toBe(true);
  });

  it("allows commands up to the limit", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkCommandRateLimit("user1", 5)).toBe(true);
    }
  });

  it("blocks commands beyond the limit", () => {
    for (let i = 0; i < 5; i++) {
      checkCommandRateLimit("user1", 5);
    }
    expect(checkCommandRateLimit("user1", 5)).toBe(false);
  });

  it("tracks users independently", () => {
    for (let i = 0; i < 5; i++) {
      checkCommandRateLimit("user1", 5);
    }
    expect(checkCommandRateLimit("user1", 5)).toBe(false);
    expect(checkCommandRateLimit("user2", 5)).toBe(true);
  });

  it("resets after window expires", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) {
      checkCommandRateLimit("user1", 5);
    }
    expect(checkCommandRateLimit("user1", 5)).toBe(false);

    vi.advanceTimersByTime(61000); // 61 seconds
    expect(checkCommandRateLimit("user1", 5)).toBe(true);
    vi.useRealTimers();
  });

  it("returns true when limit is 0 (disabled)", () => {
    expect(checkCommandRateLimit("user1", 0)).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `npx vitest run tests/commandRateLimit.test.js`
Expected: FAIL — module not found

- [ ] **Step 4: Implement the rate limiter**

Create `bot/commandRateLimit.js`:

```javascript
/**
 * Per-user Discord command rate limiter.
 * Uses a Map with 60-second sliding windows.
 */

const WINDOW_MS = 60_000;
const userWindows = new Map();

/**
 * Check if a user is within their rate limit.
 * @param {string} userId - Discord user ID
 * @param {number} maxPerMinute - Max commands per minute (0 = disabled)
 * @returns {boolean} true if allowed, false if rate limited
 */
export function checkCommandRateLimit(userId, maxPerMinute) {
  if (!maxPerMinute || maxPerMinute <= 0) return true;

  const now = Date.now();
  let entry = userWindows.get(userId);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    entry = { windowStart: now, count: 0 };
    userWindows.set(userId, entry);
  }

  entry.count++;
  return entry.count <= maxPerMinute;
}

/** Cleanup stale entries every 5 minutes */
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of userWindows) {
    if (now - entry.windowStart >= WINDOW_MS * 2) {
      userWindows.delete(userId);
    }
  }
}, 300_000).unref();

/** Test helper — reset all state */
export function _resetForTest() {
  userWindows.clear();
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npx vitest run tests/commandRateLimit.test.js`
Expected: 6 tests PASS

- [ ] **Step 6: Add i18n key for rate limit message**

In `utils/botStrings.js`, add to `en` dictionary:

```javascript
    rate_limited:         "\u26A0\uFE0F You're using commands too fast. Please wait a moment.",
```

Add to `de` dictionary:

```javascript
    rate_limited:         "\u26A0\uFE0F Du verwendest Befehle zu schnell. Bitte warte einen Moment.",
```

- [ ] **Step 7: Integrate into interactions.js**

In `bot/interactions.js`, add import:

```javascript
import { checkCommandRateLimit } from "./commandRateLimit.js";
import { t } from "../utils/botStrings.js";
```

Note: `t` is already imported. Just add the rate limit import.

Inside `registerInteractions`, add rate limit check right after the role permission check (after line 32), before autocomplete:

```javascript
      // Per-user command rate limiting (skip for autocomplete — those are lightweight)
      if (interaction.isCommand() || interaction.isButton() || interaction.isStringSelectMenu()) {
        const limit = parseInt(process.env.COMMAND_RATE_LIMIT || "10", 10);
        if (!checkCommandRateLimit(interaction.user.id, limit)) {
          if (interaction.isCommand()) {
            return interaction.reply({ content: t("rate_limited"), flags: 64 });
          }
          return; // Silently drop rate-limited button/menu interactions
        }
      }
```

- [ ] **Step 8: Syntax check all files**

Run: `node --check bot/commandRateLimit.js && node --check bot/interactions.js && node --check utils/botStrings.js && node --check lib/config.js && node --check utils/validation.js`

- [ ] **Step 9: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing 68 + new 6 = 74)

- [ ] **Step 10: Commit**

```bash
git add bot/commandRateLimit.js tests/commandRateLimit.test.js bot/interactions.js utils/botStrings.js lib/config.js utils/validation.js
git commit -m "feat: per-user Discord command rate limiting

- Configurable via COMMAND_RATE_LIMIT (default: 10/min, 0 = disabled)
- 60-second sliding window per user
- Applies to slash commands, buttons, select menus (not autocomplete)
- Rate limit message translated (en/de)"
```

---

### Task 5: Final integration test and push

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Syntax check all modified files**

```bash
node --check seerrWebhook.js && \
node --check routes/botRoutes.js && \
node --check bot/interactions.js && \
node --check bot/commandRateLimit.js && \
node --check lib/config.js && \
node --check utils/validation.js && \
node --check utils/botStrings.js
```

- [ ] **Step 3: Push to dev**

```bash
git push origin dev
```
