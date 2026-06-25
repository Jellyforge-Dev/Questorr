import { describe, it, expect, beforeEach } from "vitest";
import { getUserMappingsFromEnv } from "../bot/helpers.js";

beforeEach(() => {
  delete process.env.USER_MAPPINGS;
});

describe("getUserMappingsFromEnv", () => {
  it("parses a JSON-string array from the env var", () => {
    process.env.USER_MAPPINGS = JSON.stringify([{ discordUserId: "1", seerrUserId: 2 }]);
    expect(getUserMappingsFromEnv()).toEqual([{ discordUserId: "1", seerrUserId: 2 }]);
  });

  it("returns an empty array when unset", () => {
    expect(getUserMappingsFromEnv()).toEqual([]);
  });

  it("returns an empty array for malformed JSON", () => {
    process.env.USER_MAPPINGS = "{ not json";
    expect(getUserMappingsFromEnv()).toEqual([]);
  });

  it("returns an empty array when the parsed value isn't an array", () => {
    process.env.USER_MAPPINGS = JSON.stringify({ foo: "bar" });
    expect(getUserMappingsFromEnv()).toEqual([]);
  });
});
