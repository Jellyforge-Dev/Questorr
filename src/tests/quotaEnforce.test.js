import { describe, it, expect, vi, beforeEach } from "vitest";

const getByUser = vi.fn();
vi.mock("../utils/requestStore.js", () => ({ getByUser }));
vi.mock("../utils/botStrings.js", () => ({ t: () => "{{used}}/{{limit}} reset {{reset}}" }));
vi.mock("../utils/logger.js", () => ({ default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { getQuotaDenial } = await import("../bot/botUtils.js");

const ago = (days) => new Date(Date.now() - days * 86400_000).toISOString();
const interaction = (roleIds = []) => ({
  user: { id: "u1" },
  member: { roles: { cache: roleIds.map((id) => ({ id })) } },
});

const ENV = ["QUOTA_WEEKLY_LIMIT", "QUOTA_BYPASS_ROLES", "QUOTA_UNLIMITED_USERS"];
beforeEach(() => {
  vi.clearAllMocks();
  ENV.forEach((k) => delete process.env[k]);
});

describe("getQuotaDenial", () => {
  it("returns null (and skips the store) when the quota is disabled", () => {
    expect(getQuotaDenial(interaction())).toBeNull();
    expect(getByUser).not.toHaveBeenCalled();
  });

  it("returns null when under the limit", () => {
    process.env.QUOTA_WEEKLY_LIMIT = "3";
    getByUser.mockReturnValue([{ requestedAt: ago(1) }]);
    expect(getQuotaDenial(interaction())).toBeNull();
  });

  it("returns a denial message at the limit, with used/limit filled in", () => {
    process.env.QUOTA_WEEKLY_LIMIT = "2";
    getByUser.mockReturnValue([{ requestedAt: ago(1) }, { requestedAt: ago(2) }]);
    const msg = getQuotaDenial(interaction());
    expect(msg).toContain("2/2");
    expect(msg).toMatch(/reset \d+[dh]/);
  });

  it("returns null for an unlimited user even at the limit", () => {
    process.env.QUOTA_WEEKLY_LIMIT = "1";
    process.env.QUOTA_UNLIMITED_USERS = '["u1"]';
    getByUser.mockReturnValue([{ requestedAt: ago(1) }, { requestedAt: ago(1) }]);
    expect(getQuotaDenial(interaction())).toBeNull();
  });

  it("returns null when the user holds a bypass role", () => {
    process.env.QUOTA_WEEKLY_LIMIT = "1";
    process.env.QUOTA_BYPASS_ROLES = '["admin-role"]';
    getByUser.mockReturnValue([{ requestedAt: ago(1) }, { requestedAt: ago(1) }]);
    expect(getQuotaDenial(interaction(["admin-role"]))).toBeNull();
  });
});
