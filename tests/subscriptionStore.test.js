import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "questorr-subs-"));
vi.mock("../utils/configFile.js", () => ({ CONFIG_PATH: path.join(TMP_DIR, "config.json") }));
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const store = await import("../utils/subscriptionStore.js");
const STORE_PATH = path.join(TMP_DIR, "subscription-store.json");

beforeEach(() => {
  store.clear();
  if (fs.existsSync(STORE_PATH)) fs.unlinkSync(STORE_PATH);
});
afterAll(() => fs.rmSync(TMP_DIR, { recursive: true, force: true }));

describe("series subscriptions", () => {
  it("adds a series and returns it for the user", () => {
    store.addSeries({ discordUserId: "u1", tmdbId: 1399, title: "GoT", seasonCount: 8 });
    const subs = store.getSeriesByUser("u1");
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ tmdbId: 1399, title: "GoT", seasonCount: 8 });
  });

  it("does not duplicate the same user+series", () => {
    store.addSeries({ discordUserId: "u1", tmdbId: 1399, title: "GoT", seasonCount: 8 });
    store.addSeries({ discordUserId: "u1", tmdbId: 1399, title: "GoT", seasonCount: 8 });
    expect(store.getSeriesByUser("u1")).toHaveLength(1);
  });

  it("removes a series", () => {
    store.addSeries({ discordUserId: "u1", tmdbId: 1399, title: "GoT", seasonCount: 8 });
    expect(store.removeSeries("u1", 1399)).toBe(true);
    expect(store.getSeriesByUser("u1")).toEqual([]);
  });

  it("updateSeasonCount changes the stored baseline", () => {
    store.addSeries({ discordUserId: "u1", tmdbId: 1399, title: "GoT", seasonCount: 7 });
    store.updateSeasonCount("u1", 1399, 8);
    expect(store.getSeriesByUser("u1")[0].seasonCount).toBe(8);
  });

  it("allSeries returns every subscription across users", () => {
    store.addSeries({ discordUserId: "u1", tmdbId: 1, title: "A", seasonCount: 1 });
    store.addSeries({ discordUserId: "u2", tmdbId: 2, title: "B", seasonCount: 1 });
    expect(store.allSeries()).toHaveLength(2);
  });
});

describe("weekly opt-in", () => {
  it("defaults to disabled and toggles", () => {
    expect(store.isWeeklyEnabled("u1")).toBe(false);
    expect(store.toggleWeekly("u1")).toBe(true);
    expect(store.isWeeklyEnabled("u1")).toBe(true);
    expect(store.toggleWeekly("u1")).toBe(false);
  });

  it("getWeeklyUsers lists opted-in users", () => {
    store.toggleWeekly("u1");
    store.toggleWeekly("u3");
    expect(store.getWeeklyUsers().sort()).toEqual(["u1", "u3"]);
  });
});

describe("persistence", () => {
  it("round-trips series + weekly through save/load", () => {
    store.addSeries({ discordUserId: "u1", tmdbId: 1399, title: "GoT", seasonCount: 8 });
    store.toggleWeekly("u1");
    store.save();

    store.clear();
    expect(store.getSeriesByUser("u1")).toEqual([]);
    expect(store.isWeeklyEnabled("u1")).toBe(false);

    store.load();
    expect(store.getSeriesByUser("u1")[0].tmdbId).toBe(1399);
    expect(store.isWeeklyEnabled("u1")).toBe(true);
  });

  it("starts empty on a corrupt file", () => {
    fs.writeFileSync(STORE_PATH, "{ broken");
    store.load();
    expect(store.allSeries()).toEqual([]);
  });
});
