/**
 * Per-user request quota — a rolling 7-day window over the user's Questorr
 * request records. Pure/testable: the caller supplies the user's records, the
 * resolved config, and `now`; this module makes no I/O.
 *
 * Quota counts only requests the bot tracks (requestStore) — direct Seerr-UI
 * requests are outside the bot's control and not counted.
 */

export const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Resolve the quota config from the runtime env. Arrays are stored as JSON. */
export function resolveQuotaConfigFromEnv(env = process.env) {
  const parseArr = (raw) => {
    try {
      const v = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  };
  return {
    limit: parseInt(env.QUOTA_WEEKLY_LIMIT || "0", 10) || 0,
    bypassRoles: parseArr(env.QUOTA_BYPASS_ROLES),
    unlimitedUsers: parseArr(env.QUOTA_UNLIMITED_USERS),
  };
}

/** Count records whose requestedAt falls within the rolling window ending at `now`. */
export function countRecentRequests(records, now, windowMs = WINDOW_MS) {
  if (!Array.isArray(records)) return 0;
  const cutoff = now - windowMs;
  return records.filter((r) => {
    const ts = r?.requestedAt ? new Date(r.requestedAt).getTime() : NaN;
    return Number.isFinite(ts) && ts >= cutoff;
  }).length;
}

/**
 * Decide whether a user may make another request.
 *
 * @param {object} args
 * @param {string} args.discordUserId
 * @param {string[]} args.memberRoleIds   Discord role IDs the user holds
 * @param {{limit:number, bypassRoles?:string[], unlimitedUsers?:string[]}} args.config
 * @param {Array<{requestedAt:string}>} args.records  the user's request records
 * @param {number} args.now
 * @returns {{allowed:boolean, reason?:string, used:number, limit:number, resetAt?:string}}
 */
export function checkQuota({ discordUserId, memberRoleIds = [], config, records = [], now }) {
  const limit = Number(config?.limit) || 0;

  if (limit <= 0) return { allowed: true, reason: "disabled", used: 0, limit: 0 };

  const unlimited = (config.unlimitedUsers || []).map(String);
  if (unlimited.includes(String(discordUserId))) {
    return { allowed: true, reason: "unlimited-user", used: 0, limit };
  }

  const bypassRoles = (config.bypassRoles || []).map(String);
  if (memberRoleIds.map(String).some((r) => bypassRoles.includes(r))) {
    return { allowed: true, reason: "bypass-role", used: 0, limit };
  }

  const cutoff = now - WINDOW_MS;
  const inWindow = records
    .map((r) => (r?.requestedAt ? new Date(r.requestedAt).getTime() : NaN))
    .filter((ts) => Number.isFinite(ts) && ts >= cutoff)
    .sort((a, b) => a - b);

  const used = inWindow.length;
  if (used >= limit) {
    const oldest = inWindow[0];
    return { allowed: false, reason: "limit-reached", used, limit, resetAt: new Date(oldest + WINDOW_MS).toISOString() };
  }
  return { allowed: true, reason: "ok", used, limit };
}
