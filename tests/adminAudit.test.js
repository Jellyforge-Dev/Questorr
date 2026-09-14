import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "questorr-admin-audit-"));
vi.mock("../utils/configFile.js", () => ({
  CONFIG_PATH: path.join(TMP_DIR, "config.json"),
}));
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const audit = await import("../utils/adminAudit.js");

beforeEach(() => audit.clear());
afterAll(() => fs.rmSync(TMP_DIR, { recursive: true, force: true }));

describe("adminAudit", () => {
  it("records entries newest-first with a timestamp", () => {
    audit.recordAudit({ actor: "max", action: "approve", target: "req#1" });
    audit.recordAudit({ actor: "lea", action: "config_update", target: "QUOTA_LIMIT" });

    const recent = audit.getRecentAudit(10);
    expect(recent).toHaveLength(2);
    expect(recent[0].actor).toBe("lea");
    expect(recent[1].actor).toBe("max");
    expect(typeof recent[0].at).toBe("string");
  });

  it("caps the buffer at the maximum and keeps the newest", () => {
    for (let i = 0; i < 550; i++) audit.recordAudit({ actor: "u", action: "x", target: String(i) });
    const all = audit.getRecentAudit(1000);
    expect(all.length).toBe(500);
    // newest is the last recorded
    expect(all[0].target).toBe("549");
    // oldest kept is 50 (0..49 dropped)
    expect(all[all.length - 1].target).toBe("50");
  });

  it("persists across a reload", async () => {
    audit.recordAudit({ actor: "admin", action: "bot_stop", target: "bot", detail: "127.0.0.1" });
    vi.resetModules();
    const reloaded = await import("../utils/adminAudit.js");
    const recent = reloaded.getRecentAudit(10);
    expect(recent.some((e) => e.action === "bot_stop" && e.detail === "127.0.0.1")).toBe(true);
  });
});
