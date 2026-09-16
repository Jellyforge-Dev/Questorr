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
