import { describe, it, expect } from "vitest";
import { isDisallowedIntentsError } from "../bot/botManager.js";

describe("isDisallowedIntentsError", () => {
  it("matches discord.js's DisallowedIntents error by name", () => {
    const err = new Error("Privileged intent provided is not enabled or whitelisted.");
    err.name = "DisallowedIntents";
    expect(isDisallowedIntentsError(err)).toBe(true);
  });

  it("matches by message substring even without the exact error name", () => {
    const err = new Error("Used disallowed intents");
    expect(isDisallowedIntentsError(err)).toBe(true);
  });

  it("is case-insensitive on the message", () => {
    const err = new Error("DISALLOWED INTENT: GuildMembers");
    expect(isDisallowedIntentsError(err)).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isDisallowedIntentsError(new Error("Invalid token"))).toBe(false);
    expect(isDisallowedIntentsError(new Error("Network timeout"))).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isDisallowedIntentsError(null)).toBe(false);
    expect(isDisallowedIntentsError(undefined)).toBe(false);
  });
});
