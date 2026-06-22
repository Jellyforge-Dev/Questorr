import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// Isolate persistence into a throwaway tmp dir by pointing CONFIG_PATH there.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "questorr-reqstore-"));
const FAKE_CONFIG_PATH = path.join(TMP_DIR, "config.json");
const STORE_PATH = path.join(TMP_DIR, "request-store.json");

vi.mock("../utils/configFile.js", () => ({
  CONFIG_PATH: FAKE_CONFIG_PATH,
}));

vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const store = await import("../utils/requestStore.js");

beforeEach(() => {
  store.clear();
  if (fs.existsSync(STORE_PATH)) fs.unlinkSync(STORE_PATH);
});

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("requestStore.add / getByUser", () => {
  it("stores a record and returns it for the requesting Discord user", () => {
    store.add({
      requestId: 42,
      tmdbId: 1001,
      mediaType: "movie",
      title: "Dune: Part Two",
      discordUserId: "user-A",
    });

    const records = store.getByUser("user-A");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      requestId: 42,
      tmdbId: 1001,
      mediaType: "movie",
      title: "Dune: Part Two",
      discordUserId: "user-A",
      stage: "Pending",
    });
    expect(records[0].requestedAt).toBeTypeOf("string");
    expect(records[0].updatedAt).toBeTypeOf("string");
  });

  it("returns empty array for a user with no requests", () => {
    expect(store.getByUser("nobody")).toEqual([]);
  });

  it("uses a tmdbId-mediaType pseudo-key when no requestId is returned", () => {
    store.add({
      requestId: null,
      tmdbId: 2002,
      mediaType: "tv",
      title: "Shogun",
      discordUserId: "user-B",
    });

    const records = store.getByUser("user-B");
    expect(records).toHaveLength(1);
    expect(records[0].stage).toBe("Pending");
    expect(records[0].tmdbId).toBe(2002);
  });
});

describe("requestStore.deriveStage", () => {
  const cases = [
    { status: 3, mediaStatus: 1, expected: "Declined" },
    { status: 3, mediaStatus: 5, expected: "Declined" },
    { status: 1, mediaStatus: 1, expected: "Pending" },
    { status: 1, mediaStatus: 5, expected: "Pending" },
    { status: 2, mediaStatus: 5, expected: "Available" },
    { status: 2, mediaStatus: 4, expected: "PartiallyAvailable" },
    { status: 2, mediaStatus: 3, expected: "Processing" },
    { status: 2, mediaStatus: 1, expected: "Processing" },
    { status: 2, mediaStatus: undefined, expected: "Processing" },
    // request.status COMPLETED (5): availability must come from media.status,
    // not fall through to Pending (Jellyseerr flips the request to COMPLETED
    // once the media is fully available).
    { status: 5, mediaStatus: 5, expected: "Available" },
    { status: 5, mediaStatus: 4, expected: "PartiallyAvailable" },
    { status: 5, mediaStatus: 3, expected: "Processing" },
    // request.status FAILED (4): dedicated Failed stage regardless of media.status.
    { status: 4, mediaStatus: 5, expected: "Failed" },
    { status: 4, mediaStatus: 3, expected: "Failed" },
    { status: 4, mediaStatus: 1, expected: "Failed" },
  ];

  for (const { status, mediaStatus, expected } of cases) {
    it(`status=${status} mediaStatus=${mediaStatus} -> ${expected}`, () => {
      expect(store.deriveStage({ status, media: { status: mediaStatus } })).toBe(expected);
    });
  }

  it("handles a request with no media object", () => {
    expect(store.deriveStage({ status: 1 })).toBe("Pending");
  });
});

describe("requestStore.updateFromSeerr", () => {
  it("matches by requestId and updates stage from Seerr statuses", () => {
    store.add({
      requestId: 7,
      tmdbId: 3003,
      mediaType: "tv",
      title: "Fallout",
      discordUserId: "user-C",
    });

    store.updateFromSeerr([
      { id: 7, status: 2, media: { status: 5 } },
      { id: 999, status: 1, media: { status: 1 } }, // unknown -> ignored
    ]);

    const [record] = store.getByUser("user-C");
    expect(record.stage).toBe("Available");
    expect(record.seerrStatus).toBe(2);
    expect(record.mediaStatus).toBe(5);
  });

  it("does not create records for unknown requestIds", () => {
    store.updateFromSeerr([{ id: 12345, status: 2, media: { status: 5 } }]);
    expect(store.getByUser("user-C")).toEqual([]);
  });

  it("keeps an available item Available when the request flips to COMPLETED (status 5)", () => {
    store.add({ requestId: 7, tmdbId: 3003, mediaType: "movie", title: "Dune", discordUserId: "user-E" });

    // Approved + downloading -> Processing
    store.updateFromSeerr([{ id: 7, status: 2, media: { status: 3 } }]);
    expect(store.getByUser("user-E")[0].stage).toBe("Processing");

    // Jellyseerr flips the request to COMPLETED once media is available.
    store.updateFromSeerr([{ id: 7, status: 5, media: { status: 5 } }]);
    expect(store.getByUser("user-E")[0].stage).toBe("Available");
  });
});

