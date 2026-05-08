import axios from "axios";
import logger from "../utils/logger.js";
import { withRetry } from "../utils/axiosRetry.js";

/**
 * Fetch all libraries from Jellyfin
 * @param {string} apiKey - Jellyfin API key
 * @param {string} baseUrl - Jellyfin base URL
 * @returns {Promise<Array>} Array of library objects with Id and Name
 */
export async function fetchLibraries(apiKey, baseUrl) {
  try {
    const safeBase = new URL(baseUrl);
    const basePathNoSlash = safeBase.pathname.replace(/\/$/, "");
    safeBase.pathname = basePathNoSlash + "/Library/VirtualFolders";
    const url = safeBase.href;
    const response = await withRetry(
      () => axios.get(url, {
        headers: { "X-MediaBrowser-Token": apiKey },
        timeout: 5000,
      }),
      { label: "Jellyfin libraries" }
    );

    const virtualFolders = response.data || [];
    logger.debug(
      `Fetched ${virtualFolders.length} virtual folders from Jellyfin`
    );

    // For each virtual folder, fetch the actual library item to get the real collection ID
    const libraries = [];
    for (const vf of virtualFolders) {
      try {
        // Query the Items endpoint to find the actual library collection
        const itemsUrlObj = new URL(baseUrl);
        itemsUrlObj.pathname = basePathNoSlash + "/Items";
        const itemsUrl = itemsUrlObj.href;
        const itemsResponse = await axios.get(itemsUrl, {
          headers: { "X-MediaBrowser-Token": apiKey },
          params: {
            Ids: vf.ItemId,
            Fields: "Path,LibraryOptions",
          },
          timeout: 5000,
        });

        const items = itemsResponse.data?.Items || [];
        if (items.length > 0) {
          const actualLibrary = items[0];
          libraries.push({
            ...vf,
            ItemId: vf.ItemId, // Virtual folder ID (for UI/config)
            CollectionId: actualLibrary.Id, // Actual collection ID (for matching content)
            Name: vf.Name,
            CollectionType: vf.CollectionType,
            Path: actualLibrary.Path || null,
            Locations: vf.Locations || [], // Add locations from VirtualFolder
          });
          logger.debug(
            `Library "${vf.Name}": Locations=[${vf.Locations?.join(", ")}]`
          );
        } else {
          // Fallback: if we can't get the collection ID, use the virtual folder ID
          libraries.push({
            ...vf,
            ItemId: vf.ItemId,
            CollectionId: vf.ItemId,
            Name: vf.Name,
          });
          logger.warn(
            `Could not fetch collection ID for library "${vf.Name}", using virtual folder ID`
          );
        }
      } catch (err) {
        logger.warn(
          `Failed to fetch collection ID for library "${vf.Name}":`,
          err?.message || err
        );
        // Fallback: use virtual folder ID as collection ID
        libraries.push({
          ...vf,
          ItemId: vf.ItemId,
          CollectionId: vf.ItemId,
          Name: vf.Name,
        });
      }
    }

    return libraries;
  } catch (err) {
    logger.error(
      "Failed to fetch libraries from Jellyfin:",
      err?.message || err
    );
    throw err;
  }
}

/**
 * Find a Jellyfin item by its TMDB provider ID
 * @param {string} tmdbId - TMDB ID to search for
 * @param {string} mediaType - "movie" or "tv"
 * @param {string} apiKey - Jellyfin API key
 * @param {string} baseUrl - Jellyfin base URL
 * @returns {Promise<string|null>} Jellyfin item ID or null if not found
 */
