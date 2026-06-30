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
import { createIssue } from "../api/seerr.js";

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
  });
});
