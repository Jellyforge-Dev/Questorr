import { describe, it, expect, afterEach } from "vitest";
import { embedImagesEnabled, setEmbedImage, setEmbedThumbnail } from "../utils/embedImages.js";
import { isLikelyPublicUrl } from "../utils/url.js";

const originalValue = process.env.EMBED_SHOW_IMAGES;
afterEach(() => {
  if (originalValue === undefined) delete process.env.EMBED_SHOW_IMAGES;
  else process.env.EMBED_SHOW_IMAGES = originalValue;
});

describe("embedImagesEnabled", () => {
  it("defaults to true when unset", () => {
    delete process.env.EMBED_SHOW_IMAGES;
    expect(embedImagesEnabled()).toBe(true);
  });

  it("is true for any value except 'false'", () => {
    process.env.EMBED_SHOW_IMAGES = "true";
    expect(embedImagesEnabled()).toBe(true);
  });

  it("is false only for 'false'", () => {
    process.env.EMBED_SHOW_IMAGES = "false";
    expect(embedImagesEnabled()).toBe(false);
  });
});

describe("setEmbedImage / setEmbedThumbnail", () => {
  const makeEmbed = () => {
    const calls = { image: null, thumb: null };
    return {
      calls,
      setImage(url) { calls.image = url; return this; },
      setThumbnail(url) { calls.thumb = url; return this; },
    };
  };

  it("applies a valid image when enabled", () => {
    process.env.EMBED_SHOW_IMAGES = "true";
    const e = makeEmbed();
    setEmbedImage(e, "https://image.tmdb.org/t/p/w1280/x.jpg");
    expect(e.calls.image).toBe("https://image.tmdb.org/t/p/w1280/x.jpg");
  });

  it("skips the image entirely when disabled", () => {
    process.env.EMBED_SHOW_IMAGES = "false";
    const e = makeEmbed();
    setEmbedImage(e, "https://image.tmdb.org/t/p/w1280/x.jpg");
    setEmbedThumbnail(e, "https://image.tmdb.org/t/p/w500/x.jpg");
    expect(e.calls.image).toBe(null);
    expect(e.calls.thumb).toBe(null);
  });

  it("skips invalid or empty URLs even when enabled", () => {
    process.env.EMBED_SHOW_IMAGES = "true";
    const e = makeEmbed();
    setEmbedImage(e, "");
    setEmbedThumbnail(e, "not a url");
    expect(e.calls.image).toBe(null);
    expect(e.calls.thumb).toBe(null);
  });
});

describe("isLikelyPublicUrl", () => {
  it("accepts public hostnames", () => {
    expect(isLikelyPublicUrl("https://jellyfin.example.com")).toBe(true);
    expect(isLikelyPublicUrl("https://media.mydomain.org/sub")).toBe(true);
  });

  it("rejects loopback and localhost", () => {
    expect(isLikelyPublicUrl("http://localhost:8096")).toBe(false);
    expect(isLikelyPublicUrl("http://127.0.0.1:8096")).toBe(false);
  });

  it("rejects RFC1918 private ranges", () => {
    expect(isLikelyPublicUrl("http://192.168.1.50:8096")).toBe(false);
    expect(isLikelyPublicUrl("http://10.0.0.5:8096")).toBe(false);
    expect(isLikelyPublicUrl("http://172.16.4.4:8096")).toBe(false);
    expect(isLikelyPublicUrl("http://172.31.255.1")).toBe(false);
  });

  it("rejects .local mDNS hostnames", () => {
    expect(isLikelyPublicUrl("http://nas.local:8096")).toBe(false);
  });

  it("accepts 172.x outside the private block", () => {
    expect(isLikelyPublicUrl("http://172.32.0.1:8096")).toBe(true);
    expect(isLikelyPublicUrl("http://172.15.0.1:8096")).toBe(true);
  });

  it("rejects garbage input", () => {
    expect(isLikelyPublicUrl("")).toBe(false);
    expect(isLikelyPublicUrl("not a url")).toBe(false);
    expect(isLikelyPublicUrl(undefined)).toBe(false);
  });
});
