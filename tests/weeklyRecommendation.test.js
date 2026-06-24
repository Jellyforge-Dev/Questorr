import { describe, it, expect, vi, beforeEach } from "vitest";

const getWeeklyUsers = vi.fn();
const resolveJellyfinUserId = vi.fn();
const fetchUserRecentlyPlayed = vi.fn();
const tmdbGetSimilar = vi.fn();

vi.mock("../utils/subscriptionStore.js", () => ({ getWeeklyUsers }));
vi.mock("../api/jellyfin.js", () => ({ resolveJellyfinUserId, fetchUserRecentlyPlayed }));
vi.mock("../api/tmdb.js", () => ({ tmdbGetSimilar }));
vi.mock("../utils/configFile.js", () => ({ getUserMappings: () => [], CONFIG_PATH: "/tmp/questorr-weekly-test.json" }));
vi.mock("../bot/helpers.js", () => ({
  getTmdbApiKey: () => "tmdb",
  getSeerrUrl: () => "http://seerr",
  getSeerrApiKey: () => "key",
}));
vi.mock("../utils/botStrings.js", () => ({ t: (k) => k }));
vi.mock("../utils/logger.js", () => ({ default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { sendWeeklyRecommendations } = await import("../bot/weeklyRecommendation.js");

function makeClient(send) {
  return { users: { fetch: vi.fn(async () => ({ send })) } };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JELLYFIN_API_KEY = "k";
  process.env.JELLYFIN_BASE_URL = "http://jf";
});

describe("sendWeeklyRecommendations", () => {
  it("DMs an opted-in mapped user with aggregated recommendations", async () => {
    getWeeklyUsers.mockReturnValue(["u1"]);
    resolveJellyfinUserId.mockResolvedValue("jf1");
    fetchUserRecentlyPlayed.mockResolvedValue([{ ProviderIds: { Tmdb: "100" }, Type: "Movie", Name: "Seed" }]);
    tmdbGetSimilar.mockResolvedValue([
      { id: 1, title: "Rec A", vote_average: 8 },
      { id: 2, title: "Rec B", vote_average: 7 },
    ]);
    const send = vi.fn();

    await sendWeeklyRecommendations(makeClient(send));

    expect(send).toHaveBeenCalledTimes(1);
    expect(String(send.mock.calls[0][0])).toContain("Rec A");
  });

  it("skips an unmapped user (no Jellyfin id)", async () => {
    getWeeklyUsers.mockReturnValue(["u2"]);
    resolveJellyfinUserId.mockResolvedValue(null);
    const send = vi.fn();

    await sendWeeklyRecommendations(makeClient(send));

    expect(send).not.toHaveBeenCalled();
  });

  it("skips a user with no watch history (no seeds → no recs)", async () => {
    getWeeklyUsers.mockReturnValue(["u3"]);
    resolveJellyfinUserId.mockResolvedValue("jf3");
    fetchUserRecentlyPlayed.mockResolvedValue([]);
    const send = vi.fn();

    await sendWeeklyRecommendations(makeClient(send));

    expect(send).not.toHaveBeenCalled();
  });

  it("is a no-op without a client", async () => {
    getWeeklyUsers.mockReturnValue(["u1"]);
    await expect(sendWeeklyRecommendations(null)).resolves.toBeUndefined();
    expect(resolveJellyfinUserId).not.toHaveBeenCalled();
  });
});
