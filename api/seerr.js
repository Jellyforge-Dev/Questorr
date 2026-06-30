/**
 * Seerr API Client
 * Handles all Seerr API interactions
 */

import axios from "axios";
import logger from "../utils/logger.js";
import { TIMEOUTS, CACHE_TTL } from "../lib/constants.js";
import { getSeerrApiUrl } from "../utils/seerrUrl.js";
import { withRetry } from "../utils/axiosRetry.js";

// Cache for tags, quality profiles, and servers
let tagsCache = null;
let tagsCacheTime = 0;
let qualityProfilesCache = null;
let qualityProfilesCacheTime = 0;
let serversCache = null;
let serversCacheTime = 0;

/**
 * Ensures the URL has the correct API v1 suffix
 * @param {string} url - The base URL
 * @returns {string} The normalized API URL
 */
function normalizeApiUrl(url) {
  if (!url) return url;
  return getSeerrApiUrl(url);
}

/**
 * Fetch data from Radarr/Sonarr servers
 * @param {string} seerrUrl - Seerr API URL
 * @param {string} apiKey - Seerr API key
 * @param {boolean} fetchDetails - Whether to fetch detailed info for each server
 * @param {Function} extractData - Function to extract data from server/details response
 * @returns {Promise<Array>} Extracted data
 */
async function fetchFromServers(seerrUrl, apiKey, fetchDetails, extractData) {
  const results = [];
  const safeApiUrl = new URL(normalizeApiUrl(seerrUrl));
  const basePath = safeApiUrl.pathname.replace(/\/$/, "");
  const buildUrl = (suffix) => {
    const u = new URL(safeApiUrl.href);
    u.pathname = basePath + suffix;
    return u.href;
  };

  // Fetch from Radarr servers
  try {
    const radarrListResponse = await withRetry(
      () => axios.get(buildUrl("/service/radarr"), {
        headers: { "X-Api-Key": apiKey },
        timeout: TIMEOUTS.SEERR_API,
      }),
      { label: "Seerr Radarr servers" }
    );

    for (const server of radarrListResponse.data) {
      try {
        if (fetchDetails) {
          const serverId = parseInt(server.id, 10);
          const detailsResponse = await axios.get(
            buildUrl(`/service/radarr/${serverId}`),
            {
              headers: { "X-Api-Key": apiKey },
              timeout: TIMEOUTS.SEERR_API,
            }
          );
          const data = extractData(server, detailsResponse.data, "radarr");
          if (data) results.push(...(Array.isArray(data) ? data : [data]));
        } else {
          const data = extractData(server, null, "radarr");
          if (data) results.push(...(Array.isArray(data) ? data : [data]));
        }
      } catch (err) {
        logger.warn(
          `Failed to fetch Radarr ${server.id} details:`,
          err?.message
        );
      }
    }
  } catch (err) {
    logger.warn("Failed to fetch Radarr servers:", err?.message);
  }

  // Fetch from Sonarr servers
  try {
    const sonarrListResponse = await withRetry(
      () => axios.get(buildUrl("/service/sonarr"), {
        headers: { "X-Api-Key": apiKey },
        timeout: TIMEOUTS.SEERR_API,
      }),
      { label: "Seerr Sonarr servers" }
    );

    for (const server of sonarrListResponse.data) {
      try {
        if (fetchDetails) {
          const serverId = parseInt(server.id, 10);
          const detailsResponse = await axios.get(
            buildUrl(`/service/sonarr/${serverId}`),
            {
              headers: { "X-Api-Key": apiKey },
              timeout: TIMEOUTS.SEERR_API,
            }
          );
          const data = extractData(server, detailsResponse.data, "sonarr");
          if (data) results.push(...(Array.isArray(data) ? data : [data]));
        } else {
          const data = extractData(server, null, "sonarr");
          if (data) results.push(...(Array.isArray(data) ? data : [data]));
        }
      } catch (err) {
        logger.warn(
          `Failed to fetch Sonarr ${server.id} details:`,
          err?.message
        );
      }
    }
  } catch (err) {
    logger.warn("Failed to fetch Sonarr servers:", err?.message);
  }

  return results;
}

// ─── Direct Radarr/Sonarr lookup (Round 8: rootFolder fallback) ──────────────
//
// Jellyseerr does not reliably populate `rootFolder` in its Request record when
// the admin approves with the default profile. The downstream Radarr/Sonarr
// server DOES know the path however — it's where the actual download lands.
// We pull the connection details for each configured server from Jellyseerr
// (`/api/v1/service/{type}/{id}` returns hostname + apiKey + useSsl), then call
// the Arr's v3 API directly: `/api/v3/movie?tmdbId=X` or `/api/v3/series?tvdbId=Y`.
//
// Cached 5 min — server configs change rarely; the cache prevents hammering
// Jellyseerr on every webhook event.

