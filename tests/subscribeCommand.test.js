import { describe, it, expect, vi, beforeEach } from "vitest";

const addSeries = vi.fn(() => true);
const removeSeries = vi.fn(() => true);
const getSeriesByUser = vi.fn(() => []);
const toggleWeekly = vi.fn(() => true);
const isWeeklyEnabled = vi.fn(() => false);
const countSeriesSeasonsInJellyfin = vi.fn(async () => 3);
const tmdbGetDetails = vi.fn();
const tmdbSearch = vi.fn();

vi.mock("../utils/subscriptionStore.js", () => ({ addSeries, removeSeries, getSeriesByUser, toggleWeekly, isWeeklyEnabled }));
vi.mock("../api/jellyfin.js", () => ({ countSeriesSeasonsInJellyfin }));
vi.mock("../api/tmdb.js", () => ({ tmdbGetDetails, tmdbSearch }));
vi.mock("../bot/helpers.js", () => ({ getTmdbApiKey: () => "tmdb" }));
vi.mock("../utils/botStrings.js", () => ({ t: (k) => k }));
vi.mock("../utils/logger.js", () => ({ default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { handleSubscribeCommand, handleSubscribeModalSubmit } = await import("../bot/commands/subscribe.js");

function interaction(sub, opts = {}) {
  return {
    user: { id: "u1" },
    options: {
      getSubcommand: () => sub,
      getString: (n) => opts[n] ?? null,
    },
    reply: vi.fn(),
    deferReply: vi.fn(),
    editReply: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JELLYFIN_API_KEY = "k";
  process.env.JELLYFIN_BASE_URL = "http://jf";
});

describe("/subscribe series", () => {
  it("subscribes with the current Jellyfin season count as baseline", async () => {
    tmdbGetDetails.mockResolvedValue({ name: "GoT" });
    const i = interaction("series", { title: "1399|tv|Game of Thrones" });
    await handleSubscribeCommand(i);

    expect(addSeries).toHaveBeenCalledWith(expect.objectContaining({ discordUserId: "u1", tmdbId: 1399, seasonCount: 3 }));
  });
});

describe("/subscribe weekly", () => {
  it("toggles the weekly opt-in", async () => {
    toggleWeekly.mockReturnValue(true);
    const i = interaction("weekly");
    await handleSubscribeCommand(i);
    expect(toggleWeekly).toHaveBeenCalledWith("u1");
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ content: "subscribe_weekly_on", flags: 64 }));
  });
});

describe("/subscribe list", () => {
  it("lists the user's series and weekly status", async () => {
    getSeriesByUser.mockReturnValue([{ tmdbId: 1, title: "A", seasonCount: 2 }]);
    isWeeklyEnabled.mockReturnValue(true);
    const i = interaction("list");
    await handleSubscribeCommand(i);
    expect(i.reply).toHaveBeenCalled();
    const arg = i.reply.mock.calls[0][0];
    expect(arg.flags).toBe(64);
  });
});

describe("subscribe modal submit (wizard button)", () => {
  function modalInteraction(value) {
    return {
      user: { id: "u1" },
      fields: { getTextInputValue: () => value },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    };
  }

  it("searches TV, subscribes to the first hit with the Jellyfin baseline", async () => {
    tmdbSearch.mockResolvedValue([
      { id: 1399, media_type: "tv", name: "Game of Thrones" },
      { id: 2, media_type: "tv", name: "Other" },
    ]);
    tmdbGetDetails.mockResolvedValue({ name: "Game of Thrones" });
    countSeriesSeasonsInJellyfin.mockResolvedValue(5);
    const i = modalInteraction("game of thrones");

    await handleSubscribeModalSubmit(i);

    expect(addSeries).toHaveBeenCalledWith(expect.objectContaining({ tmdbId: 1399, title: "Game of Thrones", seasonCount: 5 }));
  });

  it("reports not-found when TV search is empty", async () => {
    tmdbSearch.mockResolvedValue([{ id: 9, media_type: "movie", title: "A Movie" }]); // no tv
    const i = modalInteraction("a movie");
    await handleSubscribeModalSubmit(i);
    expect(addSeries).not.toHaveBeenCalled();
    expect(i.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: "subscribe_not_found" }));
  });
});
