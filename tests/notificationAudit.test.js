import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "questorr-audit-"));
vi.mock("../utils/configFile.js", () => ({
  CONFIG_PATH: path.join(TMP_DIR, "config.json"),
}));
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const audit = await import("../utils/notificationAudit.js");

beforeEach(() => audit.clear());
afterAll(() => fs.rmSync(TMP_DIR, { recursive: true, force: true }));

describe("notificationAudit", () => {
  it("records entries and returns them newest-first with a timestamp", () => {
    audit.recordNotification({ eventType: "MEDIA_AVAILABLE", tmdbId: 1, source: "seerr-webhook", status: "posted" });
    audit.recordNotification({ eventType: "MEDIA_AVAILABLE", tmdbId: 2, source: "jellyfin-poller", status: "skipped" });

    const recent = audit.getRecentNotifications(10);
    expect(recent).toHaveLength(2);
    expect(recent[0].tmdbId).toBe(2); // newest first
    expect(recent[1].tmdbId).toBe(1);
    expect(recent[0].at).toBeTypeOf("string");
  });

  it("caps the buffer at the max size", () => {
    for (let i = 0; i < 250; i++) audit.recordNotification({ tmdbId: i, status: "posted" });
    const all = audit.getRecentNotifications(1000);
    expect(all.length).toBeLessThanOrEqual(200);
    // newest retained
    expect(all[0].tmdbId).toBe(249);
  });

  it("persists across a reload (save then load)", () => {
    audit.recordNotification({ eventType: "MEDIA_AVAILABLE", tmdbId: 42, source: "seerr-webhook", status: "posted" });
    audit.clear();
    expect(audit.getRecentNotifications()).toEqual([]);
    audit.load();
    expect(audit.getRecentNotifications()[0].tmdbId).toBe(42);
  });
});