let _arrConnectionsCache = { radarr: null, sonarr: null, ts: 0 };
const ARR_CONNECTIONS_TTL_MS = 5 * 60 * 1000;

function buildArrBaseUrl(server) {
  const protocol = server.useSsl ? "https" : "http";
  const baseUrlSuffix = server.baseUrl ? `/${String(server.baseUrl).replace(/^\/+|\/+$/g, "")}` : "";
  return `${protocol}://${server.hostname}:${server.port}${baseUrlSuffix}`;
}

/**
 * Fetch all configured Radarr/Sonarr server connections from Jellyseerr.
 * Each result includes the credentials needed to call the Arr's API directly.
 * Cached 5 min.
 *
 * @returns {Promise<{ radarr: Array, sonarr: Array }>}
 */
export async function fetchArrConnections(seerrUrl, apiKey) {
  if (_arrConnectionsCache.radarr && _arrConnectionsCache.sonarr &&
      Date.now() - _arrConnectionsCache.ts < ARR_CONNECTIONS_TTL_MS) {
    return { radarr: _arrConnectionsCache.radarr, sonarr: _arrConnectionsCache.sonarr };
  }

  const safeApiUrl = new URL(normalizeApiUrl(seerrUrl));
  const basePath = safeApiUrl.pathname.replace(/\/$/, "");
  const buildUrl = (suffix) => {
    const u = new URL(safeApiUrl.href);
    u.pathname = basePath + suffix;
    return u.href;
  };

  const fetchType = async (type) => {
    const list = [];
    let listSucceeded = false;
    try {
      const listRes = await axios.get(buildUrl(`/service/${type}`), {
        headers: { "X-Api-Key": apiKey },
        timeout: TIMEOUTS.SEERR_API,
      });
      listSucceeded = true;
      for (const summary of listRes.data || []) {
        try {
          const detailsRes = await axios.get(buildUrl(`/service/${type}/${summary.id}`), {
            headers: { "X-Api-Key": apiKey },
            timeout: TIMEOUTS.SEERR_API,
          });
          const d = detailsRes.data || {};
          if (d.hostname && d.port && d.apiKey) {
            list.push({
              id: d.id ?? summary.id,
              name: d.name || summary.name || `${type} ${summary.id}`,
              hostname: d.hostname,
              port: d.port,
              apiKey: d.apiKey,
              useSsl: !!d.useSsl,
              baseUrl: d.baseUrl || "",
            });
          } else {
            logger.info(`[SEERR WEBHOOK] Tier-3 ${type} "${summary.name || summary.id}": incomplete connection details (missing hostname/port/apiKey)`);
          }
        } catch (err) {
          logger.warn(`[SEERR WEBHOOK] Tier-3 ${type} ${summary.id} details fetch failed: ${err?.message}`);
        }
      }
    } catch (err) {
      logger.warn(`[SEERR WEBHOOK] Tier-3 ${type} server list fetch failed: ${err?.message}`);
    }
    if (listSucceeded && list.length === 0) {
      logger.info(`[SEERR WEBHOOK] Tier-3: no ${type} servers configured in Jellyseerr`);
    }
    return list;
  };

  const [radarr, sonarr] = await Promise.all([fetchType("radarr"), fetchType("sonarr")]);
  _arrConnectionsCache = { radarr, sonarr, ts: Date.now() };
  logger.info(`[SEERR WEBHOOK] Tier-3 connections cached: ${radarr.length} Radarr, ${sonarr.length} Sonarr server(s) configured`);
  return { radarr, sonarr };
}

/**
 * Query a Radarr v3 server directly for a movie by TMDB ID.
 * Returns `{ path, rootFolderPath }` or null if Radarr doesn't have the movie.
 */
export async function fetchMoviePathFromRadarr(server, tmdbId) {
  try {
    const url = `${buildArrBaseUrl(server)}/api/v3/movie`;
    const res = await axios.get(url, {
      headers: { "X-Api-Key": server.apiKey },
      params: { tmdbId },
      timeout: TIMEOUTS.SEERR_API,
    });
    const movies = Array.isArray(res.data) ? res.data : [];
    if (movies.length === 0) {
      logger.info(`[SEERR WEBHOOK] Tier-3 Radarr "${server.name}": no movie with TMDB ${tmdbId}`);
      return null;
    }
    const m = movies[0];
    return { path: m.path || null, rootFolderPath: m.rootFolderPath || null };
  } catch (err) {
    logger.warn(`[SEERR WEBHOOK] Tier-3 Radarr "${server.name}" lookup failed for TMDB ${tmdbId}: ${err?.message}`);
    return null;
  }
}

/**
 * Query a Sonarr v3 server directly for a series by TVDB ID.
 * Returns `{ path, rootFolderPath }` or null if Sonarr doesn't have the series.
 */
