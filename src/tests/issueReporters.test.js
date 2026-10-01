import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "questorr-issue-rep-"));
vi.mock("../utils/configFile.js", () => ({ CONFIG_PATH: path.join(TMP_DIR, "config.json") }));
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const store = await import("../utils/issueReporters.js");

beforeEach(() => store.clear());
afterAll(() => fs.rmSync(TMP_DIR, { recursive: true, force: true }));

describe("issueReporters", () => {
  it("records and looks up a reporter by issue id (string-keyed)", () => {
    store.recordIssueReporter(42, "123456789012345678", "Dune (2021)");
    const got = store.getIssueReporter("42");
    expect(got.discordUserId).toBe("123456789012345678");
    expect(got.title).toBe("Dune (2021)");
  });

  it("ignores records missing an id or user", () => {
    store.recordIssueReporter(null, "u", "x");
    store.recordIssueReporter(7, "", "x");
    expect(store.getIssueReporter("7")).toBeNull();
  });

  it("removes a mapping", () => {
    store.recordIssueReporter(9, "u9", "t");
    store.removeIssueReporter("9");
    expect(store.getIssueReporter(9)).toBeNull();
  });

  it("persists across reload", async () => {
    store.recordIssueReporter(99, "u99", "Persisted");
    vi.resetModules();
    const reloaded = await import("../utils/issueReporters.js");
    expect(reloaded.getIssueReporter("99").discordUserId).toBe("u99");
  });
});
