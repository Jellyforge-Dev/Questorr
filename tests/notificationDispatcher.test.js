import { describe, it, expect, vi, beforeEach } from "vitest";

const wasRecentlyNotified = vi.fn();
const markNotified = vi.fn();
const recordNotification = vi.fn();

vi.mock("../utils/notifyDedup.js", () => ({ wasRecentlyNotified, markNotified }));
vi.mock("../utils/notificationAudit.js", () => ({ recordNotification }));

const { shouldPost, markPosted } = await import("../utils/notificationDispatcher.js");

beforeEach(() => vi.clearAllMocks());

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