export async function fetchSeriesPathFromSonarr(server, tvdbId) {
  try {
    const url = `${buildArrBaseUrl(server)}/api/v3/series`;
    const res = await axios.get(url, {
      headers: { "X-Api-Key": server.apiKey },
      params: { tvdbId },
      timeout: TIMEOUTS.SEERR_API,
    });
    const series = Array.isArray(res.data) ? res.data : [];
    if (series.length === 0) {
      logger.info(`[SEERR WEBHOOK] Tier-3 Sonarr "${server.name}": no series with TVDB ${tvdbId}`);
      return null;
    }
    const s = series[0];
    return { path: s.path || null, rootFolderPath: s.rootFolderPath || null };
  } catch (err) {
    logger.warn(`[SEERR WEBHOOK] Tier-3 Sonarr "${server.name}" lookup failed for TVDB ${tvdbId}: ${err?.message}`);
    return null;
  }
}

/**
 * Check if media exists and is available in Seerr
 * @param {number} tmdbId - TMDB ID
 * @param {string} mediaType - 'movie' or 'tv'
 * @param {Array} requestedSeasons - Season numbers or ['all']
 * @param {string} seerrUrl - Seerr API URL
 * @param {string} apiKey - Seerr API key
 * @returns {Promise<Object>} Status object
 */
export async function checkMediaStatus(
  tmdbId,
  mediaType,
  requestedSeasons = [],
  seerrUrl,
  apiKey
) {
  const apiUrl = normalizeApiUrl(seerrUrl);
  try {
    const url =
      mediaType === "movie"
        ? `${apiUrl}/movie/${tmdbId}`
        : `${apiUrl}/tv/${tmdbId}`;

    const response = await withRetry(
      () => axios.get(url, {
        headers: { "X-Api-Key": apiKey },
        timeout: TIMEOUTS.SEERR_API,
      }),
      { label: `Seerr status ${mediaType}/${tmdbId}` }
    );

    // For movies, simple check
    if (mediaType === "movie") {
      return {
        exists: true,
        available:
          response.data.mediaInfo?.status === 5 ||
          response.data.mediaInfo?.status === 4,
        status: response.data.mediaInfo?.status,
        data: response.data,
      };
    }

    // For TV shows, check specific seasons
    if (mediaType === "tv" && requestedSeasons.length > 0) {
      const seasonStatuses = response.data.mediaInfo?.seasons || [];

      // If requesting all seasons
      if (requestedSeasons.includes("all")) {
        if (seasonStatuses.length === 0) {
          return {
            exists: true,
            available: false,
            status: response.data.mediaInfo?.status,
            data: response.data,
          };
        }

        const allAvailable = seasonStatuses.every(
          (s) => s.status === 5 || s.status === 4
        );
        return {
          exists: true,
          available: allAvailable,
          status: response.data.mediaInfo?.status,
          data: response.data,
        };
      }

      // If requesting specific seasons
      const requestedSeasonNums = requestedSeasons.map((s) => parseInt(s, 10));
      const requestedSeasonAvailable = seasonStatuses.some(
        (s) =>
          requestedSeasonNums.includes(s.seasonNumber) &&
          (s.status === 5 || s.status === 4)
      );

      return {
        exists: true,
        available: requestedSeasonAvailable,
        status: response.data.mediaInfo?.status,
        data: response.data,
      };
    }

    // If no specific seasons requested, check overall status
    return {
      exists: true,
      available:
        response.data.mediaInfo?.status === 5 ||
        response.data.mediaInfo?.status === 4,
      status: response.data.mediaInfo?.status,
      data: response.data,
    };
  } catch (err) {
    // If 404, media doesn't exist in Seerr
    if (err.response && err.response.status === 404) {
      return { exists: false, available: false };
    }
    logger.warn("Error checking media status:", err?.message || err);
    return { exists: false, available: false };
  }
}

/**
 * Fetch tags from Radarr/Sonarr via Seerr
 * @param {string} seerrUrl - Seerr API URL
 * @param {string} apiKey - Seerr API key
 * @returns {Promise<Array>} Tags
 */
export async function fetchTags(seerrUrl, apiKey) {
  const now = Date.now();

  // Return cached tags if still valid
  if (tagsCache && now - tagsCacheTime < CACHE_TTL.TAGS) {
    return tagsCache;
  }

  try {
    const tags = await fetchFromServers(
      seerrUrl,
      apiKey,
      true,
      (server, details, type) => {
        if (!details?.tags) return [];
        return details.tags.map((tag) => ({
          id: tag.id,
          label: tag.label,
          serverId: server.id,
          serverName: server.name || `${type === "radarr" ? "Radarr" : "Sonarr"} ${server.id}`,
          type,
        }));
      }
    );

    tagsCache = tags;
    tagsCacheTime = now;

    logger.info(`✅ Fetched ${tags.length} tags from Seerr`);
    return tags;
  } catch (err) {
    logger.warn("Failed to fetch tags:", err?.message);
    return tagsCache || [];
  }
}

