import { describe, it, expect, vi } from "vitest";

// Mock logger
vi.mock("../utils/logger.js", () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { withRetry } from "../utils/axiosRetry.js";

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { label: "test" });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 503 and succeeds", async () => {
    const error503 = new Error("Service Unavailable");
    error503.response = { status: 503 };

    const fn = vi.fn()
      .mockRejectedValueOnce(error503)
      .mockResolvedValueOnce("recovered");

    const result = await withRetry(fn, { retries: 1, delay: 10, label: "test" });
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on ECONNRESET", async () => {
    const errReset = new Error("Connection reset");
    errReset.code = "ECONNRESET";

    const fn = vi.fn()
      .mockRejectedValueOnce(errReset)
      .mockResolvedValueOnce("ok");

    const result = await withRetry(fn, { retries: 1, delay: 10, label: "test" });
    expect(result).toBe("ok");
  });

  it("does NOT retry on 404", async () => {
    const error404 = new Error("Not found");
    error404.response = { status: 404 };

    const fn = vi.fn().mockRejectedValue(error404);

    await expect(withRetry(fn, { retries: 1, delay: 10, label: "test" }))
      .rejects.toThrow("Not found");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on 400", async () => {
    const error400 = new Error("Bad request");
    error400.response = { status: 400 };

    const fn = vi.fn().mockRejectedValue(error400);

    await expect(withRetry(fn, { retries: 1, delay: 10, label: "test" }))
      .rejects.toThrow("Bad request");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting retries", async () => {
    const error502 = new Error("Bad Gateway");
    error502.response = { status: 502 };

    const fn = vi.fn().mockRejectedValue(error502);

    await expect(withRetry(fn, { retries: 2, delay: 10, label: "test" }))
      .rejects.toThrow("Bad Gateway");
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("retries on 429 (rate limit)", async () => {
    const error429 = new Error("Too Many Requests");
    error429.response = { status: 429 };

    const fn = vi.fn()
      .mockRejectedValueOnce(error429)
      .mockResolvedValueOnce("ok");

    const result = await withRetry(fn, { retries: 1, delay: 10, label: "test" });
    expect(result).toBe("ok");
  });

  it("retries on ETIMEDOUT", async () => {
    const errTimeout = new Error("Timed out");
    errTimeout.code = "ETIMEDOUT";

    const fn = vi.fn()
      .mockRejectedValueOnce(errTimeout)
      .mockResolvedValueOnce("ok");

    const result = await withRetry(fn, { retries: 1, delay: 10, label: "test" });
    expect(result).toBe("ok");
  });
});
