import { describe, it, expect, vi } from "vitest";
import { runPreflight, checkUserMappings } from "../utils/preflight.js";

describe("runPreflight", () => {
  it("runs all checks and returns name/ok/detailKey/params per check", async () => {
    const results = await runPreflight({
      seerr: async () => ({ ok: true, detailKey: "preflight_seerr_connected", params: { version: "1.2" } }),
      jellyfin: async () => ({ ok: false, detailKey: "preflight_not_configured" }),
    });
    expect(results).toEqual(
      expect.arrayContaining([
        { name: "seerr", ok: true, detailKey: "preflight_seerr_connected", params: { version: "1.2" } },
        { name: "jellyfin", ok: false, detailKey: "preflight_not_configured", params: {} },
      ])
    );
  });

  it("isolates a throwing check as ok:false with the error key + message param", async () => {
    const results = await runPreflight({
      tmdb: async () => {
        throw new Error("401 invalid key");
      },
    });
    expect(results[0]).toEqual({
      name: "tmdb",
      ok: false,
      detailKey: "preflight_error_detail",
      params: { message: "401 invalid key" },
    });
  });

  it("runs checks in parallel (does not short-circuit on one failure)", async () => {
    const a = vi.fn(async () => ({ ok: false, detailKey: "x" }));
    const b = vi.fn(async () => ({ ok: true, detailKey: "y" }));
    await runPreflight({ a, b });
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });
});

describe("checkUserMappings", () => {
  it("ok when no mappings configured", () => {
    expect(checkUserMappings(undefined)).toEqual({ ok: true, detailKey: "preflight_mappings_none" });
    expect(checkUserMappings("").ok).toBe(true);
  });

  it("ok for a well-formed mapping array, with the count param", () => {
    const r = checkUserMappings(JSON.stringify([{ discordUserId: "1", seerrUserId: "2" }]));
    expect(r).toEqual({ ok: true, detailKey: "preflight_mappings_ok", params: { count: 1 } });
  });

  it("fails on invalid JSON", () => {
    expect(checkUserMappings("{ not json")).toEqual({ ok: false, detailKey: "preflight_mappings_not_json" });
  });

  it("fails when not an array", () => {
    expect(checkUserMappings(JSON.stringify({ foo: "bar" })).detailKey).toBe("preflight_mappings_not_array");
  });

  it("fails when an entry is missing discordUserId or seerrUserId", () => {
    const r = checkUserMappings(JSON.stringify([{ discordUserId: "1" }]));
    expect(r.ok).toBe(false);
    expect(r.detailKey).toBe("preflight_mappings_incomplete");
    expect(r.params.count).toBe(1);
  });
});