/**
 * Fetch servers (Radarr/Sonarr) via Seerr
 * @param {string} seerrUrl - Seerr API URL
 * @param {string} apiKey - Seerr API key
 * @returns {Promise<Array>} Servers list
 */

/**
 * Fetch root folders from Radarr/Sonarr via Seerr
 * @param {string} seerrUrl
 * @param {string} apiKey
 * @returns {Promise<Array>} Root folders with path, type, serverName
 */
export async function fetchRootFolders(seerrUrl, apiKey) {
  try {
    const folders = await fetchFromServers(
      seerrUrl,
      apiKey,
      true,
      (server, details, type) => {
        if (!details?.rootFolders) return [];
        return details.rootFolders.map((folder) => ({
          path: folder.path,
          freeSpace: folder.freeSpace,
          serverId: server.id,
          serverName: server.name || `${type === "radarr" ? "Radarr" : "Sonarr"} ${server.id}`,
          type,
        }));
      }
    );
    logger.info(`✅ Fetched ${folders.length} root folders from Seerr`);
    return folders;
  } catch (err) {
    logger.warn("Failed to fetch root folders:", err?.message);
    return [];
  }
}

export async function fetchServers(seerrUrl, apiKey) {
  const now = Date.now();

  // Return cached servers if still valid
  if (serversCache && now - serversCacheTime < CACHE_TTL.SERVERS) {
    return serversCache;
  }

  try {
    const servers = await fetchFromServers(
      seerrUrl,
      apiKey,
      false,
      (server, _details, type) => ({
        id: server.id,
        name: server.name || `${type === "radarr" ? "Radarr" : "Sonarr"} ${server.id}`,
        isDefault: server.isDefault || false,
        type,
      })
    );

    serversCache = servers;
    serversCacheTime = now;

    logger.info(`✅ Fetched ${servers.length} servers from Seerr`);
    return servers;
  } catch (err) {
    logger.warn("Failed to fetch servers:", err?.message);
    return serversCache || [];
  }
}

/**
 * Fetch quality profiles from Radarr/Sonarr via Seerr
 * @param {string} seerrUrl - Seerr API URL
 * @param {string} apiKey - Seerr API key
 * @returns {Promise<Array>} Quality profiles
 */
export async function fetchQualityProfiles(seerrUrl, apiKey) {
  const now = Date.now();

  // Return cached profiles if still valid
  if (qualityProfilesCache && now - qualityProfilesCacheTime < CACHE_TTL.QUALITY_PROFILES) {
    return qualityProfilesCache;
  }

  try {
    const profiles = await fetchFromServers(
      seerrUrl,
      apiKey,
      true,
      (server, details, type) => {
        if (!details?.profiles) return [];
        return details.profiles.map((profile) => ({
          id: profile.id,
          name: profile.name,
          serverId: server.id,
          serverName: server.name || `${type === "radarr" ? "Radarr" : "Sonarr"} ${server.id}`,
          type,
        }));
      }
    );

    qualityProfilesCache = profiles;
    qualityProfilesCacheTime = now;

    logger.info(`✅ Fetched ${profiles.length} quality profiles from Seerr`);
    return profiles;
  } catch (err) {
    logger.warn("Failed to fetch quality profiles:", err?.message);
    return qualityProfilesCache || [];
  }
}

/**
 * Approve a pending Seerr request
 * @param {number} requestId - Seerr request ID
 * @param {string} seerrUrl - Seerr API URL
 * @param {string} apiKey - Seerr API key
 * @returns {Promise<Object>} Response data
 */
export async function approveRequest(requestId, seerrUrl, apiKey) {
  const apiUrl = normalizeApiUrl(seerrUrl);
  const response = await withRetry(
    () => axios.post(`${apiUrl}/request/${requestId}/approve`, {}, {
      headers: { "X-Api-Key": apiKey },
      timeout: TIMEOUTS.SEERR_POST,
    }),
    { label: `Seerr approve request ${requestId}` }
  );
  return response.data;
}

/**
 * Decline a pending Seerr request
 * @param {number} requestId - Seerr request ID
 * @param {string} seerrUrl - Seerr API URL
 * @param {string} apiKey - Seerr API key
 * @returns {Promise<Object>} Response data
 */
export async function declineRequest(requestId, seerrUrl, apiKey) {
  const apiUrl = normalizeApiUrl(seerrUrl);
  const response = await withRetry(
    () => axios.post(`${apiUrl}/request/${requestId}/decline`, {}, {
      headers: { "X-Api-Key": apiKey },
      timeout: TIMEOUTS.SEERR_POST,
    }),
    { label: `Seerr decline request ${requestId}` }
  );
  return response.data;
}