export async function findItemByTmdbId(tmdbId, mediaType, apiKey, baseUrl) {
  try {
    const itemType = mediaType === "movie" ? "Movie" : "Series";
    const safeBase = new URL(baseUrl);
    safeBase.pathname = safeBase.pathname.replace(/\/$/, "") + "/Items";
    const url = safeBase.href;
    const response = await withRetry(
      () => axios.get(url, {
        headers: { "X-MediaBrowser-Token": apiKey },
        params: {
          Recursive: true,
          AnyProviderIdEquals: `Tmdb.${tmdbId}`,
          IncludeItemTypes: itemType,
          Limit: 1,
          Fields: "ProviderIds",
        },
        timeout: 5000,
      }),
      { label: `Jellyfin findByTmdb ${tmdbId}` }
    );
    const items = response.data?.Items || [];
    return items.length > 0 ? items[0].Id : null;
  } catch (err) {
    const status = err?.response?.status;
    if (status === 401 || status === 403) {
      logger.error(`[findItemByTmdbId] Jellyfin rejected request for TMDB ID ${tmdbId} (HTTP ${status}) — check JELLYFIN_API_KEY`);
    } else if (status >= 500) {
      logger.error(`[findItemByTmdbId] Jellyfin server error for TMDB ID ${tmdbId} (HTTP ${status}): ${err?.message || err}`);
    } else {
      logger.warn(`[findItemByTmdbId] Could not look up TMDB ID ${tmdbId} in Jellyfin: ${err?.message || err}${err?.code ? ` (${err.code})` : ""}`);
    }
    return null;
  }
}

/**
 * Find library for an item by querying Jellyfin's ancestor endpoint
 * This is more reliable than traversing parent chain
 * @param {string} itemId - Item ID to find library for
 * @param {string} apiKey - Jellyfin API key
 * @param {string} baseUrl - Jellyfin base URL
 * @param {Map} libraryMap - Map of library CollectionId -> library object
 * @returns {Promise<string|null>} Library ItemId (for config matching) or null
 */
export async function findLibraryByAncestors(
  itemId,
  apiKey,
  baseUrl,
  libraryMap,
  itemType
) {
  try {
    // Use the Ancestors endpoint to get all parents of the item
    const ancestorsUrl = `${baseUrl.replace(
      /\/$/,
      ""
    )}/Items/${itemId}/Ancestors`;

    const response = await axios.get(ancestorsUrl, {
      headers: { "X-MediaBrowser-Token": apiKey },
      timeout: 5000,
    });

    const ancestors = response.data || [];

    // Helper function to check if library type matches item type
    const isTypeMatch = (libType, itemType) => {
      if (!libType || !itemType) return true;
      const lib = libType.toLowerCase();
      const item = itemType.toLowerCase();

      if (item === "movie" && lib === "movies") return true;
      if (
        (item === "series" || item === "season" || item === "episode") &&
        lib === "tvshows"
      )
        return true;
      if (item === "audio" && lib === "music") return true;

      if (item === "movie" && lib === "tvshows") return false;
      if (
        (item === "series" || item === "season" || item === "episode") &&
        lib === "movies"
      )
        return false;

      return true;
    };

    // Check each ancestor to see if it matches a library by ID or Path
    for (const ancestor of ancestors) {
      for (const [mapKey, library] of libraryMap.entries()) {
        // 1. Check ID match
        if (
          ancestor.Id === library.CollectionId ||
          ancestor.Id === library.ItemId
        ) {
          if (isTypeMatch(library.CollectionType, itemType)) {
            return library.ItemId;
          }
        }

        // 2. Check Path match (Robust for Docker/Virtual folders)
        if (
          ancestor.Path &&
          library.Locations &&
          library.Locations.length > 0
        ) {
          for (const loc of library.Locations) {
            const normAncestorPath = ancestor.Path.replace(
              /\\/g,
              "/"
            ).toLowerCase();
            const normLibPath = loc.replace(/\\/g, "/").toLowerCase();

            if (
              normAncestorPath === normLibPath ||
              normAncestorPath.startsWith(normLibPath)
            ) {
              if (isTypeMatch(library.CollectionType, itemType)) {
                return library.ItemId;
              }
            }
          }
        }
      }
    }

    // Fallback: Recursive search (only if path matching failed)
    for (const ancestor of ancestors) {
      if (ancestor.Type === "AggregateFolder") continue;

      for (const [mapKey, library] of libraryMap.entries()) {
        if (!isTypeMatch(library.CollectionType, itemType)) continue;

        try {
          const libItemsUrl = `${baseUrl.replace(/\/$/, "")}/Items`;
          const libResponse = await axios.get(libItemsUrl, {
            headers: { "X-MediaBrowser-Token": apiKey },
            params: {
              ParentId: library.ItemId,
              Recursive: true,
              Ids: ancestor.Id,
              Limit: 1,
            },
            timeout: 5000,
          });

          if (libResponse.data?.Items?.length > 0) {
            return library.ItemId;
          }
        } catch (err) {
          // Silent fail for recursive search
        }
      }
    }

    logger.warn(`Could not determine library for item ${itemId}`);
    return null;
  } catch (err) {
    logger.error(
      `Failed to find library by ancestors for item ${itemId}:`,
      err?.message || err
    );
    return null;
  }
}

