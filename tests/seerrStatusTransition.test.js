import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchRequests = vi.fn();
const sendRequesterDm = vi.fn();
const shouldSendApprovalDm = vi.fn(() => ({ send: true }));
const suppressApprovalDm = vi.fn();

vi.mock("../api/seerr.js", () => ({ fetchRequests }));
vi.mock("../utils/requestStore.js", () => ({ updateFromSeerr: vi.fn(), prune: vi.fn() }));
vi.mock("../seerrWebhook.js", () => ({
  sendRequesterDm,
  getAdminPendingMsg: vi.fn(() => null), // no admin embed to edit → skip that branch
  removeAdminPendingMsg: vi.fn(),
}));
vi.mock("../utils/notificationDispatcher.js", () => ({ shouldSendApprovalDm, suppressApprovalDm }));
vi.mock("../utils/botStrings.js", () => ({ t: (k) => k }));
vi.mock("../utils/logger.js", () => ({ default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../bot/botState.js", () => ({
  botState: { discordClient: { channels: { fetch: vi.fn() } }, isBotRunning: true },
}));

const { poll } = await import("../bot/seerrStatusPoller.js");

const req = (id, status, title = "Dune") => ({
  id,
  status,
  media: { tmdbId: 500 + id, mediaType: "movie", title },
  requestedBy: { username: "bob", settings: { discordId: "u1" } },
});

beforeEach(() => {
  vi.clearAllMocks();
  shouldSendApprovalDm.mockReturnValue({ send: true });
  process.env.SEERR_URL = "http://seerr";
  process.env.SEERR_API_KEY = "key";
});

describe("seerrStatusPoller transition detection", () => {
  it("DMs the requester on a pending → approved transition", async () => {
    // Seed: record status without firing
    fetchRequests.mockResolvedValue({ results: [req(1, 1)] }); // pending
    await poll(true);
    expect(sendRequesterDm).not.toHaveBeenCalled();

    // Now it flips to approved
    fetchRequests.mockResolvedValue({ results: [req(1, 2)] }); // approved
    await poll(false);
    expect(sendRequesterDm).toHaveBeenCalledTimes(1);
    expect(sendRequesterDm.mock.calls[0][1]).toBe("MEDIA_APPROVED");
  });

  it("does not DM when status is unchanged between polls", async () => {
    fetchRequests.mockResolvedValue({ results: [req(2, 1)] });
    await poll(true);
    fetchRequests.mockResolvedValue({ results: [req(2, 1)] }); // still pending
    await poll(false);
    expect(sendRequesterDm).not.toHaveBeenCalled();
  });

  it("skips the DM (suppress) when the request has no resolvable title", async () => {
    const noTitle = { id: 3, status: 1, media: { tmdbId: 9, mediaType: "movie" }, requestedBy: {} };
    fetchRequests.mockResolvedValue({ results: [noTitle] });
    await poll(true);
    fetchRequests.mockResolvedValue({ results: [{ ...noTitle, status: 3 }] }); // declined, still no title
    await poll(false);
    expect(sendRequesterDm).not.toHaveBeenCalled();
    expect(suppressApprovalDm).toHaveBeenCalledWith(expect.objectContaining({ reason: "no-title" }));
  });

  it("respects the dispatcher's dedup decision (no DM when already notified)", async () => {
    shouldSendApprovalDm.mockReturnValue({ send: false });
    fetchRequests.mockResolvedValue({ results: [req(4, 1)] });
    await poll(true);
    fetchRequests.mockResolvedValue({ results: [req(4, 2)] });
    await poll(false);
    expect(sendRequesterDm).not.toHaveBeenCalled();
  });
});
