import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../utils/axiosRetry.js", () => ({ withRetry: (fn) => fn() }));

import axios from "axios";
import { searchJellyfinByName } from "../api/jellyfin.js";

beforeEach(() => vi.clearAllMocks());

describe("searchJellyfinByName", () => {
  it("returns mapped movies/series that carry a TMDB id, dropping those without", async () => {
    axios.get.mockResolvedValue({
      data: {
        Items: [
          { Id: "1", Name: "Dune", Type: "Movie", ProductionYear: 2021, ProviderIds: { Tmdb: "438631" } },
          { Id: "2", Name: "No IDs", Type: "Series", ProviderIds: {} },
          { Id: "3", Name: "Severance", Type: "Series", ProviderIds: { Tmdb: "95396" } },
        ],
      },
    });

    const res = await searchJellyfinByName("a", "key", "http://jf.local");

    expect(res).toEqual([
      { id: "1", name: "Dune", year: "2021", type: "movie", tmdbId: "438631" },
      { id: "3", name: "Severance", year: "", type: "tv", tmdbId: "95396" },
    ]);

    const params = axios.get.mock.calls[0][1].params;
    expect(params.SearchTerm).toBe("a");
    expect(params.IncludeItemTypes).toBe("Movie,Series");
    expect(params.Recursive).toBe(true);
  });

  it("returns [] on empty query or missing config", async () => {
    expect(await searchJellyfinByName("", "k", "http://jf")).toEqual([]);
    expect(await searchJellyfinByName("x", "", "http://jf")).toEqual([]);
    expect(axios.get).not.toHaveBeenCalled();
  });
});
