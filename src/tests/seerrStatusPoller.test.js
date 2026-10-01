import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchRequests = vi.fn();
const updateFromSeerr = vi.fn();
const prune = vi.fn();
const sendRequesterDm = vi.fn();
const shouldSendApprovalDm = vi.fn(() => ({ send: true }));
const suppressApprovalDm = vi.fn();

vi.mock("../api/seerr.js", () => ({ fetchRequests }));
vi.mock("../utils/requestStore.js", () => ({ updateFromSeerr, prune }));
vi.mock("../../seerrWebhook.js", () => ({
  sendRequesterDm,
  getAdminPendingMsg: vi.fn(() => null),
  removeAdminPendingMsg: vi.fn(),
}));
vi.mock("../utils/notificationDispatcher.js", () => ({
  shouldSendApprovalDm,
  suppressApprovalDm,
}));
vi.mock("../utils/botStrings.js", () => ({ t: (k) => k }));
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { poll } = await import("../bot/seerrStatusPoller.js");
const { botState } = await import("../bot/botState.js");

const RESULTS = [
  { id: 1, status: 1, media: { tmdbId: 10, mediaType: "movie", title: "A" } },
  { id: 2, status: 2, media: { tmdbId: 20, mediaType: "tv", title: "B" } },
];

beforeEach(() => {
  vi.clearAllMocks();
  shouldSendApprovalDm.mockReturnValue({ send: true });
  process.env.SEERR_URL = "http://seerr";
  process.env.SEERR_API_KEY = "key";
  fetchRequests.mockResolvedValue({ results: RESULTS });
  botState.discordClient = null;
});

describe("seerrStatusPoller → requestStore integration", () => {
  it("reconciles the request store with the fetched results on a real poll", async () => {
    await poll(false);
    expect(updateFromSeerr).toHaveBeenCalledTimes(1);
    expect(updateFromSeerr).toHaveBeenCalledWith(RESULTS);
  });

  it("does not reconcile the store during the seed phase", async () => {
    await poll(true);
    expect(updateFromSeerr).not.toHaveBeenCalled();
  });

  it("reuses the already-fetched data — no extra Seerr call", async () => {
    await poll(false);
    expect(fetchRequests).toHaveBeenCalledTimes(1);
  });
});

describe("seerrStatusPoller → pending transition detection", () => {
  it("still recognizes an approval when Seerr has already moved the request past APPROVED(2) by the next poll", async () => {
    botState.discordClient = {};

    // Seed: request seen as Pending(1).
    fetchRequests.mockResolvedValueOnce({
      results: [{ id: 9001, status: 1, media: { tmdbId: 501, mediaType: "movie", title: "Race Test" } }],
    });
    await poll(true);

    // Next poll: Seerr already grabbed it and flipped straight to Completed(5),
    // skipping the literal APPROVED(2) value a strict check would require.
    fetchRequests.mockResolvedValueOnce({
      results: [{ id: 9001, status: 5, media: { tmdbId: 501, mediaType: "movie", title: "Race Test" } }],
    });
    await poll(false);

    expect(sendRequesterDm).toHaveBeenCalledTimes(1);
    expect(sendRequesterDm).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Race Test" }),
      "MEDIA_APPROVED",
      {},
      botState.discordClient,
      null,
      null,
      { tmdbId: 501 }
    );
  });

  it("still recognizes an approval that lands on FAILED(4) (e.g. Radarr rejected the grab)", async () => {
    botState.discordClient = {};

    fetchRequests.mockResolvedValueOnce({
      results: [{ id: 9002, status: 1, media: { tmdbId: 502, mediaType: "movie", title: "Failed Grab" } }],
    });
    await poll(true);

    fetchRequests.mockResolvedValueOnce({
      results: [{ id: 9002, status: 4, media: { tmdbId: 502, mediaType: "movie", title: "Failed Grab" } }],
    });
    await poll(false);

    expect(sendRequesterDm).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Failed Grab" }),
      "MEDIA_APPROVED",
      expect.anything(),
      expect.anything(),
      null,
      null,
      { tmdbId: 502 }
    );
  });

  it("still recognizes a decline", async () => {
    botState.discordClient = {};

    fetchRequests.mockResolvedValueOnce({
      results: [{ id: 9003, status: 1, media: { tmdbId: 503, mediaType: "tv", title: "Declined Show" } }],
    });
    await poll(true);

    fetchRequests.mockResolvedValueOnce({
      results: [{ id: 9003, status: 3, media: { tmdbId: 503, mediaType: "tv", title: "Declined Show" } }],
    });
    await poll(false);

    expect(sendRequesterDm).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Declined Show" }),
      "MEDIA_DECLINED",
      expect.anything(),
      expect.anything(),
      null,
      null,
      { tmdbId: 503 }
    );
  });

  it("does not fire again on a second poll once the transition was already handled", async () => {
    botState.discordClient = {};

    fetchRequests.mockResolvedValueOnce({
      results: [{ id: 9004, status: 1, media: { tmdbId: 504, mediaType: "movie", title: "Stable" } }],
    });
    await poll(true);

    fetchRequests.mockResolvedValueOnce({
      results: [{ id: 9004, status: 2, media: { tmdbId: 504, mediaType: "movie", title: "Stable" } }],
    });
    await poll(false);
    expect(sendRequesterDm).toHaveBeenCalledTimes(1);

    // Same status again next tick — must not re-fire.
    fetchRequests.mockResolvedValueOnce({
      results: [{ id: 9004, status: 2, media: { tmdbId: 504, mediaType: "movie", title: "Stable" } }],
    });
    await poll(false);
    expect(sendRequesterDm).toHaveBeenCalledTimes(1);
  });
});