/**
 * Create a Seerr issue on a media item.
 * @param {number|string} mediaId - Seerr internal media id (mediaInfo.id)
 * @param {number|string} issueType - 1=Video, 2=Audio, 3=Subtitle, 4=Other
 * @param {string} message - Free-text description
 * @param {string} seerrUrl - Seerr API URL
 * @param {string} apiKey - Seerr API key
 * @returns {Promise<Object>} Created issue
 */
export async function createIssue(mediaId, issueType, message, seerrUrl, apiKey, opts = {}) {
  const apiUrl = normalizeApiUrl(seerrUrl);
  const payload = {
    issueType: parseInt(issueType, 10),
    message: message || "",
    mediaId: parseInt(mediaId, 10),
  };
  // TV: optionally scope the issue to a specific season/episode (0 = all).
  const season = parseInt(opts.season, 10);
  const episode = parseInt(opts.episode, 10);
  if (Number.isFinite(season) && season > 0) payload.problemSeason = season;
  if (Number.isFinite(episode) && episode > 0) payload.problemEpisode = episode;
  const response = await withRetry(
    () => axios.post(`${apiUrl}/issue`, payload, {
      headers: { "X-Api-Key": apiKey },
      timeout: TIMEOUTS.SEERR_POST,
    }),
    { label: `Seerr create issue media ${mediaId}` }
  );
  return response.data;
}

/**
 * Fetch pending requests from Seerr
 * @param {string} seerrUrl - Seerr API URL
 * @param {string} apiKey - Seerr API key
 * @param {number} take - Number of requests to fetch
 * @returns {Promise<Object>} Response with results array and pageInfo
 */
export async function fetchRequests(seerrUrl, apiKey, take = 20, filter = "all") {
  const apiUrl = normalizeApiUrl(seerrUrl);
  const response = await withRetry(
    () => axios.get(`${apiUrl}/request`, {
      headers: { "X-Api-Key": apiKey },
      params: { take, sort: "modified", filter },
      timeout: TIMEOUTS.SEERR_API,
    }),
    { label: "Seerr fetch requests" }
  );
  return response.data;
}

/**
 * Fetch a single Seerr user by ID.
 * Used to resolve Discord-User → Seerr-User → Jellyfin-User-ID for personalized
 * recommendations.
 *
 * @param {number|string} userId - Seerr user ID
 * @param {string} seerrUrl - Seerr base URL
 * @param {string} apiKey - Seerr API key
 * @returns {Promise<Object|null>} User object (with `jellyfinUserId` field) or null
 */
export async function fetchSeerrUserById(userId, seerrUrl, apiKey) {
  try {
    const apiUrl = normalizeApiUrl(seerrUrl);
    const response = await withRetry(
      () => axios.get(`${apiUrl}/user/${userId}`, {
        headers: { "X-Api-Key": apiKey },
        timeout: TIMEOUTS.SEERR_API,
      }),
      { label: `Seerr fetch user ${userId}` }
    );
    return response.data;
  } catch (err) {
    logger.warn(`[Seerr] fetchSeerrUserById(${userId}) failed: ${err?.message || err}`);
    return null;
  }
}

/**
 * Fetch media requests submitted by a specific Seerr user.
 * Returns the N most-recent requests with TMDB IDs so they can be used
 * as personalisation seeds for /foryou recommendations.
 *
 * @param {number|string} userId - Seerr user ID
 * @param {string} seerrUrl - Seerr base URL
 * @param {string} apiKey - Seerr API key
 * @param {number} limit - Max number of requests to return (default 20)
 * @returns {Promise<Array<{tmdbId:string, type:string, title:string}>>}
 */
export async function fetchSeerrUserRequests(userId, seerrUrl, apiKey, limit = 20) {
  try {
    const apiUrl = normalizeApiUrl(seerrUrl);
    const response = await withRetry(
      () => axios.get(`${apiUrl}/request`, {
        headers: { "X-Api-Key": apiKey },
        params: { take: limit, sort: "modified", requestedBy: userId },
        timeout: TIMEOUTS.SEERR_API,
      }),
      { label: `Seerr user requests for ${userId}` }
    );
    const results = response.data?.results || [];
    return results
      .filter((r) => r.media?.tmdbId)
      .map((r) => ({
        tmdbId: String(r.media.tmdbId),
        type: r.type === "tv" ? "tv" : "movie",
        title: r.media.title || r.media.name || "Unknown",
      }));
  } catch (err) {
    logger.warn(`[Seerr] fetchSeerrUserRequests(${userId}) failed: ${err?.message || err}`);
    return [];
  }
}