describe("requestStore.backfillFromSeerr", () => {
  const seerrReqs = [
    { id: 10, type: "movie", status: 5, createdAt: "2026-01-01T00:00:00.000Z",
      media: { tmdbId: 500, status: 5, title: "Old Movie" } },
    { id: 11, type: "tv", status: 1, media: { tmdbId: 600, status: 1, name: "Old Series" } },
  ];

  it("adds missing requests attributed to the given Discord user with derived stage", async () => {
    const added = await store.backfillFromSeerr(seerrReqs, "user-F");
    expect(added).toBe(2);

    const records = store.getByUser("user-F");
    expect(records).toHaveLength(2);

    const movie = records.find((r) => r.requestId === 10);
    expect(movie).toMatchObject({
      tmdbId: 500,
      mediaType: "movie",
      title: "Old Movie",
      discordUserId: "user-F",
      stage: "Available",
    });
    expect(movie.requestedAt).toBe("2026-01-01T00:00:00.000Z");

    const series = records.find((r) => r.requestId === 11);
    expect(series).toMatchObject({ mediaType: "tv", title: "Old Series", stage: "Pending" });
  });

  it("does not duplicate requests already tracked by requestId", async () => {
    store.add({ requestId: 10, tmdbId: 500, mediaType: "movie", title: "Old Movie", discordUserId: "user-F" });
    const added = await store.backfillFromSeerr(seerrReqs, "user-F");
    expect(added).toBe(1); // only id 11 is new
    expect(store.getByUser("user-F").filter((r) => r.requestId === 10)).toHaveLength(1);
  });

  it("skips requests without a TMDB id", async () => {
    const added = await store.backfillFromSeerr([{ id: 99, status: 1, media: { status: 1 } }], "user-F");
    expect(added).toBe(0);
    expect(store.getByUser("user-F")).toEqual([]);
  });

  it("is a no-op without a discordUserId", async () => {
    expect(await store.backfillFromSeerr(seerrReqs, undefined)).toBe(0);
  });

  it("falls back to the title resolver when media has no title/name", async () => {
    const noTitle = [
      { id: 20, type: "movie", status: 2, media: { tmdbId: 131033, status: 3 } },
      { id: 21, type: "tv", status: 2, media: { tmdbId: 700, status: 3, title: "Has Title" } },
    ];
    const resolveTitle = vi.fn(async (tmdbId) => (tmdbId === 131033 ? "Resolved Movie" : "should-not-be-used"));

    const added = await store.backfillFromSeerr(noTitle, "user-G", resolveTitle);
    expect(added).toBe(2);

    // Resolver invoked only for the entry lacking a title, with (tmdbId, mediaType).
    expect(resolveTitle).toHaveBeenCalledTimes(1);
    expect(resolveTitle).toHaveBeenCalledWith(131033, "movie");

    const records = store.getByUser("user-G");
    expect(records.find((r) => r.requestId === 20).title).toBe("Resolved Movie");
    expect(records.find((r) => r.requestId === 21).title).toBe("Has Title");
  });

  it("leaves title null when the resolver also yields nothing", async () => {
    const noTitle = [{ id: 30, type: "movie", status: 2, media: { tmdbId: 999, status: 3 } }];
    const resolveTitle = vi.fn(async () => null);
    await store.backfillFromSeerr(noTitle, "user-H", resolveTitle);
    expect(store.getByUser("user-H")[0].title).toBeNull();
  });
});

describe("requestStore persistence", () => {
  it("round-trips records through save() and load()", () => {
    store.add({
      requestId: 88,
      tmdbId: 4004,
      mediaType: "movie",
      title: "Madame Web",
      discordUserId: "user-D",
    });
    store.save();

    expect(fs.existsSync(STORE_PATH)).toBe(true);

    store.clear();
    expect(store.getByUser("user-D")).toEqual([]);

    store.load();
    const [record] = store.getByUser("user-D");
    expect(record).toMatchObject({ requestId: 88, title: "Madame Web" });
  });

  it("writes the store file with 0600 permissions", () => {
    store.add({
      requestId: 1,
      tmdbId: 1,
      mediaType: "movie",
      title: "X",
      discordUserId: "u",
    });
    store.save();
    const mode = fs.statSync(STORE_PATH).mode & 0o777;
    // On POSIX this is exactly 0o600; on Windows mode bits are not enforced.
    if (process.platform !== "win32") {
      expect(mode).toBe(0o600);
    }
  });

  it("starts empty when the store file is corrupt", () => {
    fs.writeFileSync(STORE_PATH, "{ not valid json");
    store.load();
    expect(store.getByUser("anyone")).toEqual([]);
  });

  it("load() is a no-op when no file exists", () => {
    expect(() => store.load()).not.toThrow();
    expect(store.getByUser("anyone")).toEqual([]);
  });
});

describe("requestStore.prune", () => {
  it("drops completed entries older than maxAgeDays, keeps recent and open ones", () => {
    const old = new Date(Date.now() - 40 * 86400_000).toISOString();
    const recent = new Date().toISOString();

    store.add({ requestId: 1, tmdbId: 1, mediaType: "movie", title: "Old Available", discordUserId: "u" });
    store.add({ requestId: 2, tmdbId: 2, mediaType: "movie", title: "Old Pending", discordUserId: "u" });
    store.add({ requestId: 3, tmdbId: 3, mediaType: "movie", title: "Recent Available", discordUserId: "u" });

    store.updateFromSeerr([
      { id: 1, status: 2, media: { status: 5 } }, // Available
      { id: 3, status: 2, media: { status: 5 } }, // Available
    ]);

    // Age the records by editing the persisted file, then reloading — keeps
    // timestamp control out of the production API.
    store.save();
    const onDisk = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
    onDisk["1"].updatedAt = old;
    onDisk["2"].updatedAt = old;
    onDisk["3"].updatedAt = recent;
    fs.writeFileSync(STORE_PATH, JSON.stringify(onDisk));
    store.load();

    store.prune(30);

    const titles = store.getByUser("u").map((r) => r.title).sort();
    // Old Available pruned; Old Pending kept (not completed); Recent Available kept.
    expect(titles).toEqual(["Old Pending", "Recent Available"]);
  });
});
