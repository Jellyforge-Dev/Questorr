import { describe, it, expect } from "vitest";
import { parseLine, filterEntries, paginate } from "../routes/logRoutes.js";

describe("parseLine", () => {
  it("parses a JSON log line", () => {
    const e = parseLine(JSON.stringify({ timestamp: "2026-06-29 10:00:00", level: "info", message: "[Jellyfin Poller] New Movie" }));
    expect(e).toEqual({ timestamp: "2026-06-29 10:00:00", level: "info", message: "[Jellyfin Poller] New Movie" });
  });

  it("parses the human console format", () => {
    const e = parseLine("2026-06-29 10:00:00 warn: [SEERR WEBHOOK] DM skipped");
    expect(e).toEqual({ timestamp: "2026-06-29 10:00:00", level: "warn", message: "[SEERR WEBHOOK] DM skipped" });
  });

  it("falls back for unrecognised lines", () => {
    const e = parseLine("some bare text");
    expect(e.level).toBe("unknown");
    expect(e.message).toBe("some bare text");
  });
});

const sample = [
  { timestamp: "t1", level: "info", message: "[Jellyfin Poller] New Movie: Dune" },
  { timestamp: "t2", level: "warn", message: "[SEERR WEBHOOK] DM skipped for bob" },
  { timestamp: "t3", level: "error", message: "[Jellyfin Poller] Poll error: boom" },
  { timestamp: "t4", level: "debug", message: "[TMDB] lookup 550" },
];

describe("filterEntries", () => {
  it("returns everything when no filters are set", () => {
    expect(filterEntries(sample, {}).length).toBe(4);
    expect(filterEntries(sample, { level: "all", source: "all" }).length).toBe(4);
  });

  it("filters by level (case-insensitive)", () => {
    expect(filterEntries(sample, { level: "ERROR" }).map((e) => e.timestamp)).toEqual(["t3"]);
  });

  it("filters by source tag", () => {
    const r = filterEntries(sample, { source: "[Jellyfin Poller]" });
    expect(r.map((e) => e.timestamp)).toEqual(["t1", "t3"]);
  });

  it("filters by free-text (case-insensitive)", () => {
    expect(filterEntries(sample, { q: "dune" }).map((e) => e.timestamp)).toEqual(["t1"]);
  });

  it("combines filters (AND)", () => {
    expect(filterEntries(sample, { level: "info", source: "[Jellyfin Poller]" }).map((e) => e.timestamp)).toEqual(["t1"]);
    expect(filterEntries(sample, { level: "warn", source: "[Jellyfin Poller]" })).toEqual([]);
  });
});

describe("paginate", () => {
  it("returns the first page with hasMore", () => {
    const r = paginate(sample, 0, 2);
    expect(r.page.map((e) => e.timestamp)).toEqual(["t1", "t2"]);
    expect(r.total).toBe(4);
    expect(r.hasMore).toBe(true);
  });

  it("returns the last page without hasMore", () => {
    const r = paginate(sample, 2, 2);
    expect(r.page.map((e) => e.timestamp)).toEqual(["t3", "t4"]);
    expect(r.hasMore).toBe(false);
  });

  it("clamps a negative offset and caps the limit", () => {
    const r = paginate(sample, -5, 1);
    expect(r.offset).toBe(0);
    expect(r.page.map((e) => e.timestamp)).toEqual(["t1"]);
    expect(r.hasMore).toBe(true);
  });

  it("handles an offset past the end", () => {
    const r = paginate(sample, 99, 10);
    expect(r.page).toEqual([]);
    expect(r.hasMore).toBe(false);
  });
});
