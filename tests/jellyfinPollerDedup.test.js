import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const markPosted = vi.fn();
const shouldPost = vi.fn(() => ({ post: true }));
const checkMediaStatus = vi.fn();

vi.mock("../utils/notificationDispatcher.js", () => ({ markPosted, shouldPost }));
vi.mock("../api/seerr.js", () => ({ checkMediaStatus }));
// buildButtons dynamically imports seerrWebhook for the button matrix — stub it
// so the heavy module (and its side effects) never load during the test.
vi.mock("../seerrWebhook.js", () => ({
  getEventButtons: () => ({ showWatch: false, showImdb: false, showLetterboxd: false }),
}));
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { doNotify } = await import("../bot/jellyfinPoller.js");

function makeClient(send) {
  return { channels: { fetch: vi.fn(async () => ({ send })) } };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.TMDB_API_KEY; // keep buildEmbed offline (no axios)
  process.env.JELLYFIN_CHANNEL_ID = "chan-1";
});

describe("jellyfinPoller doNotify → notifyDedup", () => {
  it("marks the TMDB id as notified after posting, so the Seerr webhook skips the duplicate", async () => {
    const send = vi.fn(async () => ({ id: "msg-1" }));
    const item = { Type: "Movie", Name: "Dune", Id: "jf-1", ProviderIds: { Tmdb: "693134" } };

    await doNotify(makeClient(send), item, "key", "http://jf", {}, {}, {});

    expect(send).toHaveBeenCalledTimes(1);
    expect(markPosted).toHaveBeenCalledWith(
      expect.objectContaining({ source: "jellyfin-poller", tmdbId: "693134", mediaType: "movie", title: "Dune" })
    );
  });

  it("uses the tv mediaType for series", async () => {
    const send = vi.fn(async () => ({ id: "msg-2" }));
    const item = { Type: "Series", Name: "Shogun", Id: "jf-2", ProviderIds: { Tmdb: "125988" } };

    await doNotify(makeClient(send), item, "key", "http://jf", {}, {}, {});

    expect(markPosted).toHaveBeenCalledWith(
      expect.objectContaining({ tmdbId: "125988", mediaType: "tv" })
    );
  });

  it("delegates to the dispatcher (tmdbId null) when the item has no TMDB id", async () => {
    const send = vi.fn(async () => ({ id: "msg-3" }));
    const item = { Type: "Movie", Name: "Mystery", Id: "jf-3", ProviderIds: {} };

    await doNotify(makeClient(send), item, "key", "http://jf", {}, {}, {});

    // markPosted still runs (audit), but with no tmdbId — dispatcher won't mark dedup.
    expect(markPosted).toHaveBeenCalledWith(expect.objectContaining({ tmdbId: null }));
  });
});

describe("jellyfinPoller doNotify → Seerr-tracked dedup (#3)", () => {
  beforeEach(() => {
    process.env.SEERR_URL = "http://seerr";
    process.env.SEERR_API_KEY = "k";
  });
  afterEach(() => {
    delete process.env.SEERR_URL;
    delete process.env.SEERR_API_KEY;
  });

  it("skips the poller post when the title is tracked in Seerr (mediaInfo status >= 2)", async () => {
    checkMediaStatus.mockResolvedValue({ exists: true, status: 3 });
    const send = vi.fn(async () => ({ id: "m" }));
    const item = { Type: "Movie", Name: "Dune", Id: "jf", ProviderIds: { Tmdb: "693134" } };

    await doNotify(makeClient(send), item, "key", "http://jf", {}, {}, {});

    expect(checkMediaStatus).toHaveBeenCalledWith("693134", "movie", [], "http://seerr", "k");
    expect(send).not.toHaveBeenCalled();
    expect(markPosted).not.toHaveBeenCalled();
  });

  it("posts when Seerr does not track the title (no mediaInfo status)", async () => {
    checkMediaStatus.mockResolvedValue({ exists: true, status: undefined });
    const send = vi.fn(async () => ({ id: "m" }));
    const item = { Type: "Movie", Name: "HomeVideo", Id: "jf", ProviderIds: { Tmdb: "999" } };

    await doNotify(makeClient(send), item, "key", "http://jf", {}, {}, {});

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("posts when the title is not in Seerr at all (404 → exists false)", async () => {
    checkMediaStatus.mockResolvedValue({ exists: false, available: false });
    const send = vi.fn(async () => ({ id: "m" }));
    const item = { Type: "Series", Name: "HomeShow", Id: "jf", ProviderIds: { Tmdb: "888" } };

    await doNotify(makeClient(send), item, "key", "http://jf", {}, {}, {});

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("fails open (posts) when the Seerr check throws", async () => {
    checkMediaStatus.mockRejectedValue(new Error("timeout"));
    const send = vi.fn(async () => ({ id: "m" }));
    const item = { Type: "Movie", Name: "X", Id: "jf", ProviderIds: { Tmdb: "111" } };

    await doNotify(makeClient(send), item, "key", "http://jf", {}, {}, {});

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("skips items with no TMDB id when Seerr is configured (defers to the webhook)", async () => {
    const send = vi.fn(async () => ({ id: "m" }));
    const item = { Type: "Movie", Name: "Slanted", Id: "jf", ProviderIds: {} };

    await doNotify(makeClient(send), item, "key", "http://jf", {}, {}, {});

    expect(send).not.toHaveBeenCalled();
    expect(markPosted).not.toHaveBeenCalled();
    expect(checkMediaStatus).not.toHaveBeenCalled(); // cannot query Seerr without a tmdbId
  });

  it("does not call Seerr when SEERR_URL/API key are unset", async () => {
    delete process.env.SEERR_URL;
    delete process.env.SEERR_API_KEY;
    const send = vi.fn(async () => ({ id: "m" }));
    const item = { Type: "Movie", Name: "NoSeerr", Id: "jf", ProviderIds: { Tmdb: "222" } };

    await doNotify(makeClient(send), item, "key", "http://jf", {}, {}, {});

    expect(checkMediaStatus).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
