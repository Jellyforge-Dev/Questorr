import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Real botStrings on purpose — we are testing live BOT_LANGUAGE + override resolution.
vi.mock("../api/jellyfin.js", () => ({
  fetchLibraries: vi.fn(async () => []),
  findLibraryByAncestors: vi.fn(async () => null),
  findJellyfinItemByTmdbId: vi.fn(async () => null),
  fetchItemPath: vi.fn(async () => null),
}));
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../utils/configFile.js", () => ({ CONFIG_PATH: "/tmp/questorr-eventlabel-test.json" }));
vi.mock("../utils/notifyDedup.js", () => ({ markNotified: vi.fn() }));
vi.mock("../utils/notificationDispatcher.js", () => ({ shouldPost: vi.fn(() => ({ post: true })), markPosted: vi.fn() }));
vi.mock("../bot/botState.js", () => ({ pendingRequests: new Map(), savePendingRequests: vi.fn() }));
vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../api/tmdb.js", () => ({ findBestBackdrop: vi.fn(), getTmdbLanguage: vi.fn(() => "en") }));

const { getEventLabel } = await import("../seerrWebhook.js");

beforeEach(() => {
  delete process.env.NOTIF_TITLE_MEDIA_AVAILABLE;
  delete process.env.BOT_LANGUAGE;
});
afterEach(() => {
  delete process.env.NOTIF_TITLE_MEDIA_AVAILABLE;
  delete process.env.BOT_LANGUAGE;
});

describe("getEventLabel resolves the channel title live", () => {
  it("uses the current BOT_LANGUAGE (de) at call time, not import time", () => {
    process.env.BOT_LANGUAGE = "de";
    expect(getEventLabel("MEDIA_AVAILABLE")).toBe("Jetzt verfügbar!");
  });

  it("uses English when BOT_LANGUAGE is en", () => {
    process.env.BOT_LANGUAGE = "en";
    expect(getEventLabel("MEDIA_AVAILABLE")).toBe("Now Available!");
  });

  it("honours a live NOTIF_TITLE override without a restart", () => {
    process.env.BOT_LANGUAGE = "de";
    process.env.NOTIF_TITLE_MEDIA_AVAILABLE = "Verfügbar, viel Spaß beim schauen. 🎬";
    expect(getEventLabel("MEDIA_AVAILABLE")).toBe("Verfügbar, viel Spaß beim schauen. 🎬");
  });

  it("reflects a language switch between calls (proves it is not frozen)", () => {
    process.env.BOT_LANGUAGE = "en";
    const first = getEventLabel("MEDIA_AVAILABLE");
    process.env.BOT_LANGUAGE = "de";
    const second = getEventLabel("MEDIA_AVAILABLE");
    expect(first).toBe("Now Available!");
    expect(second).toBe("Jetzt verfügbar!");
  });
});
