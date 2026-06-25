import { describe, it, expect, vi, beforeEach } from "vitest";

const allSeries = vi.fn();
const updateSeasonCount = vi.fn();
const countSeriesSeasonsInJellyfin = vi.fn();

vi.mock("../utils/subscriptionStore.js", () => ({ allSeries, updateSeasonCount }));
vi.mock("../api/jellyfin.js", () => ({ countSeriesSeasonsInJellyfin }));
vi.mock("../utils/botStrings.js", () => ({ t: (k, v) => (v ? `${k}:${v.title}:${v.season}` : k) }));
vi.mock("../utils/logger.js", () => ({ default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { checkNewSeasons } = await import("../bot/subscriptionPoller.js");

function makeClient(send) {
  return { users: { fetch: vi.fn(async () => ({ send })) } };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JELLYFIN_API_KEY = "key";
  process.env.JELLYFIN_BASE_URL = "http://jf";
});

describe("checkNewSeasons", () => {
  it("DMs the subscriber and bumps the baseline when a new season appears", async () => {
    allSeries.mockReturnValue([{ discordUserId: "u1", tmdbId: 1399, title: "GoT", seasonCount: 7 }]);
    countSeriesSeasonsInJellyfin.mockResolvedValue(8);
    const send = vi.fn();

    await checkNewSeasons(makeClient(send));

    expect(send).toHaveBeenCalledTimes(1);
    expect(updateSeasonCount).toHaveBeenCalledWith("u1", 1399, 8);
  });

  it("does nothing when the season count is unchanged", async () => {
    allSeries.mockReturnValue([{ discordUserId: "u1", tmdbId: 1399, title: "GoT", seasonCount: 8 }]);
    countSeriesSeasonsInJellyfin.mockResolvedValue(8);
    const send = vi.fn();

    await checkNewSeasons(makeClient(send));

    expect(send).not.toHaveBeenCalled();
    expect(updateSeasonCount).not.toHaveBeenCalled();
  });

  it("skips when the series is not (yet) in the library (null count)", async () => {
    allSeries.mockReturnValue([{ discordUserId: "u1", tmdbId: 1399, title: "GoT", seasonCount: 7 }]);
    countSeriesSeasonsInJellyfin.mockResolvedValue(null);
    const send = vi.fn();

    await checkNewSeasons(makeClient(send));

    expect(send).not.toHaveBeenCalled();
    expect(updateSeasonCount).not.toHaveBeenCalled();
  });

  it("is a no-op without a client", async () => {
    allSeries.mockReturnValue([{ discordUserId: "u1", tmdbId: 1, title: "X", seasonCount: 1 }]);
    await expect(checkNewSeasons(null)).resolves.toBeUndefined();
    expect(countSeriesSeasonsInJellyfin).not.toHaveBeenCalled();
  });
});
