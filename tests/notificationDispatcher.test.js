import { describe, it, expect, vi, beforeEach } from "vitest";

const wasRecentlyNotified = vi.fn();
const markNotified = vi.fn();
const recordNotification = vi.fn();

vi.mock("../utils/notifyDedup.js", () => ({ wasRecentlyNotified, markNotified }));
vi.mock("../utils/notificationAudit.js", () => ({ recordNotification }));

const { shouldPost, markPosted, shouldSendApprovalDm, markApprovalDmSent, suppressApprovalDm } =
  await import("../utils/notificationDispatcher.js");

beforeEach(() => vi.clearAllMocks());

describe("approval-DM dedup via the dispatcher", () => {
  it("allows a new approval DM (keyed eventType-requestId)", () => {
    wasRecentlyNotified.mockReturnValue(false);
    const r = shouldSendApprovalDm({ eventType: "MEDIA_APPROVED", requestId: 99, source: "seerr-status-poller" });
    expect(r.send).toBe(true);
    expect(wasRecentlyNotified).toHaveBeenCalledWith("approval", "MEDIA_APPROVED-99");
    expect(recordNotification).not.toHaveBeenCalled();
  });

  it("blocks a duplicate approval DM and records a skipped audit entry", () => {
    wasRecentlyNotified.mockReturnValue(true);
    const r = shouldSendApprovalDm({ eventType: "MEDIA_DECLINED", requestId: 7, source: "seerr-webhook", title: "Dune", tmdbId: 5 });
    expect(r.send).toBe(false);
    expect(recordNotification).toHaveBeenCalledWith(
      expect.objectContaining({ status: "skipped", reason: "already-notified", source: "seerr-webhook", title: "Dune", tmdbId: 5 })
    );
  });

  it("markApprovalDmSent marks dedup and records a posted entry", () => {
    markApprovalDmSent({ eventType: "MEDIA_APPROVED", requestId: 12, source: "seerr-webhook", title: "X", tmdbId: 3, channelId: null });
    expect(markNotified).toHaveBeenCalledWith("approval", "MEDIA_APPROVED-12");
    expect(recordNotification).toHaveBeenCalledWith(
      expect.objectContaining({ status: "posted", source: "seerr-webhook", tmdbId: 3 })
    );
  });

  it("suppressApprovalDm marks dedup and records a skipped entry with the given reason", () => {
    suppressApprovalDm({ eventType: "MEDIA_APPROVED", requestId: 8, source: "seerr-status-poller", reason: "no-title" });
    expect(markNotified).toHaveBeenCalledWith("approval", "MEDIA_APPROVED-8");
    expect(recordNotification).toHaveBeenCalledWith(
      expect.objectContaining({ status: "skipped", reason: "no-title" })
    );
  });
});

describe("notificationDispatcher.shouldPost", () => {
  it("allows a brand-new notification", () => {
    wasRecentlyNotified.mockReturnValue(false);
    const r = shouldPost({ eventType: "MEDIA_AVAILABLE", tmdbId: 5, mediaType: "movie", source: "seerr-webhook" });
    expect(r.post).toBe(true);
    expect(recordNotification).not.toHaveBeenCalled(); // skip is recorded, allow is recorded on markPosted
  });

  it("blocks a duplicate and records a skipped audit entry with the source", () => {
    wasRecentlyNotified.mockReturnValue(true);
    const r = shouldPost({ eventType: "MEDIA_AVAILABLE", tmdbId: 5, mediaType: "tv", source: "jellyfin-poller", title: "Shogun" });
    expect(r.post).toBe(false);
    expect(wasRecentlyNotified).toHaveBeenCalledWith("tv", 5);
    expect(recordNotification).toHaveBeenCalledWith(
      expect.objectContaining({ status: "skipped", source: "jellyfin-poller", tmdbId: 5, title: "Shogun" })
    );
  });

  it("always allows when there is no tmdbId (can't dedup)", () => {
    const r = shouldPost({ eventType: "MEDIA_AVAILABLE", tmdbId: null, mediaType: "movie", source: "seerr-webhook" });
    expect(r.post).toBe(true);
    expect(wasRecentlyNotified).not.toHaveBeenCalled();
  });
});

describe("notificationDispatcher.markPosted", () => {
  it("marks dedup and records a posted audit entry", () => {
    markPosted({ eventType: "MEDIA_AVAILABLE", tmdbId: 7, mediaType: "movie", source: "seerr-webhook", channelId: "c1", title: "Dune" });
    expect(markNotified).toHaveBeenCalledWith("movie", 7);
    expect(recordNotification).toHaveBeenCalledWith(
      expect.objectContaining({ status: "posted", source: "seerr-webhook", channelId: "c1", tmdbId: 7, title: "Dune" })
    );
  });

  it("still records the audit entry when there is no tmdbId, without marking dedup", () => {
    markPosted({ eventType: "MEDIA_AVAILABLE", tmdbId: null, mediaType: "movie", source: "jellyfin-poller" });
    expect(markNotified).not.toHaveBeenCalled();
    expect(recordNotification).toHaveBeenCalledWith(expect.objectContaining({ status: "posted" }));
  });
});
