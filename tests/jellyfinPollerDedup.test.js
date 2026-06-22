import { describe, it, expect, vi, beforeEach } from "vitest";

const markNotified = vi.fn();
const wasRecentlyNotified = vi.fn(() => false);

vi.mock("../utils/notifyDedup.js", () => ({ markNotified, wasRecentlyNotified }));
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
    expect(markNotified).toHaveBeenCalledWith("movie", "693134");
  });

  it("uses the tv key for series", async () => {
    const send = vi.fn(async () => ({ id: "msg-2" }));
    const item = { Type: "Series", Name: "Shogun", Id: "jf-2", ProviderIds: { Tmdb: "125988" } };

    await doNotify(makeClient(send), item, "key", "http://jf", {}, {}, {});

    expect(markNotified).toHaveBeenCalledWith("tv", "125988");
  });

  it("does not mark when the item has no TMDB id", async () => {
    const send = vi.fn(async () => ({ id: "msg-3" }));
    const item = { Type: "Movie", Name: "Mystery", Id: "jf-3", ProviderIds: {} };

    await doNotify(makeClient(send), item, "key", "http://jf", {}, {}, {});

    expect(markNotified).not.toHaveBeenCalled();
  });
});
