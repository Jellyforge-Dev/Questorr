import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock logger before importing botUtils
vi.mock("../utils/logger.js", () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  pad2,
  getOptionStringRobust,
  parseQualityAndServerOptions,
  checkRolePermission,
  getSeerrAutoApprove,
} from "../bot/botUtils.js";

describe("pad2", () => {
  it("pads single digit", () => {
    expect(pad2(5)).toBe("05");
  });
  it("leaves double digit unchanged", () => {
    expect(pad2(12)).toBe("12");
  });
  it("handles zero", () => {
    expect(pad2(0)).toBe("00");
  });
});

describe("getOptionStringRobust", () => {
  it("returns first matching option name", () => {
    const interaction = {
      options: {
        getString: vi.fn((name) => (name === "title" ? "Batman" : null)),
        data: [],
      },
    };
    expect(getOptionStringRobust(interaction)).toBe("Batman");
  });

  it("falls through to second name if first is null", () => {
    const interaction = {
      options: {
        getString: vi.fn((name) => (name === "query" ? "Superman" : null)),
        data: [],
      },
    };
    expect(getOptionStringRobust(interaction)).toBe("Superman");
  });

  it("falls back to options.data if getString fails", () => {
    const interaction = {
      options: {
        getString: vi.fn(() => { throw new Error("nope"); }),
        data: [{ value: "fallback-value" }],
      },
    };
    expect(getOptionStringRobust(interaction)).toBe("fallback-value");
  });

  it("returns null when nothing matches", () => {
    const interaction = {
      options: {
        getString: vi.fn(() => null),
        data: [],
      },
    };
    expect(getOptionStringRobust(interaction)).toBeNull();
  });

  it("ignores empty strings", () => {
    const interaction = {
      options: {
        getString: vi.fn(() => ""),
        data: [],
      },
    };
    expect(getOptionStringRobust(interaction)).toBeNull();
  });
});

describe("parseQualityAndServerOptions", () => {
  beforeEach(() => {
    delete process.env.DEFAULT_QUALITY_PROFILE_MOVIE;
    delete process.env.DEFAULT_QUALITY_PROFILE_TV;
    delete process.env.DEFAULT_SERVER_MOVIE;
    delete process.env.DEFAULT_SERVER_TV;
  });

  it("parses quality option for matching media type", () => {
    const result = parseQualityAndServerOptions(
      { quality: "7|3|radarr" },
      "movie"
    );
    expect(result.profileId).toBe(7);
    expect(result.serverId).toBe(3);
  });

  it("ignores quality option for wrong media type", () => {
    const result = parseQualityAndServerOptions(
      { quality: "7|3|sonarr" },
      "movie"
    );
    expect(result.profileId).toBeNull();
    expect(result.serverId).toBeNull();
  });

  it("parses server option when quality not set", () => {
    const result = parseQualityAndServerOptions(
      { server: "5|radarr" },
      "movie"
    );
    expect(result.serverId).toBe(5);
    expect(result.profileId).toBeNull();
  });

  it("quality takes precedence over server for serverId", () => {
    const result = parseQualityAndServerOptions(
      { quality: "7|3|radarr", server: "5|radarr" },
      "movie"
    );
    expect(result.serverId).toBe(3);
  });

  it("uses defaults from env when no options provided", () => {
    process.env.DEFAULT_QUALITY_PROFILE_MOVIE = "10|2";
    const result = parseQualityAndServerOptions({}, "movie");
    expect(result.profileId).toBe(10);
    expect(result.serverId).toBe(2);
  });

  it("uses DEFAULT_SERVER when no quality profile set", () => {
    process.env.DEFAULT_SERVER_TV = "8|sonarr";
    const result = parseQualityAndServerOptions({}, "tv");
    expect(result.serverId).toBe(8);
    expect(result.profileId).toBeNull();
  });

  it("returns nulls when nothing is configured", () => {
    const result = parseQualityAndServerOptions({}, "movie");
    expect(result.profileId).toBeNull();
    expect(result.serverId).toBeNull();
  });

  it("handles non-numeric values gracefully", () => {
    const result = parseQualityAndServerOptions(
      { quality: "abc|def|radarr" },
      "movie"
    );
    expect(result.profileId).toBeNull();
    expect(result.serverId).toBeNull();
  });
});

describe("checkRolePermission", () => {
  beforeEach(() => {
    delete process.env.ROLE_ALLOWLIST;
    delete process.env.ROLE_BLOCKLIST;
  });

  const makeMember = (roleIds) => ({
    roles: {
      cache: roleIds.map((id) => ({ id })),
    },
  });

  it("allows everyone when no lists configured", () => {
    expect(checkRolePermission(makeMember(["123"]))).toBe(true);
  });

  it("allows member with allowed role", () => {
    process.env.ROLE_ALLOWLIST = '["123"]';
    expect(checkRolePermission(makeMember(["123", "456"]))).toBe(true);
  });

  it("blocks member without allowed role", () => {
    process.env.ROLE_ALLOWLIST = '["123"]';
    expect(checkRolePermission(makeMember(["456"]))).toBe(false);
  });

  it("blocks member with blocked role", () => {
    process.env.ROLE_BLOCKLIST = '["789"]';
    expect(checkRolePermission(makeMember(["789"]))).toBe(false);
  });

  it("allows member without blocked role", () => {
    process.env.ROLE_BLOCKLIST = '["789"]';
    expect(checkRolePermission(makeMember(["123"]))).toBe(true);
  });

  it("returns true for null member", () => {
    expect(checkRolePermission(null)).toBe(true);
  });

  it("handles invalid JSON gracefully", () => {
    process.env.ROLE_ALLOWLIST = "not-json";
    expect(checkRolePermission(makeMember(["123"]))).toBe(true);
  });
});

describe("getSeerrAutoApprove", () => {
  afterEach(() => {
    delete process.env.SEERR_AUTO_APPROVE;
  });

  it('returns true when set to "true"', () => {
    process.env.SEERR_AUTO_APPROVE = "true";
    expect(getSeerrAutoApprove()).toBe(true);
  });

  it('returns false when set to "false"', () => {
    process.env.SEERR_AUTO_APPROVE = "false";
    expect(getSeerrAutoApprove()).toBe(false);
  });

  it("returns false when not set", () => {
    expect(getSeerrAutoApprove()).toBe(false);
  });
});
