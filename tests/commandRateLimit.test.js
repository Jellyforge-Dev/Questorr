import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkCommandRateLimit, _resetForTest } from "../bot/commandRateLimit.js";

describe("checkCommandRateLimit", () => {
  beforeEach(() => {
    _resetForTest();
  });

  it("allows first command from a user", () => {
    expect(checkCommandRateLimit("user1", 5)).toBe(true);
  });

  it("allows commands up to the limit", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkCommandRateLimit("user1", 5)).toBe(true);
    }
  });

  it("blocks commands beyond the limit", () => {
    for (let i = 0; i < 5; i++) {
      checkCommandRateLimit("user1", 5);
    }
    expect(checkCommandRateLimit("user1", 5)).toBe(false);
  });

  it("tracks users independently", () => {
    for (let i = 0; i < 5; i++) {
      checkCommandRateLimit("user1", 5);
    }
    expect(checkCommandRateLimit("user1", 5)).toBe(false);
    expect(checkCommandRateLimit("user2", 5)).toBe(true);
  });

  it("resets after window expires", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) {
      checkCommandRateLimit("user1", 5);
    }
    expect(checkCommandRateLimit("user1", 5)).toBe(false);

    vi.advanceTimersByTime(61000);
    expect(checkCommandRateLimit("user1", 5)).toBe(true);
    vi.useRealTimers();
  });

  it("returns true when limit is 0 (disabled)", () => {
    expect(checkCommandRateLimit("user1", 0)).toBe(true);
  });
});
