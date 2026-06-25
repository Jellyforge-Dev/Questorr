import { describe, it, expect } from "vitest";
import {
  seerrConnectionSchema,
  jellyfinConnectionSchema,
  pollNowSchema,
} from "../utils/validation.js";

const ok = (schema, value) => expect(schema.validate(value).error).toBeUndefined();
const bad = (schema, value) => expect(schema.validate(value).error).toBeDefined();

describe("seerrConnectionSchema", () => {
  it("accepts a url + apiKey", () => ok(seerrConnectionSchema, { url: "http://seerr:5055", apiKey: "abc123" }));
  it("rejects a missing url", () => bad(seerrConnectionSchema, { apiKey: "abc123" }));
  it("rejects a missing apiKey", () => bad(seerrConnectionSchema, { url: "http://seerr:5055" }));
  it("rejects a non-string url", () => bad(seerrConnectionSchema, { url: 12345, apiKey: "abc" }));
  it("rejects an oversized url", () => bad(seerrConnectionSchema, { url: "http://" + "x".repeat(3000), apiKey: "abc" }));
});

describe("jellyfinConnectionSchema", () => {
  it("accepts url alone (apiKey optional — test uses saved key)", () =>
    ok(jellyfinConnectionSchema, { url: "http://jellyfin:8096" }));
  it("accepts url + apiKey", () => ok(jellyfinConnectionSchema, { url: "http://jellyfin:8096", apiKey: "k" }));
  it("rejects a missing url", () => bad(jellyfinConnectionSchema, {}));
});

describe("pollNowSchema", () => {
  it("accepts an empty body", () => ok(pollNowSchema, {}));
  it("accepts a numeric limit", () => ok(pollNowSchema, { limit: 50 }));
  it("coerces a numeric-string limit", () => {
    const { error, value } = pollNowSchema.validate({ limit: "50" });
    expect(error).toBeUndefined();
    expect(value.limit).toBe(50);
  });
  it("rejects a non-numeric limit", () => bad(pollNowSchema, { limit: "abc" }));
  it("rejects an absurd limit", () => bad(pollNowSchema, { limit: 999999 }));
});