/**
 * Fetch the full Seerr request objects submitted by a specific Seerr user.
 * Unlike fetchSeerrUserRequests (which strips down to TMDB seeds), this returns
 * the raw request objects (`id`, `status`, `media.status`) so the request-status
 * store can reconcile lifecycle stages for mapped users — not subject to the
 * poller's global 100-request window.
 *
 * @param {number|string} userId - Seerr user ID
 * @param {string} seerrUrl - Seerr base URL
 * @param {string} apiKey - Seerr API key
 * @param {number} limit - Max number of requests to return (default 100)
 * @returns {Promise<Array<Object>>} Raw Seerr request objects (empty array on error)
 */
export async function fetchSeerrUserRequestsFull(userId, seerrUrl, apiKey, limit = 100) {
  try {
    const apiUrl = normalizeApiUrl(seerrUrl);
    const response = await withRetry(
      () => axios.get(`${apiUrl}/request`, {
        headers: { "X-Api-Key": apiKey },
        params: { take: limit, sort: "modified", requestedBy: userId },
        timeout: TIMEOUTS.SEERR_API,
      }),
      { label: `Seerr full user requests for ${userId}` }
    );
    return response.data?.results || [];
  } catch (err) {
    logger.warn(`[Seerr] fetchSeerrUserRequestsFull(${userId}) failed: ${err?.message || err}`);
    return [];
  }
}

/**
 * Aggregate all Seerr requests (paginated, up to a sane cap) and compute
 * the average lifecycle durations for the dashboard "Insights" panel.
 *
 * Pending → Approved : difference between request.createdAt (=Pending) and
 *                      request.updatedAt when status flipped to Approved (2).
 * Approved → Available: difference between request.updatedAt and the moment
 *                       the media became fully available (status 5) — we use
 *                       the media's mediaAddedAt or updatedAt as proxy.
 *
 * @returns {Promise<{
 *   totalRequests: number,
 *   pendingToApprovedAvgHours: number | null,
 *   approvedToAvailableAvgHours: number | null,
 *   approvedSampleCount: number,
 *   availableSampleCount: number,
 * }>}
 */
export async function fetchRequestLifecycleStats(seerrUrl, apiKey) {
  const apiUrl = normalizeApiUrl(seerrUrl);
  const PAGE_SIZE = 100;
  const MAX_PAGES = 10; // hard cap → 1000 requests max
  const all = [];

  try {
    for (let skip = 0, page = 0; page < MAX_PAGES; skip += PAGE_SIZE, page++) {
      const res = await withRetry(
        () => axios.get(`${apiUrl}/request`, {
          headers: { "X-Api-Key": apiKey },
          params: { take: PAGE_SIZE, skip, sort: "added" },
          timeout: TIMEOUTS.SEERR_API,
        }),
        { label: `Seerr lifecycle page=${page}` }
      );
      const results = res.data?.results || [];
      all.push(...results);
      if (results.length < PAGE_SIZE) break;
    }
  } catch (err) {
    logger.warn(`[Seerr] fetchRequestLifecycleStats failed: ${err?.message || err}`);
  }

  let pendingMs = 0, pendingN = 0;
  let availableMs = 0, availableN = 0;

  for (const r of all) {
    const created = r.createdAt ? new Date(r.createdAt).getTime() : 0;
    const updated = r.updatedAt ? new Date(r.updatedAt).getTime() : 0;
    const status  = r.status; // 1 = Pending, 2 = Approved, 3 = Declined
    const mediaStatus = r.media?.status; // 4 = Partial, 5 = Available
    const mediaAdded  = r.media?.mediaAddedAt
      ? new Date(r.media.mediaAddedAt).getTime() : 0;

    // Pending → Approved (only when we know the request was actually approved)
    if (status === 2 && created && updated && updated > created) {
      pendingMs += (updated - created);
      pendingN++;
    }

    // Approved → Available — use mediaAddedAt as the Available signal,
    // and request updatedAt as the Approval timestamp (best available proxy).
    if (mediaStatus === 5 && mediaAdded && updated && mediaAdded > updated) {
      availableMs += (mediaAdded - updated);
      availableN++;
    }
  }

  const HOUR = 3_600_000;
  return {
    totalRequests: all.length,
    pendingToApprovedAvgHours:   pendingN ? +(pendingMs / pendingN / HOUR).toFixed(1) : null,
    approvedToAvailableAvgHours: availableN ? +(availableMs / availableN / HOUR).toFixed(1) : null,
    approvedSampleCount:  pendingN,
    availableSampleCount: availableN,
  };
}

/**
 * Aggregate the top-10 genres from the most-recent N Seerr requests.
 * Joins each request's TMDB id with `tmdbGetDetails` to read genre tags.
 *
 * @param {string} seerrUrl
 * @param {string} apiKey
 * @param {(tmdbId, mediaType) => Promise<{genres?: Array<{name: string}>}>} tmdbGetDetailsFn
 *   Inject the TMDB-details fetcher so this module stays free of hard deps.
 * @param {number} take - max number of recent requests to inspect (default 200)
 * @returns {Promise<Array<{name: string, count: number}>>}
 */
