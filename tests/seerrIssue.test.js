import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("axios", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
// Pass through the retry wrapper so we assert the real axios call.
vi.mock("../utils/axiosRetry.js", () => ({ withRetry: (fn) => fn() }));

import axios from "axios";
import { createIssue, createIssueComment, updateIssueStatus } from "../api/seerr.js";

beforeEach(() => vi.clearAllMocks());

describe("createIssue", () => {
  it("POSTs to /issue with issueType, message and mediaId", async () => {
    axios.post.mockResolvedValue({ data: { id: 7 } });

    const result = await createIssue(42, 2, "No audio", "http://seerr.local/api/v1", "key123");

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body, opts] = axios.post.mock.calls[0];
    expect(url).toMatch(/\/issue$/);
    expect(body).toEqual({ issueType: 2, message: "No audio", mediaId: 42 });
    expect(opts.headers["X-Api-Key"]).toBe("key123");
    expect(result).toEqual({ id: 7 });
  });

  it("coerces issueType and mediaId to numbers and defaults an empty message", async () => {
    axios.post.mockResolvedValue({ data: {} });

    await createIssue("99", "4", undefined, "http://seerr.local/api/v1", "k");

    const [, body] = axios.post.mock.calls[0];
    expect(body.mediaId).toBe(99);
    expect(body.issueType).toBe(4);
    expect(body.message).toBe("");
    expect(body.problemSeason).toBeUndefined();
    expect(body.problemEpisode).toBeUndefined();
  });

  it("includes problemSeason/problemEpisode for a TV issue when provided", async () => {
    axios.post.mockResolvedValue({ data: { id: 9 } });

    await createIssue(5, 1, "Subs out of sync", "http://seerr.local/api/v1", "k", { season: 2, episode: 5 });

    const [, body] = axios.post.mock.calls[0];
    expect(body.problemSeason).toBe(2);
    expect(body.problemEpisode).toBe(5);
  });

  it("sets x-api-user when a mapped Seerr user id is provided, and omits it otherwise", async () => {
    axios.post.mockResolvedValue({ data: { id: 1 } });
    await createIssue(5, 1, "m", "http://seerr.local/api/v1", "k", { seerrUserId: 12 });
    expect(axios.post.mock.calls[0][2].headers["x-api-user"]).toBe("12");

    axios.post.mockClear();
    axios.post.mockResolvedValue({ data: { id: 2 } });
    await createIssue(5, 1, "m", "http://seerr.local/api/v1", "k", {});
    expect(axios.post.mock.calls[0][2].headers["x-api-user"]).toBeUndefined();
  });

  it("createIssueComment posts the message to /issue/:id/comment", async () => {
    axios.post.mockResolvedValue({ data: {} });
    await createIssueComment(33, "Looking into it", "http://seerr.local/api/v1", "k");
    const [url, body] = axios.post.mock.calls[0];
    expect(url).toMatch(/\/issue\/33\/comment$/);
    expect(body).toEqual({ message: "Looking into it" });
  });

  it("updateIssueStatus posts to /issue/:id/:status", async () => {
    axios.post.mockResolvedValue({ data: {} });
    await updateIssueStatus(33, "resolved", "http://seerr.local/api/v1", "k");
    expect(axios.post.mock.calls[0][0]).toMatch(/\/issue\/33\/resolved$/);
  });
});
