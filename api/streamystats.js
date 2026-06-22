/**
 * Streamystats API client
 *
 * Fetches personalized media recommendations from a self-hosted Streamystats instance.
 * Streamystats builds vector embeddings from watch history to surface similar content.
 *
 * Auth strategy:
 *   Streamystats validates requests by calling Jellyfin's /Users/Me endpoint.
 *   Static Jellyfin API keys don't have a user session so they fail that check.
 *   We therefore use the POST endpoint which accepts Jellyfin username + password
 *   directly and authenticates server-side in one step.
 *
 *   The resulting Jellyfin session token is cached in memory (1 h TTL) and reused
 *   for GET requests. On 401 the cache is cleared and one retry is attempted.
 *
 * Docs: https://github.com/fredrikburmester/streamystats
 */

import axios from "axios";
import logger from "../utils/logger.js";

// ── In-memory session cache ──────────────────────────────────────────────────
let _cachedToken = null;       // Jellyfin session token from Streamystats auth
let _tokenExpiry = 0;          // epoch ms when we consider the token stale
const TOKEN_TTL_MS = 55 * 60 * 1000; // 55 minutes (Jellyfin sessions default 60 min)

function getCachedToken() {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;
  return null;
}

function setCachedToken(token) {
  _cachedToken = token;
  _tokenExpiry = Date.now() + TOKEN_TTL_MS;
}

function clearCachedToken() {
  _cachedToken = null;
  _tokenExpiry = 0;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseResponse(response) {
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

/**
 * Authenticate via Streamystats POST endpoint using Jellyfin credentials.
 * The POST body can include username+password alongside recommendation params.
 * Returns the Jellyfin session token extracted from the response.
 */
async function authenticateAndFetch(base, jellyfinBaseUrl, username, password, queryParams) {
  logger.info(`[Streamystats] POST /api/recommendations (auth as "${username}")`);

  let response;
  try {
    response = await axios.post(
      `${base}/api/recommendations`,
      { username, password },
      {
        params: queryParams,
        headers: { "Content-Type": "application/json" },
        timeout: 15000,
      }
    );
  } catch (err) {
    // Surface the exact reason Streamystats rejected the request — usually
    // their response body contains a clear string like "Invalid credentials"
    // or "Server not found" that the bare 401 hides.
    const status = err?.response?.status;
    const body = err?.response?.data;
    const bodyStr = typeof body === "string"
      ? body.slice(0, 500)
      : JSON.stringify(body)?.slice(0, 500);
    if (status === 401) {
      logger.error(
        `[Streamystats] 401 — auth failed for user "${username}". Response body: ${bodyStr}`
      );
    } else if (status) {
      logger.error(
        `[Streamystats] HTTP ${status} from POST /api/recommendations. Response body: ${bodyStr}`
      );
    } else {
      logger.error(`[Streamystats] Network/timeout error: ${err?.message || err}`);
    }
    throw err;
  }

  // Streamystats may return the session token in a Set-Cookie or response header.
  // Extract it so we can reuse it for GET requests and avoid re-authing each call.
  const authHeader =
    response.headers?.["x-jellyfin-token"] ||
    response.headers?.["authorization"] ||
    null;

  if (authHeader) {
    const m = authHeader.match(/Token="([^"]+)"/i);
    if (m) setCachedToken(m[1]);
  }

  return parseResponse(response);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch personalized recommendations from Streamystats.
 *
 * Auth: uses Jellyfin username/password (STREAMYSTATS_USER / STREAMYSTATS_PASS)
 * to authenticate via the Streamystats POST endpoint. The resulting session token
 * is cached and reused for GET requests until it expires.
 *
 * @param {string} jellyfinBaseUrl - Jellyfin server URL — identifies the server in Streamystats.
 * @param {string} streamystatsUrl - Streamystats base URL (e.g. http://localhost:3000).
 * @param {string} username        - Jellyfin username (STREAMYSTATS_USER).
 * @param {string} password        - Jellyfin password (STREAMYSTATS_PASS).
 * @param {object} [opts]
 * @param {string|null} [opts.jellyfinUserId] - Jellyfin user ID for personalisation (admin only).
 * @param {number}      [opts.limit=5]        - Number of results (1-100).
 * @param {string}      [opts.type="all"]     - "Movie", "Series", or "all".
 * @param {string}      [opts.range="all"]    - "7d", "30d", "90d", "thisMonth", or "all".
 * @returns {Promise<Array>}
 */
export async function fetchStreamystatsRecommendations(
  jellyfinBaseUrl,
  streamystatsUrl,
  username,
  password,
  { jellyfinUserId = null, limit = 5, type = "all", range = "all" } = {}
) {
  const base = streamystatsUrl.replace(/\/$/, "");

  const queryParams = {
    serverUrl: jellyfinBaseUrl,
    limit: Math.min(100, Math.max(1, limit)),
    type,
    range,
    includeBasedOn: "true",
    includeReasons: "true",
  };
  if (jellyfinUserId) queryParams.targetUserId = jellyfinUserId;

  // ── Try cached token (GET) first ──────────────────────────────────────────
  const cachedToken = getCachedToken();
  if (cachedToken) {
    try {
      logger.info(
        `[Streamystats] GET /api/recommendations (cached token) userId=${jellyfinUserId ?? "none"}`
      );
      const response = await axios.get(`${base}/api/recommendations`, {
        params: queryParams,
        headers: { Authorization: `MediaBrowser Token="${cachedToken}"` },
        timeout: 15000,
      });
      return parseResponse(response);
    } catch (err) {
      if (err?.response?.status === 401) {
        logger.info("[Streamystats] Cached token expired — re-authenticating");
        clearCachedToken();
        // Fall through to POST auth below
      } else {
        throw err;
      }
    }
  }

  // ── Authenticate via POST and return results ──────────────────────────────
  return authenticateAndFetch(base, jellyfinBaseUrl, username, password, queryParams);
}
