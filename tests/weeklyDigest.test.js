import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchItemsAddedSince = vi.fn();

vi.mock("../api/jellyfin.js", () => ({ fetchItemsAddedSince }));
vi.mock("../utils/botStrings.js", () => ({ t: (k) => k }));
vi.mock("../utils/logger.js", () => ({ default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { buildDigestSummary, sendWeeklyDigest } = await import("../bot/weeklyDigest.js");

const DAY = 24 * 60 * 60 * 1000;

function makeClient(send) {
  return { channels: { fetch: vi.fn(async () => ({ isTextBased: () => true, send })) } };
}

describe("buildDigestSummary", () => {
  const now = Date.now();
  const recent = new Date(now - 2 * DAY).toISOString();
  const old = new Date(now - 30 * DAY).toISOString();

  it("keeps only items created within the window", () => {
    const items = [
      { Type: "Movie", Name: "Fresh", ProductionYear: 2026, DateCreated: recent },
      { Type: "Movie", Name: "Stale", ProductionYear: 2010, DateCreated: old },
    ];
    const sum = buildDigestSummary(items, now - 7 * DAY);
    expect(sum.movies.map((m) => m.title)).toEqual(["Fresh"]);
  });

  it("separates movies from series", () => {
    const items = [
      { Type: "Movie", Name: "A Movie", DateCreated: recent },
      { Type: "Series", Name: "A Show", DateCreated: recent },
    ];
    const sum = buildDigestSummary(items, now - 7 * DAY);
    expect(sum.movies.map((m) => m.title)).toEqual(["A Movie"]);
    expect(sum.series.map((s) => s.title)).toEqual(["A Show"]);
  });

  it("ignores Season and Episode item types", () => {
    const items = [
      { Type: "Season", Name: "Season 2", DateCreated: recent },
      { Type: "Episode", Name: "Pilot", DateCreated: recent },
    ];
    const sum = buildDigestSummary(items, now - 7 * DAY);
    expect(sum.movies).toHaveLength(0);
    expect(sum.series).toHaveLength(0);
  });
});

describe("sendWeeklyDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DIGEST_ENABLED = "true";
    process.env.DIGEST_CHANNEL_ID = "chan1";
    process.env.JELLYFIN_API_KEY = "k";
    process.env.JELLYFIN_BASE_URL = "http://jf";
    delete process.env.JELLYFIN_CHANNEL_ID;
  });

  it("posts a digest embed when new items exist and reports the outcome", async () => {
    const recent = new Date(Date.now() - DAY).toISOString();
    fetchItemsAddedSince.mockResolvedValue([{ Type: "Movie", Name: "New One", DateCreated: recent }]);
    const send = vi.fn();
    const result = await sendWeeklyDigest(makeClient(send));
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(send.mock.calls[0][0])).toContain("New One");
    expect(result).toMatchObject({ posted: true, reason: "posted", movies: 1, series: 0, channelId: "chan1" });
  });

  it("does not post when disabled and reports reason", async () => {
    process.env.DIGEST_ENABLED = "false";
    const send = vi.fn();
    const result = await sendWeeklyDigest(makeClient(send));
    expect(fetchItemsAddedSince).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ posted: false, reason: "disabled", enabled: false });
  });

  it("force-runs even when disabled (test button)", async () => {
    process.env.DIGEST_ENABLED = "false";
    const recent = new Date(Date.now() - DAY).toISOString();
    fetchItemsAddedSince.mockResolvedValue([{ Type: "Series", Name: "Forced", DateCreated: recent }]);
    const send = vi.fn();
    const result = await sendWeeklyDigest(makeClient(send), { force: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ posted: true, reason: "posted", enabled: false, series: 1 });
  });

  it("skips silently when nothing new this week and reports reason", async () => {
    fetchItemsAddedSince.mockResolvedValue([]);
    const send = vi.fn();
    const result = await sendWeeklyDigest(makeClient(send));
    expect(send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ posted: false, reason: "empty" });
  });

  it("reports when no channel is configured", async () => {
    delete process.env.DIGEST_CHANNEL_ID;
    const recent = new Date(Date.now() - DAY).toISOString();
    fetchItemsAddedSince.mockResolvedValue([{ Type: "Movie", Name: "X", DateCreated: recent }]);
    const send = vi.fn();
    const result = await sendWeeklyDigest(makeClient(send));
    expect(send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ posted: false, reason: "no-channel" });
  });

  it("falls back to JELLYFIN_CHANNEL_ID when DIGEST_CHANNEL_ID unset", async () => {
    delete process.env.DIGEST_CHANNEL_ID;
    process.env.JELLYFIN_CHANNEL_ID = "jfchan";
    const recent = new Date(Date.now() - DAY).toISOString();
    fetchItemsAddedSince.mockResolvedValue([{ Type: "Movie", Name: "Fb", DateCreated: recent }]);
    const client = makeClient(vi.fn());
    await sendWeeklyDigest(client);
    expect(client.channels.fetch).toHaveBeenCalledWith("jfchan");
  });

  it("reports no-client without a client", async () => {
    const result = await sendWeeklyDigest(null);
    expect(result).toMatchObject({ posted: false, reason: "no-client" });
    expect(fetchItemsAddedSince).not.toHaveBeenCalled();
  });
});
