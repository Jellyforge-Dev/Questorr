import { describe, it, expect } from "vitest";
import { redactSecrets } from "../utils/redact.js";

describe("redactSecrets", () => {
  it("redacts X-Api-Key header values", () => {
    expect(redactSecrets('headers: { "X-Api-Key": "REPLACE_ME" }')).not.toContain("REPLACE_ME");
    expect(redactSecrets('X-Api-Key: REPLACE_ME')).toContain("<redacted>");
  });

  it("redacts api_key query parameters in URLs", () => {
    const out = redactSecrets("GET https://api.themoviedb.org/3/movie/550?api_key=deadbeefdeadbeef&language=de");
    expect(out).not.toContain("deadbeefdeadbeef");
    expect(out).toContain("language=de"); // non-secret params untouched
  });

  it("redacts Bearer tokens", () => {
    const out = redactSecrets("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature");
    expect(out).not.toContain("eyJhbGciOiJIUzI1NiJ9.payload.signature");
    expect(out).toContain("<redacted>");
  });

  it("redacts apiKey / token / password assignments", () => {
    expect(redactSecrets('apiKey="REPLACE_ME"')).not.toContain("REPLACE_ME");
    expect(redactSecrets("password: hunter2hunter2")).not.toContain("hunter2hunter2");
    expect(redactSecrets("token=ghp_abcdef 1234567890")).not.toContain("ghp_abcdefg");
  });

  it("leaves ordinary messages untouched", () => {
    const msg = "[Jellyfin Poller] Sent notification for \"Dune\" to channel 12345";
    expect(redactSecrets(msg)).toBe(msg);
  });

  it("handles non-string input gracefully", () => {
    expect(redactSecrets(undefined)).toBe(undefined);
    expect(redactSecrets(42)).toBe(42);
  });
});
