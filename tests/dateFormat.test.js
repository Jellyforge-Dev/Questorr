import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { formatDate, formatTime } from "../utils/dateFormat.js";

describe("formatDate 'auto' mode across all 6 supported languages", () => {
  const d = new Date(2026, 4, 7); // 7 May 2026, local time — avoids UTC offset issues

  afterEach(() => {
    delete process.env.BOT_LANGUAGE;
    delete process.env.DATE_FORMAT;
  });

  it("uses US format for en", () => {
    process.env.BOT_LANGUAGE = "en";
    expect(formatDate(d)).toBe("5/7/2026");
  });

  it("uses German format for de", () => {
    process.env.BOT_LANGUAGE = "de";
    expect(formatDate(d)).toBe("7.5.2026");
  });

  it("uses French format for fr", () => {
    process.env.BOT_LANGUAGE = "fr";
    expect(formatDate(d)).toBe("07/05/2026");
  });

  it("uses Spanish format for es", () => {
    process.env.BOT_LANGUAGE = "es";
    expect(formatDate(d)).toBe("7/5/2026");
  });

  it("uses Brazilian Portuguese format for pt_br", () => {
    process.env.BOT_LANGUAGE = "pt_br";
    expect(formatDate(d)).toBe("07/05/2026");
  });

  it("uses Swedish format for sv", () => {
    process.env.BOT_LANGUAGE = "sv";
    expect(formatDate(d)).toBe("2026-05-07");
  });

  it("falls back to en-US when BOT_LANGUAGE is unset", () => {
    expect(formatDate(d)).toBe("5/7/2026");
  });

  it("an explicit DATE_FORMAT overrides BOT_LANGUAGE for every language", () => {
    process.env.BOT_LANGUAGE = "fr";
    process.env.DATE_FORMAT = "yyyy-mm-dd";
    expect(formatDate(d)).toBe("2026-05-07");
  });
});

describe("formatTime 'auto' mode across all 6 supported languages", () => {
  beforeEach(() => { process.env.TIME_FORMAT = "auto"; });
  afterEach(() => {
    delete process.env.BOT_LANGUAGE;
    delete process.env.TIME_FORMAT;
  });

  it("uses 12h AM/PM for en", () => {
    process.env.BOT_LANGUAGE = "en";
    expect(formatTime("20:30")).toBe("8:30 PM");
  });

  it("uses 24h for de", () => {
    process.env.BOT_LANGUAGE = "de";
    expect(formatTime("20:30")).toBe("20:30");
  });

  it("uses 24h for fr", () => {
    process.env.BOT_LANGUAGE = "fr";
    expect(formatTime("20:30")).toBe("20:30");
  });

  it("uses 24h for es", () => {
    process.env.BOT_LANGUAGE = "es";
    expect(formatTime("20:30")).toBe("20:30");
  });

  it("uses 24h for pt_br", () => {
    process.env.BOT_LANGUAGE = "pt_br";
    expect(formatTime("20:30")).toBe("20:30");
  });

  it("uses 24h for sv", () => {
    process.env.BOT_LANGUAGE = "sv";
    expect(formatTime("20:30")).toBe("20:30");
  });

  it("an explicit TIME_FORMAT overrides BOT_LANGUAGE for every language", () => {
    process.env.BOT_LANGUAGE = "de";
    process.env.TIME_FORMAT = "12h";
    expect(formatTime("20:30")).toBe("8:30 PM");
  });
});