export async function fetchTopRequestGenres(seerrUrl, apiKey, tmdbGetDetailsFn, take = 200) {
  let requests = [];
  try {
    const data = await fetchRequests(seerrUrl, apiKey, take, "all");
    requests = data?.results || [];
  } catch (err) {
    logger.warn(`[Seerr] fetchTopRequestGenres → fetchRequests failed: ${err?.message || err}`);
    return [];
  }

  const genreCount = new Map();
  await Promise.all(requests.map(async (r) => {
    const tmdbId = r.media?.tmdbId;
    const mediaType = r.media?.mediaType || r.type;
    if (!tmdbId || !mediaType) return;
    try {
      const details = await tmdbGetDetailsFn(tmdbId, mediaType);
      const genres = details?.genres || [];
      for (const g of genres) {
        if (!g?.name) continue;
        genreCount.set(g.name, (genreCount.get(g.name) || 0) + 1);
      }
    } catch (_) { /* skip individual lookup failures */ }
  }));

  return [...genreCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));
}

/**
 * Fetch a single Seerr request by ID.
 * @param {number|string} requestId - Seerr request ID
 * @param {string} seerrUrl - Seerr base URL
 * @param {string} apiKey - Seerr API key
 * @returns {Promise<Object|null>} Request object or null on error
 */
export async function fetchRequestById(requestId, seerrUrl, apiKey) {
  try {
    const apiUrl = normalizeApiUrl(seerrUrl);
    const response = await withRetry(
      () => axios.get(`${apiUrl}/request/${requestId}`, {
        headers: { "X-Api-Key": apiKey },
        timeout: TIMEOUTS.SEERR_API,
      }),
      { label: `Seerr fetch request ${requestId}` }
    );
    return response.data;
  } catch (err) {
    logger.warn(`[Seerr] fetchRequestById(${requestId}) failed: ${err?.message || err}`);
    return null;
  }
}

/**
 * Send a media request to Seerr
 * @param {Object} params - Request parameters
 * @returns {Promise<Object>} Response data
 */
