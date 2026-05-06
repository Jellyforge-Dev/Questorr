/**
 * Streamystats API client
 *
 * Fetches personalized media recommendations from a self-hosted Streamystats instance.
 * Streamystats builds vector embeddings from watch history to surface similar content.
 *
 * Auth: Jellyfin MediaBrowser Token (the admin API key works as an admin token).
 * Admins can request recommendations for any Jellyfin user via targetUserId.
 *
 * Docs: https://github.com/fredrikburmester/streamystats
 */

import axios from "axios";
import logger from "../utils/logger.js";

/**
 * Fetch personalized recommendations from Streamystats.
 *
 * @param {string} jellyfinApiKey  - Jellyfin admin API key, used as MediaBrowser Token.
 * @param {string} jellyfinBaseUrl - Jellyfin server URL — identifies the server in Streamystats.
 * @param {string} streamystatsUrl - Streamystats base URL (e.g. http://localhost:3000).
 * @param {object} [opts]
 * @param {string|null} [opts.jellyfinUserId] - Jellyfin user ID. Admins can supply any user's ID.
 * @param {number}      [opts.limit=5]        - Number of results (1-100).
 * @param {string}      [opts.type="all"]     - "Movie", "Series", or "all".
 * @param {string}      [opts.range="all"]    - "7d", "30d", "90d", "thisMonth", or "all".
 * @returns {Promise<Array<{
 *   jellyfinId: string,
 *   name: string,
 *   year: number|null,
 *   type: string,
 *   rating: number|null,
 *   similarity: number|null,
 *   reason: string|null,
 *   basedOn: string[]
 * }>>}
 */
export async function fetchStreamystatsRecommendations(
  jellyfinApiKey,
  jellyfinBaseUrl,
  streamystatsUrl,
  { jellyfinUserId = null, limit = 5, type = "all", range = "all" } = {}
) {
  const base = streamystatsUrl.replace(/\/$/, "");

  const params = {
    serverUrl: jellyfinBaseUrl,
    limit: Math.min(100, Math.max(1, limit)),
    type,
    range,
    includeBasedOn: "true",
    includeReasons: "true",
  };
  if (jellyfinUserId) params.targetUserId = jellyfinUserId;

  logger.info(
    `[Streamystats] GET /api/recommendations userId=${jellyfinUserId ?? "none"} limit=${params.limit} type=${type}`
  );

  const response = await axios.get(`${base}/api/recommendations`, {
    params,
    headers: {
      Authorization: `MediaBrowser Token="${jellyfinApiKey}"`,
    },
    timeout: 15000,
  });

  const data = response.data?.data ?? [];

  return data.map((entry) => ({
    jellyfinId: entry.item?.id ?? null,
    name: entry.item?.name || "Unknown",
    year: entry.item?.productionYear || null,
    type: entry.item?.type || "Movie",
    rating: entry.item?.communityRating ?? null,
    similarity: entry.similarity ?? null,
    reason: entry.reason ?? null,
    basedOn: Array.isArray(entry.basedOn)
      ? entry.basedOn.map((b) => b.name || "").filter(Boolean).slice(0, 3)
      : [],
  }));
}
