import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const markPosted = vi.fn();
const shouldPost = vi.fn(() => ({ post: true }));
const checkMediaStatus = vi.fn(() => ({ exists: false }));
const fetchItemDetails = vi.fn();
const fetchLibraryMap = vi.fn(async () => ({ libraries: [], libraryIdMap: new Map() }));

vi.mock("../utils/notificationDispatcher.js", () => ({ markPosted, shouldPost }));
vi.mock("../api/seerr.js", () => ({ checkMediaStatus }));
vi.mock("../seerrWebhook.js", () => ({ getEventButtons: () => ({ showWatch: false, showImdb: false, showLetterboxd: false }) }));
vi.mock("../utils/logger.js", () => ({ default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../api/jellyfin.js", () => ({
  findLibraryByAncestors: vi.fn(async () => null),
  fetchLatestAdditions: vi.fn(async () => []),
  fetchItemsAddedSince: vi.fn(async () => []),
  scanAllItemsForUnseen: vi.fn(async () => ({ newItems: [], totalScanned: 0 })),
  seedAllItemIds: vi.fn(async () => 0),
  fetchItemDetails,
  fetchLibraryMap,
  getLibraryChannels: () => ({}),
}));

const { processPendingMetadata, _pendingMetadataForTests, hasFullMetadata } = await import("../bot/jellyfinPoller.js");
const pending = _pendingMetadataForTests();

function makeClient(send) {
  return { channels: { fetch: vi.fn(async () => ({ send })) } };
}

beforeEach(() => {
  vi.clearAllMocks();
  pending.clear();
  process.env.JELLYFIN_CHANNEL_ID = "chan-1";
  process.env.TMDB_API_KEY = "tk";
  delete process.env.SEERR_URL;
  delete process.env.SEERR_API_KEY;
});
afterEach(() => {
  delete process.env.TMDB_API_KEY;
  delete process.env.JELLYFIN_CHANNEL_ID;
});

describe("processPendingMetadata", () => {
  it("posts a basic notification and dequeues an item that has aged out", async () => {
    pending.set("jf-1", 1); // firstSeen far in the past → aged past METADATA_MAX_WAIT_MS
    fetchItemDetails.mockResolvedValue({ Id: "jf-1", Type: "Movie", Name: "Boss Level", ProviderIds: {} });
    const send = vi.fn(async () => ({ id: "m" }));

    await processPendingMetadata(makeClient(send), "key", "http://jf");

    expect(send).toHaveBeenCalledTimes(1);
    expect(pending.has("jf-1")).toBe(false);
  });

  it("keeps an item queued when it is neither ready nor aged out", async () => {
    pending.set("jf-2", Date.now()); // just queued
    fetchItemDetails.mockResolvedValue({ Id: "jf-2", Type: "Movie", Name: "Fresh", ProviderIds: {} }); // no tmdbId → not ready
    const send = vi.fn(async () => ({ id: "m" }));

    await processPendingMetadata(makeClient(send), "key", "http://jf");

    expect(send).not.toHaveBeenCalled();
    expect(pending.has("jf-2")).toBe(true);
  });

  it("drops an aged-out item that no longer exists in Jellyfin", async () => {
    pending.set("jf-3", 1); // aged out
    fetchItemDetails.mockResolvedValue(null); // gone
    const send = vi.fn(async () => ({ id: "m" }));

    await processPendingMetadata(makeClient(send), "key", "http://jf");

    expect(send).not.toHaveBeenCalled();
    expect(pending.has("jf-3")).toBe(false);
  });

  it("does nothing when the queue is empty", async () => {
    const send = vi.fn(async () => ({ id: "m" }));
    await processPendingMetadata(makeClient(send), "key", "http://jf");
    expect(fetchItemDetails).not.toHaveBeenCalled();
  });
});
