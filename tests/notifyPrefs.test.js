import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "questorr-notifyprefs-"));
vi.mock("../utils/configFile.js", () => ({ CONFIG_PATH: path.join(TMP_DIR, "config.json") }));
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const prefs = await import("../utils/notifyPrefs.js");

beforeEach(() => prefs.clear());
afterAll(() => fs.rmSync(TMP_DIR, { recursive: true, force: true }));

describe("notifyPrefs", () => {
  it("defaults to disabled", () => {
    expect(prefs.isNotifyEnabled("user-1")).toBe(false);
  });

  it("enables and disables per user, returning the new state", () => {
    expect(prefs.setNotify("user-1", true)).toBe(true);
    expect(prefs.isNotifyEnabled("user-1")).toBe(true);
    expect(prefs.isNotifyEnabled("user-2")).toBe(false);

    expect(prefs.setNotify("user-1", false)).toBe(false);
    expect(prefs.isNotifyEnabled("user-1")).toBe(false);
  });

  it("toggles when no explicit state is given", () => {
    expect(prefs.toggleNotify("user-3")).toBe(true);
    expect(prefs.toggleNotify("user-3")).toBe(false);
  });

  it("persists across reload", () => {
    prefs.setNotify("user-9", true);
    prefs.clear();
    expect(prefs.isNotifyEnabled("user-9")).toBe(false);
    prefs.load();
    expect(prefs.isNotifyEnabled("user-9")).toBe(true);
  });
});