export async function sendRequest({
  tmdbId,
  mediaType,
  seasons = [],
  discordUserId = null,
  rootFolder = null,
  serverId = null,
  profileId = null,
  tags = null,
  isAutoApproved = null,
  seerrUrl,
  apiKey,
  userMappings = {},
}) {
  // Prepare seasons for TV shows
  let seasonsFormatted = null;
  if (mediaType === "tv" && seasons && seasons.length > 0) {
    // If seasons is ["all"] or contains "all", send empty array to request all seasons
    // Seerr expects an empty array [], not a missing field
    if (seasons.includes("all") || seasons[0] === "all") {
      seasonsFormatted = []; // Empty array requests all seasons
      logger.debug("[SEERR] Requesting all seasons (sending empty array)");
    } else {
      // Convert to array of numbers
      seasonsFormatted = seasons.map((s) => parseInt(s, 10));
      logger.debug(`[SEERR] Requesting specific seasons: ${seasonsFormatted.join(", ")}`);
    }
  }

  const payload = {
    mediaType,
    mediaId: parseInt(tmdbId, 10),
  };

  // Always include seasons field for TV shows (empty array = all seasons)
  if (mediaType === "tv" && seasonsFormatted !== null) {
    payload.seasons = seasonsFormatted;
  }

  // Add tags if provided
  if (tags && Array.isArray(tags) && tags.length > 0) {
    payload.tags = tags.map((t) => parseInt(t, 10));
    logger.debug(`[SEERR] Using tags: ${payload.tags.join(", ")}`);
  }

  // CRITICAL: Logic to handle auto-approval vs pending status
  // Seerr will auto-approve requests if serverId/profileId are provided,
  // regardless of the isAutoApproved flag. Therefore, we MUST NOT send these
  // fields unless we explicitly want auto-approval.

  if (isAutoApproved === true) {
    // User wants auto-approval - send all details
    payload.isAutoApproved = true;
    logger.info("[SEERR] 🚀 Auto-Approve is ON - including server details");

    if (rootFolder) {
      payload.rootFolder = rootFolder;
    }
    if (serverId !== null && serverId !== undefined) {
      payload.serverId = parseInt(serverId, 10);
    }
    if (profileId !== null && profileId !== undefined) {
      payload.profileId = parseInt(profileId, 10);
    }

    // Note: userId will be added later after user mapping check
  } else {
    // isAutoApproved is false OR null - create as PENDING request
    // CRITICAL: Do NOT include serverId, profileId, or rootFolder here.
    // Seerr auto-approves requests when these fields are present and the
    // requesting user (API key owner) has auto-approve permissions — even
    // if isAutoApproved is explicitly false. Omitting them forces Seerr to
    // use its default server/profile while keeping the request PENDING.
    payload.isAutoApproved = false;
    logger.info("[SEERR] ✋ Auto-Approve is OFF - request will be PENDING (admin must approve manually)");
    logger.debug("[SEERR] Omitting serverId/profileId/rootFolder to prevent Seerr-side auto-approve");
  }

  // Check if we have a user mapping for this Discord user
  let seerrUserId = null;

  if (discordUserId) {
    try {
      const mappings =
        typeof userMappings === "string"
          ? JSON.parse(userMappings)
          : userMappings;

      logger.info(`[SEERR] 🔍 Mapping check for Discord User: ${discordUserId}`);

      // Handle array format (current standard)
      if (Array.isArray(mappings)) {
        const mapping = mappings.find((m) => String(m.discordUserId) === String(discordUserId));
        if (mapping) {
          seerrUserId = mapping.seerrUserId;
          logger.info(`[SEERR] ✅ Match found in config: Discord ${discordUserId} -> Seerr User ${seerrUserId} (${mapping.seerrDisplayName || 'no name'})`);
        }
      }
      // Handle object format (legacy/fallback)
      else if (mappings && typeof mappings === "object" && mappings[discordUserId]) {
        seerrUserId = mappings[discordUserId];
        logger.info(`[SEERR] ✅ Match found in legacy config: Discord ${discordUserId} -> Seerr User ${seerrUserId}`);
      }

      if (seerrUserId !== null && seerrUserId !== undefined) {
        logger.info(`[SEERR] 👤 Requesting as Seerr User ID: ${seerrUserId}`);

        // If auto-approve is ON, add userId to payload for tracking
        // This helps identify who made the request in Seerr's history
        if (isAutoApproved === true) {
          payload.userId = parseInt(seerrUserId, 10);
          logger.info(`[SEERR] 📝 Adding userId to payload for tracking: ${payload.userId}`);
        }
      } else {
        logger.warn(`[SEERR] ❌ No mapping found for Discord user ${discordUserId}. Requesting as API Key Owner (ADMIN).`);
      }
    } catch (e) {
      logger.error("[SEERR] ❌ Failed to parse USER_MAPPINGS:", e);
    }
  }

  try {
    const apiUrl = normalizeApiUrl(seerrUrl);
    const finalUrl = `${apiUrl}/request`;

    logger.info(`[SEERR] 🚀 Sending POST to: ${finalUrl}`);

    // Build headers
    const headers = {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json"
    };

    // CRITICAL: x-api-user header logic based on auto-approve setting
    // 
    // When isAutoApproved === true:
    //   - DO NOT set x-api-user header
    //   - Request will use API key owner's permissions (admin with auto-approve)
    //   - Result: Request is auto-approved immediately
    //
    // When isAutoApproved === false:
    //   - SET x-api-user header to mapped user ID
    //   - Request will use mapped user's permissions (no auto-approve)
    //   - Result: Request is created as PENDING, requires manual approval

    if (isAutoApproved === false && seerrUserId !== null && seerrUserId !== undefined) {
      headers["x-api-user"] = String(seerrUserId);
      logger.info(`[SEERR] 🎭 Setting x-api-user header: ${seerrUserId} (request will use this user's permissions - no auto-approve)`);
    } else if (isAutoApproved === false) {
      // No user mapping — request goes as API key owner but with isAutoApproved: false
      // and without serverId/profileId, so Seerr should keep it PENDING
      logger.info("[SEERR] ✋ No user mapping found — requesting as API key owner with isAutoApproved: false");
    } else if (isAutoApproved === true) {
      logger.info(`[SEERR] 🔓 NOT setting x-api-user header (request will use API key owner's permissions - auto-approve enabled)`);
    }

    const response = await withRetry(
      () => axios.post(finalUrl, payload, {
        headers,
        timeout: TIMEOUTS.SEERR_POST,
      }),
      { label: `Seerr request ${mediaType}/${tmdbId}` }
    );

    logger.info("[SEERR] ✨ Request successful!");
    logger.debug(`[SEERR] Response: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (err) {
    const errorData = err?.response?.data;
    const statusCode = err?.response?.status;

    logger.error("[SEERR] ❌ Request failed!");

    // Log status code if available
    if (statusCode) {
      logger.error(`[SEERR] HTTP Status Code: ${statusCode}`);
    }

    // Log detailed error information
    if (errorData) {
      logger.error(`[SEERR] Error Details: ${JSON.stringify(errorData)}`);
    } else if (err.message) {
      logger.error(`[SEERR] Error Message: ${err.message}`);
    }

    // Log the full error for debugging
    if (err.code) {
      logger.error(`[SEERR] Error Code: ${err.code}`);
    }

    throw err;
  }
}
