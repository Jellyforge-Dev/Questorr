/**
 * Centralized API Response Caching
 * Uses node-cache for in-memory caching with TTL support
 */

import NodeCache from "node-cache";
import { CACHE_TTL } from "../lib/constants.js";
import logger from "./logger.js";

/** Returns the current bot language for use in cache keys */
function getLang() {
  return (process.env.BOT_LANGUAGE || "en").toLowerCase();
}

class APICache {
  constructor() {
    // TMDB cache - 5 minutes TTL
    this.tmdbCache = new NodeCache({
      stdTTL: CACHE_TTL.TMDB_SEARCH / 1000, // Convert ms to seconds
      checkperiod: 120, // Check for expired keys every 2 minutes
      useClones: false, // Don't clone objects (better performance)
    });

    // Seerr cache - 1 minute TTL
    this.seerrCache = new NodeCache({
      stdTTL: CACHE_TTL.SEERR_STATUS / 1000,
      checkperiod: 30,
      useClones: false,
    });

    // Statistics
    this.stats = {
      tmdbHits: 0,
      tmdbMisses: 0,
      seerrHits: 0,
      seerrMisses: 0,
    };
  }

  // TMDB Search Cache
  tmdbSearch(query, results) {
    const key = `search:${getLang()}:${query.toLowerCase().trim()}`;

    if (results === undefined) {
      // GET
      const cached = this.tmdbCache.get(key);
      if (cached) {
        this.stats.tmdbHits++;
        return cached;
      }
      this.stats.tmdbMisses++;
      return null;
    } else {
      // SET
      this.tmdbCache.set(key, results);
      return results;
    }
  }

  // TMDB Details Cache
  tmdbDetails(id, mediaType, details) {
    const key = `details:${getLang()}:${mediaType}:${id}`;

    if (details === undefined) {
      // GET
      const cached = this.tmdbCache.get(key);
      if (cached) {
        this.stats.tmdbHits++;
        return cached;
      }
      this.stats.tmdbMisses++;
      return null;
    } else {
      // SET
      this.tmdbCache.set(key, details);
      return details;
    }
  }

  // TMDB External IDs Cache
  tmdbExternalIds(id, mediaType, externalIds) {
    const key = `external:${mediaType}:${id}`;

    if (externalIds === undefined) {
      // GET
      const cached = this.tmdbCache.get(key);
      if (cached) {
        this.stats.tmdbHits++;
        return cached;
      }
      this.stats.tmdbMisses++;
      return null;
    } else {
      // SET
      this.tmdbCache.set(key, externalIds);
      return externalIds;
    }
  }

  // TMDB Trending Cache
  tmdbTrending(results) {
    const key = `trending:${getLang()}:weekly`;

    if (results === undefined) {
      // GET
      const cached = this.tmdbCache.get(key);
      if (cached) {
        this.stats.tmdbHits++;
        return cached;
      }
      this.stats.tmdbMisses++;
      return null;
    } else {
      // SET
      this.tmdbCache.set(key, results);
      return results;
    }
  }

  // Seerr Request Status Cache
  seerrStatus(tmdbId, mediaType, status) {
    const key = `status:${mediaType}:${tmdbId}`;

    if (status === undefined) {
      // GET
      const cached = this.seerrCache.get(key);
      if (cached) {
        this.stats.seerrHits++;
        return cached;
      }
      this.stats.seerrMisses++;
      return null;
    } else {
      // SET
      this.seerrCache.set(key, status);
      return status;
    }
  }

  // Clear specific cache
  clearTMDB() {
    this.tmdbCache.flushAll();
    logger.info("TMDB cache cleared");
  }

  clearSeerr() {
    this.seerrCache.flushAll();
    logger.info("Seerr cache cleared");
  }

  // Clear all caches
  clearAll() {
    this.tmdbCache.flushAll();
    this.seerrCache.flushAll();
    logger.info("All caches cleared");
  }

  // Get cache statistics
  getStats() {
    const tmdbKeys = this.tmdbCache.keys().length;
    const seerrKeys = this.seerrCache.keys().length;
    const tmdbTotal = this.stats.tmdbHits + this.stats.tmdbMisses;
    const seerrTotal =
      this.stats.seerrHits + this.stats.seerrMisses;

    return {
      tmdb: {
        keys: tmdbKeys,
        hits: this.stats.tmdbHits,
        misses: this.stats.tmdbMisses,
        hitRate:
          tmdbTotal > 0
            ? ((this.stats.tmdbHits / tmdbTotal) * 100).toFixed(2) + "%"
            : "0%",
      },
      seerr: {
        keys: seerrKeys,
        hits: this.stats.seerrHits,
        misses: this.stats.seerrMisses,
        hitRate:
          seerrTotal > 0
            ? ((this.stats.seerrHits / seerrTotal) * 100).toFixed(2) +
              "%"
            : "0%",
      },
    };
  }
}

// Export singleton instance
export default new APICache();
