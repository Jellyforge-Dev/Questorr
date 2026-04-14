import { describe, it, expect, afterEach } from "vitest";
import { resolveMediaTypeChannel } from "../seerrWebhook.js";

describe("resolveMediaTypeChannel", () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns CHANNEL_MOVIES for movie type", () => {
    process.env.CHANNEL_MOVIES = "111111111111111111";
    process.env.CHANNEL_SERIES = "222222222222222222";
    expect(resolveMediaTypeChannel("movie")).toBe("111111111111111111");
  });

  it("returns CHANNEL_SERIES for tv type", () => {
    process.env.CHANNEL_MOVIES = "111111111111111111";
    process.env.CHANNEL_SERIES = "222222222222222222";
    expect(resolveMediaTypeChannel("tv")).toBe("222222222222222222");
  });

  it("returns null when no mapping configured", () => {
    delete process.env.CHANNEL_MOVIES;
    delete process.env.CHANNEL_SERIES;
    expect(resolveMediaTypeChannel("movie")).toBeNull();
  });

  it("returns null for movie when only CHANNEL_SERIES set", () => {
    delete process.env.CHANNEL_MOVIES;
    process.env.CHANNEL_SERIES = "222222222222222222";
    expect(resolveMediaTypeChannel("movie")).toBeNull();
  });

  it("returns null for tv when only CHANNEL_MOVIES set", () => {
    process.env.CHANNEL_MOVIES = "111111111111111111";
    delete process.env.CHANNEL_SERIES;
    expect(resolveMediaTypeChannel("tv")).toBeNull();
  });

  it("returns null for unknown media type", () => {
    process.env.CHANNEL_MOVIES = "111111111111111111";
    process.env.CHANNEL_SERIES = "222222222222222222";
    expect(resolveMediaTypeChannel("person")).toBeNull();
  });
});
