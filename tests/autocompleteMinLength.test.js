import { describe, it, expect, vi, beforeEach } from "vitest";

const tmdbSearch = vi.fn();
vi.mock("../api/tmdb.js", () => ({
  tmdbSearch,
  tmdbGetGenres: vi.fn(),
  tmdbGetDetails: vi.fn(),
}));
vi.mock("../bot/helpers.js", () => ({ getTmdbApiKey: () => "key" }));
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { handleAutocomplete } = await import("../bot/autocomplete/index.js");

function makeInteraction(value) {
  return {
    commandName: "search",
    options: { getFocused: () => ({ name: "title", value }) },
    respond: vi.fn(),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("search autocomplete min-length guard", () => {
  it("responds empty and skips TMDB for a single character", async () => {
    const interaction = makeInteraction("a");
    await handleAutocomplete(interaction);
    expect(tmdbSearch).not.toHaveBeenCalled();
    expect(interaction.respond).toHaveBeenCalledWith([]);
  });

  it("queries TMDB once the input is long enough", async () => {
    tmdbSearch.mockResolvedValue([]);
    const interaction = makeInteraction("dune");
    await handleAutocomplete(interaction);
    expect(tmdbSearch).toHaveBeenCalledWith("dune", "key");
  });
});
