import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchRequests = vi.fn();

vi.mock("../api/seerr.js", () => ({ fetchRequests }));
vi.mock("../api/jellyfin.js", () => ({ findJellyfinItemByTmdbId: vi.fn() }));
vi.mock("../bot/helpers.js", () => ({
  getSeerrUrl: vi.fn(() => "http://seerr"),
  getSeerrApiKey: vi.fn(() => "key"),
  buildJellyfinUrl: vi.fn(() => null),
}));
vi.mock("../utils/url.js", () => ({ isValidUrl: vi.fn(() => false) }));
vi.mock("../utils/dateFormat.js", () => ({ formatDate: vi.fn(() => "") }));
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("axios", () => ({ default: { get: vi.fn() } }));
vi.mock("../utils/seerrUrl.js", () => ({ getSeerrApiUrl: vi.fn((u) => u) }));
vi.mock("../utils/botStrings.js", () => ({ t: (k) => k }));

const { handleWatchlistCommand } = await import("../bot/commands/watchlist.js");

function makeInteraction(filter) {
  return {
    deferReply: vi.fn(async () => {}),
    editReply: vi.fn(async () => {}),
    user: { id: "discord-1" },
    options: { getString: () => filter },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.USER_MAPPINGS = JSON.stringify([{ discordUserId: "discord-1", seerrUserId: 42 }]);
  fetchRequests.mockResolvedValue({
    results: [{ media: { tmdbId: 1, mediaType: "movie" }, status: 2, requestedBy: { id: 42 } }],
    pageInfo: { results: 1 },
  });
});
afterEach(() => { delete process.env.USER_MAPPINGS; });

describe("/watchlist filter:mine", () => {
  it("passes the mapped Seerr user id as requestedBy so filtering happens server-side", async () => {
    const interaction = makeInteraction("mine");
    await handleWatchlistCommand(interaction);

    expect(fetchRequests).toHaveBeenCalledWith("http://seerr", "key", 50, "all", "42");
  });

  it("does not pass requestedBy for other filters", async () => {
    const interaction = makeInteraction("pending");
    await handleWatchlistCommand(interaction);

    expect(fetchRequests).toHaveBeenCalledWith("http://seerr", "key", 50, "pending", undefined);
  });

  it("reports the no-mapping message instead of calling Seerr when the user has no mapping", async () => {
    delete process.env.USER_MAPPINGS;
    const interaction = makeInteraction("mine");
    await handleWatchlistCommand(interaction);

    expect(fetchRequests).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: "watchlist_no_mapping" }));
  });
});
