import { describe, it, expect, vi } from "vitest";

vi.mock("../utils/logger.js", () => ({ default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("axios", () => ({ default: { get: vi.fn() } }));
vi.mock("discord.js", () => ({ EmbedBuilder: class { setColor(){return this;} setTitle(){return this;} setDescription(){return this;} setTimestamp(){return this;} } }));
vi.mock("../utils/botStrings.js", () => ({ t: (k) => k }));

import { computeTransitions } from "../bot/healthAlertPoller.js";

describe("computeTransitions", () => {
  it("never alerts on a baseline (no previous state)", () => {
    expect(computeTransitions({}, { seerr: "reachable", jellyfin: "unreachable" })).toEqual([]);
  });

  it("alerts down when a service goes reachable → unreachable", () => {
    expect(computeTransitions({ seerr: "reachable" }, { seerr: "unreachable" }))
      .toEqual([{ service: "seerr", type: "down" }]);
  });

  it("alerts up only on unreachable → reachable", () => {
    expect(computeTransitions({ jellyfin: "unreachable" }, { jellyfin: "reachable" }))
      .toEqual([{ service: "jellyfin", type: "up" }]);
  });

  it("does not alert when state is unchanged", () => {
    expect(computeTransitions({ seerr: "reachable" }, { seerr: "reachable" })).toEqual([]);
    expect(computeTransitions({ seerr: "unreachable" }, { seerr: "unreachable" })).toEqual([]);
  });

  it("handles multiple services at once", () => {
    const out = computeTransitions(
      { seerr: "reachable", jellyfin: "unreachable" },
      { seerr: "unreachable", jellyfin: "reachable" }
    );
    expect(out).toEqual([
      { service: "seerr", type: "down" },
      { service: "jellyfin", type: "up" },
    ]);
  });
});
