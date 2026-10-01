import { describe, it, expect, vi, beforeEach } from "vitest";

const tmdbGetDetails = vi.fn(async () => ({ title: "X", name: "X" }));
const tmdbGetExternalImdb = vi.fn(async () => null);
const fetchTags = vi.fn(async () => []);
const buildButtons = vi.fn(() => []);

vi.mock("../api/tmdb.js", () => ({ tmdbGetDetails, tmdbGetExternalImdb }));
vi.mock("../api/seerr.js", () => ({ fetchTags }));
vi.mock("../bot/embeds.js", () => ({ buildButtons }));
vi.mock("../bot/helpers.js", () => ({
  getSeerrUrl: vi.fn(() => "http://seerr"),
  getSeerrApiKey: vi.fn(() => "key"),
  getTmdbApiKey: vi.fn(() => "tmdb"),
}));
vi.mock("../utils/botStrings.js", () => ({ t: (k) => k }));
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { handleTagSelect } = await import("../bot/handlers/tagSelect.js");

function makeInteraction(customId, values = []) {
  return {
    customId,
    values,
    deferUpdate: vi.fn(async () => {}),
    editReply: vi.fn(async () => {}),
    reply: vi.fn(async () => {}),
    followUp: vi.fn(async () => {}),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("handleTagSelect mediaType resolution", () => {
  it("resolves mediaType from the customId as 'tv' even when zero seasons were selected", async () => {
    // Mirrors the >24-season multi-menu picker: allSelectedSeasons can be
    // empty even for a real tv show, so mediaType must never be inferred
    // from selectedSeasons.length.
    await handleTagSelect(makeInteraction("select_tags|999|tv|"));

    expect(tmdbGetDetails).toHaveBeenCalledWith(999, "tv", "tmdb");
  });

  it("resolves mediaType from the customId as 'movie' for the search.js movie tag-select path", async () => {
    await handleTagSelect(makeInteraction("select_tags|888|movie|"));

    expect(tmdbGetDetails).toHaveBeenCalledWith(888, "movie", "tmdb");
  });

  it("still resolves 'tv' when seasons ARE present in the customId", async () => {
    await handleTagSelect(makeInteraction("select_tags|777|tv|1,2,3"));

    expect(tmdbGetDetails).toHaveBeenCalledWith(777, "tv", "tmdb");
  });
});
