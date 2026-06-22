import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchRequests = vi.fn();
const updateFromSeerr = vi.fn(() => []);
const prune = vi.fn();

vi.mock("../api/seerr.js", () => ({ fetchRequests }));
vi.mock("../utils/requestStore.js", () => ({ updateFromSeerr, prune }));
vi.mock("../utils/notifyPrefs.js", () => ({ isNotifyEnabled: vi.fn(() => false) }));
vi.mock("../seerrWebhook.js", () => ({
  sendRequesterDm: vi.fn(),
  getAdminPendingMsg: vi.fn(() => null),
  removeAdminPendingMsg: vi.fn(),
}));
vi.mock("../utils/notifyDedup.js", () => ({
  wasRecentlyNotified: vi.fn(() => false),
  markNotified: vi.fn(),
}));
vi.mock("../utils/botStrings.js", () => ({ t: (k) => k }));
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { poll } = await import("../bot/seerrStatusPoller.js");

const RESULTS = [
  { id: 1, status: 1, media: { tmdbId: 10, mediaType: "movie", title: "A" } },
  { id: 2, status: 2, media: { tmdbId: 20, mediaType: "tv", title: "B" } },
];

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SEERR_URL = "http://seerr";
  process.env.SEERR_API_KEY = "key";
  fetchRequests.mockResolvedValue({ results: RESULTS });
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