/**
 * Find library ID for an item by traversing up the parent chain
 * @param {string} itemId - Item ID to find library for
 * @param {string} apiKey - Jellyfin API key
 * @param {string} baseUrl - Jellyfin base URL
 * @param {Map} libraryMap - Map of library CollectionId -> library object
 * @returns {Promise<string|null>} Library ItemId (for config matching) or null
 */
export async function findLibraryId(
  itemId,
  apiKey,
  baseUrl,
  libraryMap,
  depth = 0
) {
  // Prevent infinite recursion
  if (depth > 5) {
    logger.debug(`Max recursion depth reached for item ${itemId}`);
    return null;
  }

  try {
    logger.info(`[Depth ${depth}] Finding library for item: ${itemId}`);

    // Use the /Items endpoint without userId to avoid 400 errors
    const url = `${baseUrl.replace(/\/$/, "")}/Items`;
    const response = await axios.get(url, {
      headers: { "X-MediaBrowser-Token": apiKey },
      params: {
        Ids: itemId,
        Fields: "ParentId,Path", // Request Path to help identify library
      },
      timeout: 5000,
    });

    // Response is {Items: [...]}
    const items = response.data?.Items || [];
    if (items.length === 0) {
      logger.info(`No item found for ID: ${itemId}`);
      return null;
    }

    const item = items[0];
    logger.info(
      `[Depth ${depth}] Item ${itemId} has ParentId: ${item.ParentId}`
    );
    if (item.Path) {
      logger.debug(`[Depth ${depth}] Item path: ${item.Path}`);
    }

    // Check if current item's ParentId matches any library's CollectionId
    if (item.ParentId) {
      for (const [collectionId, library] of libraryMap.entries()) {
        if (
          item.ParentId === collectionId ||
          item.ParentId === library.ItemId
        ) {
          logger.info(
            `✅ Found library: ${library.Name} (ItemId: ${library.ItemId}) for item ${itemId}`
          );
          return library.ItemId; // Return ItemId for config matching
        }
      }
    }

    // Check if item itself is a library
    for (const [collectionId, library] of libraryMap.entries()) {
      if (itemId === collectionId || itemId === library.ItemId) {
        logger.info(`✅ Item ${itemId} is itself library: ${library.Name}`);
        return library.ItemId;
      }
    }

    // If item has no parent, check if it's actually a library
    if (!item.ParentId || item.ParentId === null) {
      // Check if this item is a library
      for (const [collectionId, library] of libraryMap.entries()) {
        if (itemId === collectionId || itemId === library.ItemId) {
          logger.info(
            `✅ Item ${itemId} has no parent and is library: ${library.Name}`
          );
          return library.ItemId;
        }
      }

      logger.warn(
        `⚠️ Item ${itemId} has no parent but is NOT a library. This might be a folder or collection.`
      );
      logger.warn(
        `   Known libraries: ${Array.from(libraryMap.values())
          .map((lib) => `${lib.Name} (${lib.ItemId})`)
          .join(", ")}`
      );

      // REVERSE LOOKUP: Check if any library has THIS item as its parent
      // This handles cases where libraries are nested inside collections/folders
      logger.info(`   Checking if any library is a child of this folder...`);
      for (const [collectionId, library] of libraryMap.entries()) {
        try {
          const libResponse = await axios.get(url, {
            headers: { "X-MediaBrowser-Token": apiKey },
            params: { Ids: library.ItemId, Fields: "ParentId" },
            timeout: 5000,
          });
          const libItems = libResponse.data?.Items || [];
          if (libItems.length > 0 && libItems[0].ParentId === itemId) {
            logger.info(
              `   ✅ Library ${library.Name} has this folder as parent! Returning library: ${library.ItemId}`
            );
            return library.ItemId;
          }
        } catch (err) {
          logger.debug(
            `   Failed to check library ${library.Name}: ${err.message}`
          );
        }
      }

      return null;
    }

    // Recursively check parent
    if (item.ParentId) {
      logger.info(`[Depth ${depth}] Checking parent: ${item.ParentId}`);
      return await findLibraryId(
        item.ParentId,
        apiKey,
        baseUrl,
        libraryMap,
        depth + 1
      );
    }

    logger.info(`No parent found for item ${itemId}`);
    return null;
  } catch (err) {
    logger.warn(
      `Failed to find library for item ${itemId}:`,
      err?.message || err
    );
    return null;
  }
}

