import { describe, it, expect } from "vitest";
import { stripOrphanedConfigKeys } from "../utils/configFile.js";

describe("stripOrphanedConfigKeys", () => {
  it("removes all known orphaned keys and reports a change", () => {
    const config = {
      STREAMYSTATS_URL: "http://example.local:3000",
      STREAMYSTATS_USER: "admin",
      STREAMYSTATS_PASS: "secret",
      PRIVATE_MESSAGE_MODE: "false",
      WEBHOOK_DEBOUNCE_MS: "15000",
      EMBED_SHOW_BACKDROP: "true",
      EMBED_SHOW_OVERVIEW: "true",
      EMBED_SHOW_GENRE: "true",
      EMBED_SHOW_RUNTIME: "true",
      EMBED_SHOW_RATING: "true",
      EMBED_COLOR_MOVIE: "#1ec8a0",
      EMBED_COLOR_SERIES: "#1ec8a0",
      EMBED_COLOR_SEASON: "#17b8c4",
      EMBED_COLOR_EPISODE_SINGLE: "#17b8c4",
      EMBED_COLOR_EPISODE_FEW: "#17b8c4",
      EMBED_COLOR_EPISODE_MANY: "#17b8c4",
      SEERR_URL: "http://seerr.local:5055",
    };
    const changed = stripOrphanedConfigKeys(config);
    expect(changed).toBe(true);
    expect(config).toEqual({ SEERR_URL: "http://seerr.local:5055" });
  });

  it("removes only the orphaned keys that are actually present", () => {
    const config = { STREAMYSTATS_URL: "http://example.local:3000", SEERR_URL: "x" };
    const changed = stripOrphanedConfigKeys(config);
    expect(changed).toBe(true);
    expect(config).toEqual({ SEERR_URL: "x" });
  });

  it("is a no-op on a config with none of the orphaned keys", () => {
    const config = { SEERR_URL: "x", JELLYFIN_API_KEY: "y" };
    const changed = stripOrphanedConfigKeys(config);
    expect(changed).toBe(false);
    expect(config).toEqual({ SEERR_URL: "x", JELLYFIN_API_KEY: "y" });
  });
});
