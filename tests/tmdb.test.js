import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger
vi.mock("../utils/logger.js", () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock cache — always miss on reads, no-op on writes
vi.mock("../utils/cache.js", () => ({
  default: {
    tmdbSearch: vi.fn(() => null),
    tmdbTrending: vi.fn(() => null),
    tmdbDetails: vi.fn(() => null),
    tmdbExternalIds: vi.fn(() => null),
  },
}));

// Mock axios
vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

// Mock withRetry to just call the function directly
vi.mock("../utils/axiosRetry.js", () => ({
  withRetry: vi.fn((fn) => fn()),
}));

import axios from "axios";
import { tmdbSearch, tmdbGetDetails, tmdbGetExternalImdb, findBestBackdrop } from "../api/tmdb.js";

describe("tmdbSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns filtered results from TMDB", async () => {
    axios.get.mockResolvedValue({
      data: {
        results: [
          { id: 1, media_type: "movie", title: "Batman" },
          { id: 2, media_type: "person", name: "Ben Affleck" },
          { id: 3, media_type: "tv", name: "Gotham" },
        ],
      },
    });

    const results = await tmdbSearch("batman", "test-key");
    expect(results).toHaveLength(3); // tmdbSearch returns all results, filtering happens in caller
    expect(results[0].title).toBe("Batman");
  });

  it("returns empty array when API returns no results", async () => {
    axios.get.mockResolvedValue({ data: { results: [] } });

    const results = await tmdbSearch("xyznonexistent", "test-key");
    expect(results).toEqual([]);
  });

  it("throws on API error", async () => {
    axios.get.mockRejectedValue(new Error("Network Error"));

    await expect(tmdbSearch("test", "key")).rejects.toThrow("Network Error");
  });
});

describe("tmdbGetDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches movie details", async () => {
    const mockMovie = { id: 550, title: "Fight Club", runtime: 139 };
    axios.get.mockResolvedValue({ data: mockMovie });

    const result = await tmdbGetDetails(550, "movie", "test-key");
    expect(result.title).toBe("Fight Club");
    expect(result.runtime).toBe(139);
  });

  it("uses correct URL for TV shows", async () => {
    axios.get.mockResolvedValue({ data: { id: 1399, name: "Breaking Bad" } });

    await tmdbGetDetails(1399, "tv", "test-key");

    const calledUrl = axios.get.mock.calls[0][0];
    expect(calledUrl).toContain("/tv/1399");
  });

  it("uses correct URL for movies", async () => {
    axios.get.mockResolvedValue({ data: { id: 550, title: "Fight Club" } });

    await tmdbGetDetails(550, "movie", "test-key");

    const calledUrl = axios.get.mock.calls[0][0];
    expect(calledUrl).toContain("/movie/550");
  });
});

describe("tmdbGetExternalImdb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns IMDb ID", async () => {
    axios.get.mockResolvedValue({ data: { imdb_id: "tt0137523" } });

    const result = await tmdbGetExternalImdb(550, "movie", "test-key");
    expect(result).toBe("tt0137523");
  });

  it("returns null when no IMDb ID", async () => {
    axios.get.mockResolvedValue({ data: { imdb_id: null } });

    const result = await tmdbGetExternalImdb(123, "tv", "test-key");
    expect(result).toBeNull();
  });
});

describe("findBestBackdrop", () => {
  it("prefers English backdrop", () => {
    const details = {
      backdrop_path: "/fallback.jpg",
      images: {
        backdrops: [
          { iso_639_1: "de", file_path: "/german.jpg" },
          { iso_639_1: "en", file_path: "/english.jpg" },
        ],
      },
    };
    expect(findBestBackdrop(details)).toBe("/english.jpg");
  });

  it("falls back to backdrop_path when no English", () => {
    const details = {
      backdrop_path: "/fallback.jpg",
      images: {
        backdrops: [{ iso_639_1: "de", file_path: "/german.jpg" }],
      },
    };
    expect(findBestBackdrop(details)).toBe("/fallback.jpg");
  });

  it("falls back when no images", () => {
    const details = { backdrop_path: "/only-this.jpg" };
    expect(findBestBackdrop(details)).toBe("/only-this.jpg");
  });
});
