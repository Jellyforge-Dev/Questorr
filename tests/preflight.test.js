import { describe, it, expect, vi } from "vitest";
import { runPreflight, checkUserMappings } from "../utils/preflight.js";

describe("runPreflight", () => {
  it("runs all checks and returns name/ok/detail per check", async () => {
    const results = await runPreflight({
      seerr: async () => ({ ok: true, detail: "v1.2" }),
      jellyfin: async () => ({ ok: false, detail: "unreachable" }),
    });
    expect(results).toEqual(
      expect.arrayContaining([
        { name: "seerr", ok: true, detail: "v1.2" },
        { name: "jellyfin", ok: false, detail: "unreachable" },
      ])
    );
  });

  it("isolates a throwing check as ok:false with its message", async () => {
    const results = await runPreflight({
      tmdb: async () => {
        throw new Error("401 invalid key");
      },
    });
    expect(results[0]).toEqual({ name: "tmdb", ok: false, detail: "401 invalid key" });
  });

  it("runs checks in parallel (does not short-circuit on one failure)", async () => {
    const a = vi.fn(async () => ({ ok: false, detail: "x" }));
    const b = vi.fn(async () => ({ ok: true, detail: "y" }));
    await runPreflight({ a, b });
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });
});

describe("checkUserMappings", () => {
  it("ok when no mappings configured", () => {
    expect(checkUserMappings(undefined).ok).toBe(true);
    expect(checkUserMappings("").ok).toBe(true);
  });

  it("ok for a well-formed mapping array", () => {
    const r = checkUserMappings(JSON.stringify([{ discordUserId: "1", seerrUserId: "2" }]));
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("1");
  });

  it("fails on invalid JSON", () => {
    expect(checkUserMappings("{ not json").ok).toBe(false);
  });

  it("fails when not an array", () => {
    expect(checkUserMappings(JSON.stringify({ foo: "bar" })).ok).toBe(false);
  });

  it("fails when an entry is missing discordUserId or seerrUserId", () => {
    const r = checkUserMappings(JSON.stringify([{ discordUserId: "1" }]));
    expect(r.ok).toBe(false);
    expect(r.detail.length).toBeGreaterThan(0);
  });
});
