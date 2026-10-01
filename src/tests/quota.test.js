import { describe, it, expect } from "vitest";
import { countRecentRequests, checkQuota, resolveQuotaConfigFromEnv, WINDOW_MS } from "../utils/quota.js";

describe("resolveQuotaConfigFromEnv", () => {
  it("parses limit + JSON arrays from env", () => {
    const env = { QUOTA_WEEKLY_LIMIT: "5", QUOTA_BYPASS_ROLES: '["r1","r2"]', QUOTA_UNLIMITED_USERS: '["u1"]' };
    expect(resolveQuotaConfigFromEnv(env)).toEqual({ limit: 5, bypassRoles: ["r1", "r2"], unlimitedUsers: ["u1"] });
  });

  it("defaults to disabled with empty arrays when unset / malformed", () => {
    expect(resolveQuotaConfigFromEnv({})).toEqual({ limit: 0, bypassRoles: [], unlimitedUsers: [] });
    expect(resolveQuotaConfigFromEnv({ QUOTA_WEEKLY_LIMIT: "abc", QUOTA_BYPASS_ROLES: "{bad" }))
      .toEqual({ limit: 0, bypassRoles: [], unlimitedUsers: [] });
  });
});

const ago = (now, days) => new Date(now - days * 86400_000).toISOString();

describe("countRecentRequests", () => {
  const now = Date.now();
  it("counts only records within the rolling 7-day window", () => {
    const records = [
      { requestedAt: ago(now, 1) },
      { requestedAt: ago(now, 6) },
      { requestedAt: ago(now, 8) }, // outside
      { requestedAt: ago(now, 30) }, // outside
    ];
    expect(countRecentRequests(records, now)).toBe(2);
  });

  it("returns 0 for empty / missing timestamps", () => {
    expect(countRecentRequests([], now)).toBe(0);
    expect(countRecentRequests([{ requestedAt: null }], now)).toBe(0);
  });
});

describe("checkQuota", () => {
  const now = Date.now();
  const cfg = (over = {}) => ({ limit: 3, bypassRoles: [], unlimitedUsers: [], ...over });
  const recs = (n) => Array.from({ length: n }, () => ({ requestedAt: ago(now, 1) }));

  it("allows everything when the limit is 0 (disabled)", () => {
    const r = checkQuota({ discordUserId: "u1", memberRoleIds: [], config: cfg({ limit: 0 }), records: recs(99), now });
    expect(r).toMatchObject({ allowed: true, reason: "disabled" });
  });

  it("allows a user listed in unlimitedUsers", () => {
    const r = checkQuota({ discordUserId: "u1", memberRoleIds: [], config: cfg({ unlimitedUsers: ["u1"] }), records: recs(99), now });
    expect(r).toMatchObject({ allowed: true, reason: "unlimited-user" });
  });

  it("allows a user holding a bypass role", () => {
    const r = checkQuota({ discordUserId: "u1", memberRoleIds: ["r9"], config: cfg({ bypassRoles: ["r9"] }), records: recs(99), now });
    expect(r).toMatchObject({ allowed: true, reason: "bypass-role" });
  });

  it("allows when under the limit and reports usage", () => {
    const r = checkQuota({ discordUserId: "u1", memberRoleIds: [], config: cfg(), records: recs(2), now });
    expect(r).toMatchObject({ allowed: true, used: 2, limit: 3 });
  });

  it("blocks at the limit and returns a resetAt (oldest in-window + 7d)", () => {
    const records = [
      { requestedAt: ago(now, 5) }, // oldest in window
      { requestedAt: ago(now, 2) },
      { requestedAt: ago(now, 1) },
    ];
    const r = checkQuota({ discordUserId: "u1", memberRoleIds: [], config: cfg(), records, now });
    expect(r.allowed).toBe(false);
    expect(r.used).toBe(3);
    expect(r.limit).toBe(3);
    const expectedReset = new Date(now - 5 * 86400_000).getTime() + WINDOW_MS;
    expect(new Date(r.resetAt).getTime()).toBe(expectedReset);
  });

  it("ignores out-of-window records when counting toward the limit", () => {
    const records = [
      { requestedAt: ago(now, 1) },
      { requestedAt: ago(now, 10) }, // outside → doesn't count
      { requestedAt: ago(now, 20) }, // outside
    ];
    const r = checkQuota({ discordUserId: "u1", memberRoleIds: [], config: cfg(), records, now });
    expect(r).toMatchObject({ allowed: true, used: 1 });
  });
});
