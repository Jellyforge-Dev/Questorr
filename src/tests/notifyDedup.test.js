import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/configFile.js", () => ({ CONFIG_PATH: "C:/Users/phili/AppData/Local/Temp/questorr-notifydedup-test/config.json" }));
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { markNotified, wasRecentlyNotified } = await import("../utils/notifyDedup.js");

describe("notifyDedup TTL", () => {
  beforeEach(() => vi.useRealTimers());

  it("is recently notified immediately after marking", () => {
    markNotified("movie", "ttl-test-1");
    expect(wasRecentlyNotified("movie", "ttl-test-1")).toBe(true);
  });

  it("a custom short ttlMs expires independently of the 48h default", () => {
    vi.useFakeTimers();
    try {
      markNotified("approval", "ttl-test-2", undefined, 1000); // 1s TTL
      expect(wasRecentlyNotified("approval", "ttl-test-2")).toBe(true);
      vi.advanceTimersByTime(1500);
      expect(wasRecentlyNotified("approval", "ttl-test-2")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("without a custom ttlMs, an entry is still recently-notified after a short time (default 48h TTL)", () => {
    vi.useFakeTimers();
    try {
      markNotified("approval", "ttl-test-3");
      vi.advanceTimersByTime(60 * 60 * 1000); // 1h — well inside the 48h default
      expect(wasRecentlyNotified("approval", "ttl-test-3")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