/**
 * Fetch recently added items from Jellyfin
 * @param {string} apiKey - Jellyfin API key
 * @param {string} baseUrl - Jellyfin base URL
 * @param {number} limit - Maximum number of items to fetch
 * @returns {Promise<Array>} Array of recently added items
 */
export async function fetchRecentlyAdded(apiKey, baseUrl, limit = 50) {
  try {
    // Use /Items endpoint with SortBy=DateCreated for recently added items
    // Note: /Items/Latest requires userId and has compatibility issues with API keys
    const safeBase = new URL(baseUrl);
    safeBase.pathname = safeBase.pathname.replace(/\/$/, "") + "/Items";
    const url = safeBase.href;
    const response = await axios.get(url, {
      headers: { "X-MediaBrowser-Token": apiKey },
      params: {
        SortBy: "DateCreated",
        SortOrder: "Descending",
        Limit: limit,
        Fields: "ProviderIds,Overview,Genres,RunTimeTicks,ParentId",
        IncludeItemTypes: "Movie,Series,Season,Episode",
        Recursive: true,
      },
      timeout: 10000,
    });

    // Handle both direct array response and Items property
    const items = response.data?.Items || response.data || [];

    logger.debug(`Fetched ${items.length} recently added items from Jellyfin`);

    // Log first item's library info for debugging
    if (items.length > 0) {
      const firstItem = items[0];
      logger.debug(
        `First item: ${firstItem.Name} (Type: ${firstItem.Type}, ParentId: ${firstItem.ParentId})`
      );
    }

    return items;
  } catch (err) {
    logger.error(
      "Failed to fetch recently added items from Jellyfin:",
      err?.message || err
    );
    // Return empty array instead of failing
    return [];
  }
}

/**
 * Fetch recently added items (latest additions to the library)
 * Uses DateCreated sort — no userId required.
 * @param {string} apiKey - Jellyfin API key
 * @param {string} baseUrl - Jellyfin base URL
 * @param {number} limit - Max items to return
 * @param {string} type - 'movie', 'series', or 'all'
 * @returns {Promise<Array>} Recently added items
 */
export async function fetchLatestAdditions(apiKey, baseUrl, limit = 10, type = "all") {
  try {
    const base = baseUrl.replace(/\/$/, "");
    const includeTypes =
      type === "movie"  ? "Movie" :
      type === "series" ? "Series" :
      "Movie,Series,Season,Episode";
    const response = await axios.get(`${base}/Items`, {
      headers: { "X-MediaBrowser-Token": apiKey },
      params: {
        SortBy: "DateCreated",
        SortOrder: "Descending",
        Limit: limit,
        Fields: "ProviderIds,Overview,Genres,ProductionYear,CommunityRating,DateCreated,SeriesName,ParentIndexNumber,IndexNumber",
        IncludeItemTypes: includeTypes,
        Recursive: true,
      },
      timeout: 8000,
    });
    return response.data?.Items || [];
  } catch (err) {
    const status = err?.response?.status;
    const msg = err?.message || String(err);
    logger.error(`Failed to fetch latest additions from Jellyfin: ${status ? `HTTP ${status} — ` : ""}${msg}`);
    return [];
  }
}

/**
 * Paginated fetch of ALL item IDs in the Jellyfin library for seed deduplication.
 * Calls onBatch(items) for each page so the caller can record IDs incrementally.
 * Returns total number of items fetched.
 */
export async function seedAllItemIds(apiKey, baseUrl, onBatch) {
  const base = baseUrl.replace(/\/$/, "");
  const batchSize = 500;
  let startIndex = 0;
  let totalFetched = 0;

  while (true) {
    const response = await axios.get(`${base}/Items`, {
      headers: { "X-MediaBrowser-Token": apiKey },
      params: {
        Recursive: true,
        IncludeItemTypes: "Movie,Series,Season,Episode",
        Fields: "Id",
        StartIndex: startIndex,
        Limit: batchSize,
        SortBy: "DateCreated",
        SortOrder: "Descending",
      },
      timeout: 20000,
    });
    const items = response.data?.Items || [];
    const total = response.data?.TotalRecordCount ?? Infinity;
    if (items.length === 0) break;
    onBatch(items);
    totalFetched += items.length;
    if (totalFetched >= total || items.length < batchSize) break;
    startIndex += batchSize;
  }
  return totalFetched;
}

