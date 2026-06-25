import { describe, it, expect, vi, beforeEach } from "vitest";

// Jellyfin lookups (Tier 2) resolve to "no match" so resolveChannel falls
// through to the lower tiers — keeps these tests free of real I/O.
vi.mock("../api/jellyfin.js", () => ({
  fetchLibraries: vi.fn(async () => []),
  findLibraryByAncestors: vi.fn(async () => null),
  findJellyfinItemByTmdbId: vi.fn(async () => null),
  fetchItemPath: vi.fn(async () => null),
}));
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../utils/configFile.js", () => ({ CONFIG_PATH: "/tmp/questorr-routing-test.json" }));
vi.mock("../utils/botStrings.js", () => ({ t: (k) => k, tNotif: (k) => k }));
vi.mock("../utils/notifyDedup.js", () => ({ markNotified: vi.fn() }));
vi.mock("../utils/notificationDispatcher.js", () => ({ shouldPost: vi.fn(() => ({ post: true })), markPosted: vi.fn() }));
vi.mock("../bot/botState.js", () => ({ pendingRequests: new Map(), savePendingRequests: vi.fn() }));
vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../api/tmdb.js", () => ({ findBestBackdrop: vi.fn(), getTmdbLanguage: vi.fn(() => "en") }));

const { matchRootFolderToChannel, resolveMediaTypeChannel, resolveChannel } =
  await import("../seerrWebhook.js");

const ENV_KEYS = ["SEERR_ROOT_FOLDER_CHANNELS", "CHANNEL_MOVIES", "CHANNEL_SERIES", "SEERR_CHANNEL_ID", "JELLYFIN_CHANNEL_ID"];
beforeEach(() => {
  vi.clearAllMocks();
  ENV_KEYS.forEach((k) => delete process.env[k]);
});

describe("Tier 1 — matchRootFolderToChannel", () => {
  it("matches an exact root folder", () => {
    process.env.SEERR_ROOT_FOLDER_CHANNELS = JSON.stringify({ "/movies": "chan-movies" });
    expect(matchRootFolderToChannel("/movies")).toBe("chan-movies");
  });

  it("matches a sub-path by prefix", () => {
    process.env.SEERR_ROOT_FOLDER_CHANNELS = JSON.stringify({ "/data/kids": "chan-kids" });
    expect(matchRootFolderToChannel("/data/kids/Lion King (1994)")).toBe("chan-kids");
  });

  it("normalizes backslashes and trailing slashes", () => {
    process.env.SEERR_ROOT_FOLDER_CHANNELS = JSON.stringify({ "C:/Media/Filme": "chan-film" });
    expect(matchRootFolderToChannel("C:\\Media\\Filme\\")).toBe("chan-film");
  });

  it("is case-insensitive", () => {
    process.env.SEERR_ROOT_FOLDER_CHANNELS = JSON.stringify({ "/Movies": "chan-m" });
    expect(matchRootFolderToChannel("/movies")).toBe("chan-m");
  });

  it("does not match a non-prefix similar path", () => {
    process.env.SEERR_ROOT_FOLDER_CHANNELS = JSON.stringify({ "/movies": "chan-m" });
    expect(matchRootFolderToChannel("/movies-4k/Dune")).toBeNull(); // not "/movies/..."
  });

  it("returns null for no mapping / empty / null input", () => {
    expect(matchRootFolderToChannel("/movies")).toBeNull(); // env unset
    expect(matchRootFolderToChannel(null)).toBeNull();
  });

  it("returns null on malformed JSON without throwing", () => {
    process.env.SEERR_ROOT_FOLDER_CHANNELS = "{ not json";
    expect(matchRootFolderToChannel("/movies")).toBeNull();
  });
});

describe("Tier 3 — resolveMediaTypeChannel", () => {
  it("routes movies to CHANNEL_MOVIES", () => {
    process.env.CHANNEL_MOVIES = "chan-movies";
    expect(resolveMediaTypeChannel("movie")).toBe("chan-movies");
  });
  it("routes tv to CHANNEL_SERIES", () => {
    process.env.CHANNEL_SERIES = "chan-series";
    expect(resolveMediaTypeChannel("tv")).toBe("chan-series");
  });
  it("returns null when the matching channel env is unset", () => {
    expect(resolveMediaTypeChannel("movie")).toBeNull();
    expect(resolveMediaTypeChannel("tv")).toBeNull();
  });
});

describe("resolveChannel — tier priority", () => {
  it("Tier 1 wins: root folder mapping takes precedence over everything", async () => {
    process.env.SEERR_ROOT_FOLDER_CHANNELS = JSON.stringify({ "/movies": "chan-root" });
    process.env.CHANNEL_MOVIES = "chan-mediatype";
    process.env.SEERR_CHANNEL_ID = "chan-fallback";
    expect(await resolveChannel("/movies/Dune", 123, "movie")).toBe("chan-root");
  });

  it("falls through to Tier 3 (media-type) when root folder + Jellyfin miss", async () => {
    process.env.CHANNEL_MOVIES = "chan-mediatype";
    process.env.SEERR_CHANNEL_ID = "chan-fallback";
    expect(await resolveChannel(null, 123, "movie")).toBe("chan-mediatype");
  });

  it("falls through to the fallback channel when nothing else matches", async () => {
    process.env.SEERR_CHANNEL_ID = "chan-fallback";
    expect(await resolveChannel(null, 123, "movie")).toBe("chan-fallback");
  });

  it("prefers SEERR_CHANNEL_ID over JELLYFIN_CHANNEL_ID for the fallback", async () => {
    process.env.SEERR_CHANNEL_ID = "chan-seerr";
    process.env.JELLYFIN_CHANNEL_ID = "chan-jf";
    expect(await resolveChannel(null, 123, "movie")).toBe("chan-seerr");
  });

  it("returns null when no tier resolves and no fallback is configured", async () => {
    expect(await resolveChannel(null, 123, "movie")).toBeNull();
  });
});
