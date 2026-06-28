import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { vi } from "vitest";

vi.mock("../api/jellyfin.js", () => ({
  fetchLibraries: vi.fn(async () => []),
  findLibraryByAncestors: vi.fn(async () => null),
  findJellyfinItemByTmdbId: vi.fn(async () => null),
  fetchItemPath: vi.fn(async () => null),
}));
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../utils/configFile.js", () => ({ CONFIG_PATH: "/tmp/questorr-dm-test.json" }));
vi.mock("../utils/botStrings.js", () => ({ t: (k) => k, tNotif: (k) => k }));
vi.mock("../utils/notifyDedup.js", () => ({ markNotified: vi.fn() }));
vi.mock("../utils/notificationDispatcher.js", () => ({ shouldPost: vi.fn(() => ({ post: true })), markPosted: vi.fn() }));
vi.mock("../bot/botState.js", () => ({ pendingRequests: new Map(), savePendingRequests: vi.fn() }));
vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../api/tmdb.js", () => ({ findBestBackdrop: vi.fn(), getTmdbLanguage: vi.fn(() => "en") }));

const { findDiscordIdForSeerrUser } = await import("../seerrWebhook.js");

const VALID = "123456789012345678"; // 18-digit snowflake
const MAPPINGS = JSON.stringify([
  { discordUserId: "987654321098765432", seerrDisplayName: "Alex", seerrUserId: 4 },
]);

beforeEach(() => { delete process.env.USER_MAPPINGS; });
afterEach(() => { delete process.env.USER_MAPPINGS; });

describe("findDiscordIdForSeerrUser", () => {
  it("returns the payload discordId when it is a real snowflake", async () => {
    const id = await findDiscordIdForSeerrUser({ request: { requestedBy_settings_discordId: VALID } });
    expect(id).toBe(VALID);
  });

  it("ignores an unrendered placeholder and falls back to USER_MAPPINGS", async () => {
    process.env.USER_MAPPINGS = MAPPINGS;
    const id = await findDiscordIdForSeerrUser({
      request: {
        requestedBy_settings_discordId: "{{requestedBy_settings_discordId}}",
        requestedBy_username: "Alex",
      },
    });
    expect(id).toBe("987654321098765432");
  });

  it("matches the mapping case-insensitively", async () => {
    process.env.USER_MAPPINGS = MAPPINGS;
    const id = await findDiscordIdForSeerrUser({
      request: { requestedBy_settings_discordId: "{{requestedBy_settings_discordId}}", requestedBy_username: "  alex " },
    });
    expect(id).toBe("987654321098765432");
  });

  it("returns null for a placeholder with no matching mapping", async () => {
    process.env.USER_MAPPINGS = MAPPINGS;
    const id = await findDiscordIdForSeerrUser({
      request: { requestedBy_settings_discordId: "{{requestedBy_settings_discordId}}", requestedBy_username: "Nobody" },
    });
    expect(id).toBe(null);
  });

  it("returns null when no mappings and no usable payload id", async () => {
    const id = await findDiscordIdForSeerrUser({ request: { requestedBy_username: "Alex" } });
    expect(id).toBe(null);
  });
});
