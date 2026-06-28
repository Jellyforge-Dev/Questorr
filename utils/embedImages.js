import { isValidUrl } from "./url.js";

// Central master switch for poster/backdrop images on all Discord embeds.
// Defaults to enabled; only the literal string "false" turns images off.
export function embedImagesEnabled() {
  return process.env.EMBED_SHOW_IMAGES !== "false";
}

// Sets the large embed image (backdrop) when images are enabled and the URL is
// valid. No-op otherwise. Returns the embed for chaining.
export function setEmbedImage(embed, url) {
  if (embedImagesEnabled() && isValidUrl(url)) embed.setImage(url);
  return embed;
}

// Sets the small embed thumbnail (poster) when images are enabled and the URL
// is valid. No-op otherwise. Returns the embed for chaining.
export function setEmbedThumbnail(embed, url) {
  if (embedImagesEnabled() && isValidUrl(url)) embed.setThumbnail(url);
  return embed;
}