/**
 * Fetch the most recently added items from Jellyfin (by DateCreated, descending).
 * Returns up to 200 items. The caller's deduplicator identifies truly new ones —
 * no date filter is applied here because Jellyfin updates DateLastSaved on ALL
 * items during routine metadata refreshes, which would return the entire library
 * on every poll cycle.
 */
export async function fetchItemsAddedSince(apiKey, baseUrl) {
  try {
    const base = baseUrl.replace(/\/$/, "");
    const response = await axios.get(`${base}/Items`, {
      headers: { "X-MediaBrowser-Token": apiKey },
      params: {
        Recursive: true,
        IncludeItemTypes: "Movie,Series,Season,Episode",
        Fields: "ProviderIds,Overview,Genres,ProductionYear,CommunityRating,DateCreated,SeriesName,ParentIndexNumber,IndexNumber",
        SortBy: "DateCreated",
        SortOrder: "Descending",
        Limit: 200,
      },
      timeout: 15000,
    });
    return response.data?.Items || [];
  } catch (err) {
    const status = err?.response?.status;
    const msg = err?.message || String(err);
    logger.error(`Failed to fetch recent items from Jellyfin: ${status ? `HTTP ${status} — ` : ""}${msg}`);
    return [];
  }
}

/**
 * Fetch detailed information about a specific item
 * @param {string} itemId - Jellyfin item ID
 * @param {string} apiKey - Jellyfin API key
 * @param {string} baseUrl - Jellyfin base URL
 * @returns {Promise<Object|null>} Item details or null if failed
 */
export async function fetchItemDetails(itemId, apiKey, baseUrl) {
  try {
    const url = `${baseUrl.replace(/\/$/, "")}/Items/${itemId}`;
    const response = await axios.get(url, {
      headers: { "X-MediaBrowser-Token": apiKey },
      timeout: 5000,
    });

    return response.data;
  } catch (err) {
    logger.warn(
      `Failed to fetch item details for ${itemId}:`,
      err?.message || err
    );
    return null;
  }
}

/**
 * Transform Jellyfin item to webhook-compatible format
 * @param {Object} item - Jellyfin item object
 * @param {string} baseUrl - Jellyfin base URL
 * @param {string} serverId - Jellyfin server ID
 * @returns {Object} Webhook-compatible data object
 */
export function transformToWebhookFormat(item, baseUrl, serverId) {
  const data = {
    ItemType: item.Type,
    ItemId: item.Id,
    Name: item.Name,
    Year: item.ProductionYear,
    Overview: item.Overview,
    Genres: item.Genres || [],
    ServerUrl: baseUrl,
    ServerId: serverId,
  };

  // Add TMDB ID if available
  if (item.ProviderIds?.Tmdb) {
    data.Provider_tmdb = item.ProviderIds.Tmdb;
  }

  // Add IMDb ID if available
  if (item.ProviderIds?.Imdb) {
    data.Provider_imdb = item.ProviderIds.Imdb;
  }

  // Add runtime in ticks (convert to minutes for display)
  if (item.RunTimeTicks) {
    data.RunTime = Math.round(item.RunTimeTicks / 600000000); // Convert ticks to minutes
  }

  // For TV shows, add series-specific data
  if (item.Type === "Series") {
    data.SeriesId = item.Id;
    data.SeriesName = item.Name;
  } else if (item.Type === "Season") {
    data.SeriesId = item.SeriesId;
    data.SeriesName = item.SeriesName;
    data.SeasonId = item.Id;
    data.IndexNumber = item.IndexNumber;
  } else if (item.Type === "Episode") {
    data.SeriesId = item.SeriesId;
    data.SeriesName = item.SeriesName;
    data.SeasonId = item.SeasonId;
    data.IndexNumber = item.IndexNumber;
    data.ParentIndexNumber = item.ParentIndexNumber;
  }

  // Add library ID - use ParentIds[0] if available (most reliable), otherwise fallback to ParentId
  if (
    item.ParentIds &&
    Array.isArray(item.ParentIds) &&
    item.ParentIds.length > 0
  ) {
    data.LibraryId = item.ParentIds[0]; // First ParentId is the library
  } else {
    data.LibraryId = item.ParentId;
  }

  return data;
}

