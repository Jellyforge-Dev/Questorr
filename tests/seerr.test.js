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

// Mock axios
vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// Mock withRetry to just call the function directly
vi.mock("../utils/axiosRetry.js", () => ({
  withRetry: vi.fn((fn) => fn()),
}));

// Mock seerrUrl
vi.mock("../utils/seerrUrl.js", () => ({
  getSeerrApiUrl: vi.fn((url) => url.replace(/\/$/, "") + "/api/v1"),
}));

import axios from "axios";
import { checkMediaStatus, sendRequest } from "../api/seerr.js";

describe("checkMediaStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns available=true for movie with status 5", async () => {
    axios.get.mockResolvedValue({
      data: {
        mediaInfo: { status: 5 },
      },
    });

    const result = await checkMediaStatus(550, "movie", ["all"], "http://seerr", "key");
    expect(result.exists).toBe(true);
    expect(result.available).toBe(true);
    expect(result.status).toBe(5);
  });

  it("returns available=true for partially available movie (status 4)", async () => {
    axios.get.mockResolvedValue({
      data: {
        mediaInfo: { status: 4 },
      },
    });

    const result = await checkMediaStatus(550, "movie", ["all"], "http://seerr", "key");
    expect(result.available).toBe(true);
  });

  it("returns available=false for pending movie (status 2)", async () => {
    axios.get.mockResolvedValue({
      data: {
        mediaInfo: { status: 2 },
      },
    });

    const result = await checkMediaStatus(550, "movie", ["all"], "http://seerr", "key");
    expect(result.exists).toBe(true);
    expect(result.available).toBe(false);
    expect(result.status).toBe(2);
  });

  it("returns exists=false on 404", async () => {
    const err = new Error("Not found");
    err.response = { status: 404 };
    axios.get.mockRejectedValue(err);

    const result = await checkMediaStatus(999, "movie", [], "http://seerr", "key");
    expect(result.exists).toBe(false);
    expect(result.available).toBe(false);
  });

  it("checks all seasons for TV show", async () => {
    axios.get.mockResolvedValue({
      data: {
        mediaInfo: {
          status: 5,
          seasons: [
            { seasonNumber: 1, status: 5 },
            { seasonNumber: 2, status: 5 },
          ],
        },
      },
    });

    const result = await checkMediaStatus(1399, "tv", ["all"], "http://seerr", "key");
    expect(result.available).toBe(true);
  });

  it("returns available=false when not all seasons are available", async () => {
    axios.get.mockResolvedValue({
      data: {
        mediaInfo: {
          status: 4,
          seasons: [
            { seasonNumber: 1, status: 5 },
            { seasonNumber: 2, status: 2 }, // pending
          ],
        },
      },
    });

    const result = await checkMediaStatus(1399, "tv", ["all"], "http://seerr", "key");
    expect(result.available).toBe(false);
  });

  it("checks specific seasons", async () => {
    axios.get.mockResolvedValue({
      data: {
        mediaInfo: {
          status: 4,
          seasons: [
            { seasonNumber: 1, status: 5 },
            { seasonNumber: 2, status: 2 },
          ],
        },
      },
    });

    const result = await checkMediaStatus(1399, "tv", ["1"], "http://seerr", "key");
    expect(result.available).toBe(true); // season 1 is available
  });

  it("returns no mediaInfo gracefully", async () => {
    axios.get.mockResolvedValue({
      data: {},
    });

    const result = await checkMediaStatus(123, "movie", [], "http://seerr", "key");
    expect(result.exists).toBe(true);
    expect(result.status).toBeUndefined();
  });
});

describe("sendRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends movie request with correct payload", async () => {
    axios.post.mockResolvedValue({ data: { id: 1 } });

    await sendRequest({
      tmdbId: 550,
      mediaType: "movie",
      seerrUrl: "http://seerr",
      apiKey: "key",
    });

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, payload] = axios.post.mock.calls[0];
    expect(url).toContain("/request");
    expect(payload.mediaType).toBe("movie");
    expect(payload.mediaId).toBe(550);
  });

  it("sends TV request with seasons", async () => {
    axios.post.mockResolvedValue({ data: { id: 2 } });

    await sendRequest({
      tmdbId: 1399,
      mediaType: "tv",
      seasons: [1, 2, 3],
      seerrUrl: "http://seerr",
      apiKey: "key",
    });

    const [, payload] = axios.post.mock.calls[0];
    expect(payload.mediaType).toBe("tv");
    expect(payload.seasons).toEqual([1, 2, 3]);
  });

  it("sends empty seasons array for 'all'", async () => {
    axios.post.mockResolvedValue({ data: { id: 3 } });

    await sendRequest({
      tmdbId: 1399,
      mediaType: "tv",
      seasons: ["all"],
      seerrUrl: "http://seerr",
      apiKey: "key",
    });

    const [, payload] = axios.post.mock.calls[0];
    expect(payload.seasons).toEqual([]);
  });

  it("includes tags in payload", async () => {
    axios.post.mockResolvedValue({ data: { id: 4 } });

    await sendRequest({
      tmdbId: 550,
      mediaType: "movie",
      tags: [1, 2],
      seerrUrl: "http://seerr",
      apiKey: "key",
    });

    const [, payload] = axios.post.mock.calls[0];
    expect(payload.tags).toEqual([1, 2]);
  });

  it("sets isAutoApproved=false by default", async () => {
    axios.post.mockResolvedValue({ data: {} });

    await sendRequest({
      tmdbId: 550,
      mediaType: "movie",
      seerrUrl: "http://seerr",
      apiKey: "key",
    });

    const [, payload] = axios.post.mock.calls[0];
    expect(payload.isAutoApproved).toBe(false);
  });

  it("sets x-api-user header when auto-approve is off and user mapped", async () => {
    axios.post.mockResolvedValue({ data: {} });

    await sendRequest({
      tmdbId: 550,
      mediaType: "movie",
      seerrUrl: "http://seerr",
      apiKey: "key",
      isAutoApproved: false,
      discordUserId: "discord123",
      userMappings: [{ discordUserId: "discord123", seerrUserId: 5 }],
    });

    const [, , config] = axios.post.mock.calls[0];
    expect(config.headers["x-api-user"]).toBe("5");
  });

  it("throws on API error", async () => {
    const err = new Error("Forbidden");
    err.response = { status: 403, data: { message: "Quota exceeded" } };
    axios.post.mockRejectedValue(err);

    await expect(
      sendRequest({
        tmdbId: 550,
        mediaType: "movie",
        seerrUrl: "http://seerr",
        apiKey: "key",
      })
    ).rejects.toThrow("Forbidden");
  });
});
