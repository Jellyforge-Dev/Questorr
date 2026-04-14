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