/**
 * Fetch a random movie or TV series from Jellyfin
 * @param {string} apiKey - Jellyfin API key
 * @param {string} baseUrl - Jellyfin base URL
 * @param {string} type - "Movie" or "Series"
 * @returns {Promise<Object|null>} Jellyfin item or null
 */
export async function fetchRandomJellyfinItem(apiKey, baseUrl, type = "Movie") {
  try {
    const base = baseUrl.replace(/\/$/, "");
    const response = await withRetry(
      () => axios.get(`${base}/Items`, {
        headers: { "X-MediaBrowser-Token": apiKey },
        params: {
          Recursive: true,
          SortBy: "Random",
          Limit: 1,
          IncludeItemTypes: type,
          Fields: "Overview,ProviderIds,ProductionYear,Genres,OfficialRating",
        },
        timeout: 8000,
      }),
      { label: `Jellyfin random ${type}` }
    );
    const items = response.data?.Items || [];
    return items[0] || null;
  } catch (err) {
    logger.warn(`[Jellyfin] fetchRandomJellyfinItem error: ${err.message}`);
    return null;
  }
}

/**
 * Find a Jellyfin item by TMDB ID (standalone, no cache dependency)
 * @param {string} tmdbId
 * @param {string} mediaType - "movie" or "tv"
 * @param {string} title - Search title from TMDB
 * @param {string} apiKey
 * @param {string} baseUrl
 * @returns {Promise<string|null>} Jellyfin item ID or null
 */
export async function findJellyfinItemByTmdbId(tmdbId, mediaType, title, apiKey, baseUrl) {
  if (!apiKey || !baseUrl || !title) return null;
  try {
    const base = baseUrl.replace(/\/$/, "");
    const itemType = mediaType === "movie" ? "Movie" : "Series";
    const res = await withRetry(
      () => axios.get(`${base}/Items`, {
        headers: { "X-MediaBrowser-Token": apiKey },
        params: {
          Recursive: true,
          searchTerm: title,
          IncludeItemTypes: itemType,
          Fields: "ProviderIds,Name,ProductionYear",
          Limit: 20,
        },
        timeout: 8000,
      }),
      { label: `Jellyfin search "${title}"` }
    );
    const items = res.data?.Items || [];
    for (const item of items) {
      const itemTmdbId = item.ProviderIds?.Tmdb || item.ProviderIds?.tmdb || item.ProviderIds?.TMDB;
      if (String(itemTmdbId) === String(tmdbId)) return item.Id;
    }
    return null;
  } catch (err) {
    logger.warn(`[Jellyfin] findJellyfinItemByTmdbId error: ${err.message}`);
    return null;
  }
}

// ─── Watch-History & Cleanup Helpers ─────────────────────────────────────────

/**
 * Fetch a user's recently played items from Jellyfin.
 * Returns Movies + Series sorted by DatePlayed descending.
 *
 * @param {string} jellyfinUserId
 * @param {string} apiKey
 * @param {string} baseUrl
 * @param {number} limit
 * @returns {Promise<Array>} Items with { Id, Name, Type, ProviderIds, UserData }
 */
export async function fetchUserRecentlyPlayed(jellyfinUserId, apiKey, baseUrl, limit = 10) {
  try {
    const safeBase = new URL(baseUrl);
    safeBase.pathname = safeBase.pathname.replace(/\/$/, "") + `/Users/${jellyfinUserId}/Items`;
    const response = await withRetry(
      () => axios.get(safeBase.href, {
        headers: { "X-MediaBrowser-Token": apiKey },
        params: {
          Recursive: true,
          SortBy: "DatePlayed",
          SortOrder: "Descending",
          IncludeItemTypes: "Movie,Series",
          Filters: "IsPlayed",
          Limit: limit,
          Fields: "ProviderIds,UserData",
        },
        timeout: 8000,
      }),
      { label: `Jellyfin user recently-played ${jellyfinUserId}` }
    );
    return response.data?.Items || [];
  } catch (err) {
    logger.warn(`[Jellyfin] fetchUserRecentlyPlayed error: ${err?.message || err}`);
    return [];
  }
}

/**
 * Fetch server-wide top-played items as fallback when no per-user history exists.
 *
 * @param {string} apiKey
 * @param {string} baseUrl
 * @param {number} limit
 * @returns {Promise<Array>} Items with { Id, Name, Type, ProviderIds, UserData }
 */
export async function fetchServerTopPlayed(apiKey, baseUrl, limit = 10) {
  // NOTE: SortBy=PlayCount without a userId causes HTTP 500 on Jellyfin's /Items endpoint
  // (PlayCount is user-scoped data). We sort by DateCreated (recently added) as a reliable
  // server-wide fallback that always works with an admin API key.
  try {
    const safeBase = new URL(baseUrl);
    safeBase.pathname = safeBase.pathname.replace(/\/$/, "") + "/Items";
    const response = await withRetry(
      () => axios.get(safeBase.href, {
        headers: { "X-MediaBrowser-Token": apiKey },
        params: {
          Recursive: true,
          SortBy: "DateCreated",
          SortOrder: "Descending",
          IncludeItemTypes: "Movie,Series",
          Limit: limit,
          Fields: "ProviderIds",
        },
        timeout: 8000,
      }),
      { label: "Jellyfin server recently-added" }
    );
    return response.data?.Items || [];
  } catch (err) {
    logger.warn(`[Jellyfin] fetchServerTopPlayed error: ${err?.message || err}`);
    return [];
  }
}

/**
 * Resolve a Discord user ID to a Jellyfin user ID via:
 *   Discord ID → USER_MAPPINGS → Seerr User ID → Seerr-User.jellyfinUserId
 *
 * @param {string} discordId
 * @param {Array|Object|string} userMappings - USER_MAPPINGS config value
 * @param {string} seerrUrl
 * @param {string} seerrApiKey
 * @returns {Promise<string|null>} Jellyfin user ID or null
 */
export async function resolveJellyfinUserId(discordId, userMappings, seerrUrl, seerrApiKey) {
  try {
    // Parse USER_MAPPINGS — array of { discordUserId, seerrUserId, ... } objects
    // (see utils/userMappingStore.js for the canonical shape)
    let mappings = userMappings;
    if (typeof mappings === "string") {
      try { mappings = JSON.parse(mappings); } catch { return null; }
    }
    if (!Array.isArray(mappings)) return null;

    const entry = mappings.find(
      (m) => String(m.discordUserId) === String(discordId)
    );
    const seerrUserId = entry?.seerrUserId;
    if (!seerrUserId) return null;

    // Look up Jellyfin user ID via Seerr
    const { fetchSeerrUserById } = await import("./seerr.js");
    const seerrUser = await fetchSeerrUserById(seerrUserId, seerrUrl, seerrApiKey);
    return seerrUser?.jellyfinUserId || null;
  } catch (err) {
    logger.warn(`[Jellyfin] resolveJellyfinUserId error: ${err?.message || err}`);
    return null;
  }
}

/**
 * Fetch a paged list of items for cleanup analysis.
 * Returns Movie items with PlayCount, LastPlayedDate, DateCreated, file size.
 *
 * Uses server-aggregated UserData (Jellyfin returns aggregated playback stats
 * across all users when querying without a userId).
 *
 * @param {string} apiKey
 * @param {string} baseUrl
 * @param {Object} opts
 * @param {number} [opts.limit=2000]
 * @returns {Promise<Array>} Raw items with at least { Id, Name, ProductionYear,
 *   DateCreated, UserData: { PlayCount, LastPlayedDate }, MediaSources: [{ Size }] }
 */
export async function fetchUnwatchedAggregateItems(apiKey, baseUrl, opts = {}) {
  const maxTotal = opts.limit ?? 5000;
  const pageSize  = 500; // safe per-page size — avoids per-request timeouts
  const allItems  = [];

  try {
    const safeBase = new URL(baseUrl);
    safeBase.pathname = safeBase.pathname.replace(/\/$/, "") + "/Items";

    let startIndex = 0;
    let totalRecordCount = null;

    while (allItems.length < maxTotal) {
      const response = await axios.get(safeBase.href, {
        headers: { "X-MediaBrowser-Token": apiKey },
        params: {
          Recursive: true,
          IncludeItemTypes: "Movie",
          SortBy: "DateCreated",
          SortOrder: "Ascending",
          StartIndex: startIndex,
          Limit: Math.min(pageSize, maxTotal - allItems.length),
          Fields: "DateCreated,UserData,MediaSources,ProductionYear",
        },
        timeout: 15000,
      });

      const page = response.data?.Items || [];
      allItems.push(...page);

      // Capture total on first page
      if (totalRecordCount === null) {
        totalRecordCount = response.data?.TotalRecordCount ?? 0;
      }

      // Stop when we've read everything available
      if (page.length === 0 || allItems.length >= totalRecordCount) break;

      startIndex += page.length;
    }

    logger.debug(`[Jellyfin] fetchUnwatchedAggregateItems: fetched ${allItems.length} / ${totalRecordCount} items`);
    return allItems;
  } catch (err) {
    logger.warn(`[Jellyfin] fetchUnwatchedAggregateItems error: ${err?.message || err}`);
    return [];
  }
}

/**
 * Fetch a high-level library summary for the Stats dashboard.
 * Returns counts per IncludeItemType and a top-10 genre histogram.
 *
 * @param {string} apiKey
 * @param {string} baseUrl
 * @returns {Promise<{movies: number, series: number, totalRuntimeMinutes: number, topGenres: Array<{name: string, count: number}>}>}
 */
export async function fetchLibrarySummary(apiKey, baseUrl) {
  try {
    const safeBase = new URL(baseUrl);
    safeBase.pathname = safeBase.pathname.replace(/\/$/, "") + "/Items";

    // Strategy: use TotalRecordCount for the *exact* counts (matches Jellyfin's
    // own library-page numbers), and a separate paginated call for genres +
    // runtime aggregates. The previous combined IncludeItemTypes=Movie,Series
    // call filtered locally on Type==="Series", which was off-by-one on some
    // libraries because Jellyfin sometimes returns container items the UI
    // counts but our filter dropped.
    // _t param busts any HTTP-level ETag/conditional-GET caching by Jellyfin or
    // intermediate proxies, ensuring we always get a fresh TotalRecordCount.
    const cacheBuster = Date.now();
    const countParams = (type) => ({
      Recursive: true,
      IncludeItemTypes: type,
      Limit: 0,
      EnableTotalRecordCount: true,
      _t: cacheBuster,
    });
    const noCacheHeaders = { "X-MediaBrowser-Token": apiKey, "Cache-Control": "no-cache" };

    const [movieCountRes, seriesCountRes] = await Promise.all([
      axios.get(safeBase.href, {
        headers: noCacheHeaders,
        params: countParams("Movie"),
        timeout: 15000,
      }),
      axios.get(safeBase.href, {
        headers: noCacheHeaders,
        params: countParams("Series"),
        timeout: 15000,
      }),
    ]);

    const movies = movieCountRes.data?.TotalRecordCount ?? 0;
    const series = seriesCountRes.data?.TotalRecordCount ?? 0;

    // Aggregate genres + runtime. We need the actual items for these — do it in
    // one bounded call (Jellyfin libraries above ~10k items are rare).
    const aggResponse = await axios.get(safeBase.href, {
      headers: { "X-MediaBrowser-Token": apiKey },
      params: {
        Recursive: true,
        IncludeItemTypes: "Movie,Series",
        Fields: "Genres,RunTimeTicks",
        Limit: 10000,
      },
      timeout: 30000,
    });

    const items = aggResponse.data?.Items || [];
    let totalRuntimeTicks = 0;
    const genreCount = new Map();

    for (const it of items) {
      if (typeof it.RunTimeTicks === "number") totalRuntimeTicks += it.RunTimeTicks;
      if (Array.isArray(it.Genres)) {
        for (const g of it.Genres) {
          if (!g) continue;
          genreCount.set(g, (genreCount.get(g) || 0) + 1);
        }
      }
    }

    const topGenres = [...genreCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    return {
      movies,
      series,
      totalRuntimeMinutes: Math.round(totalRuntimeTicks / 600_000_000), // ticks=100ns
      topGenres,
    };
  } catch (err) {
    logger.warn(`[Jellyfin] fetchLibrarySummary error: ${err?.message || err}`);
    return { movies: 0, series: 0, totalRuntimeMinutes: 0, topGenres: [] };
  }
}
