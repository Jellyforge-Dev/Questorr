import * as jellyfinApi from "../api/jellyfin.js";
import logger from "../utils/logger.js";

const CLEANUP_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/**
 * Fetches all libraries from Jellyfin and returns the library array,
 * a Set of all known IDs (both VirtualFolder and Collection), and a
 * Map of CollectionId → VirtualFolderItemId for config lookups.
 */
export async function fetchLibraryMap() {
  const apiKey = process.env.JELLYFIN_API_KEY;
  const baseUrl = process.env.JELLYFIN_BASE_URL;
  const libraries = await jellyfinApi.fetchLibraries(apiKey, baseUrl);

  const libraryIdMap = new Map(); // CollectionId → VirtualFolderItemId
  const libraryIds = new Set(); // all known IDs for fast membership checks

  for (const lib of libraries) {
    libraryIds.add(lib.ItemId);
    if (lib.CollectionId && lib.CollectionId !== lib.ItemId) {
      libraryIds.add(lib.CollectionId);
      libraryIdMap.set(lib.CollectionId, lib.ItemId);
      logger.debug(
        `📚 Library "${lib.Name}": CollectionId=${lib.CollectionId} → VirtualFolderId=${lib.ItemId}`
      );
    }
  }

  return { libraries, libraryIds, libraryIdMap };
}

/**
 * Given a raw libraryId (may be CollectionId or VirtualFolderId),
 * returns the VirtualFolderId used for config lookups.
 */
export function resolveConfigLibraryId(libraryId, libraryIdMap) {
  if (libraryIdMap.has(libraryId)) {
    const mapped = libraryIdMap.get(libraryId);
    logger.info(`🔄 Mapped collection ID ${libraryId} -> virtual folder ID ${mapped}`);
    return mapped;
  }
  return libraryId;
}

/**
 * Parses JELLYFIN_NOTIFICATION_LIBRARIES from env.
 * Returns an object mapping libraryId → channelId, or {} if not configured.
 */
export function getLibraryChannels() {
  try {
    const raw = process.env.JELLYFIN_NOTIFICATION_LIBRARIES;
    if (!raw) return {};
    if (typeof raw === "object") return raw;
    return JSON.parse(raw);
  } catch (e) {
    logger.warn("Failed to parse JELLYFIN_NOTIFICATION_LIBRARIES:", e);
    return {};
  }
}

/**
 * Resolves the target Discord channel for a given configLibraryId.
 * Returns null if the library is not in the notification list.
 */
export function resolveTargetChannel(configLibraryId, libraryChannels) {
  const defaultChannelId = process.env.JELLYFIN_CHANNEL_ID;
  if (Object.keys(libraryChannels).length > 0 && !libraryChannels[configLibraryId]) {
    logger.info(`❌ Skipping item from library ${configLibraryId} (not in notification list)`);
    logger.info(`   Available libraries: ${Object.keys(libraryChannels).join(", ")}`);
    return null;
  }
  return libraryChannels[configLibraryId] || defaultChannelId || null;
}

/**
 * Shared in-memory deduplication store for seen Jellyfin item IDs.
 * Shared between the poller and WebSocket client so that an item
 * detected by both within 24 hours is only notified once.
 */
// Round 9: timestamp=0 marks an item as "seed-only" — recorded during the
// silent bulk-seed at first bot start, but never notified. The dashboard
// "Verpasste Items finden" (rescan) button uses this marker to find items
// that were added to Jellyfin BEFORE Questorr was running, so the user can
// retroactively receive notifications for them.
export const SEED_MARKER = 0;

export class ItemDeduplicator {
  constructor() {
    this.seenItems = new Map(); // itemId → timestamp (0 = seed-only)
  }

  /**
   * Returns true if the item has ever been seen (persistent dedup).
   * On a hit, refreshes the timestamp so the item is not evicted by cleanup —
   * unless `seedMode` is set, in which case the marker is preserved.
   * On a miss, records it (with SEED_MARKER if seedMode, else Date.now()) and
   * returns false.
   *
   * @param {string} itemId
   * @param {{ seedMode?: boolean }} [opts]
   */
  checkAndRecord(itemId, opts = {}) {
    const seedMode = !!opts.seedMode;
    if (this.seenItems.has(itemId)) {
      // Only refresh timestamp for real discoveries — preserve SEED_MARKER otherwise
      if (!seedMode) this.seenItems.set(itemId, Date.now());
      return true; // already seen — do NOT post again
    }
    this.seenItems.set(itemId, seedMode ? SEED_MARKER : Date.now());
    return false;
  }

  /** True if the item was recorded via seed (never notified). */
  isSeeded(itemId) {
    return this.seenItems.get(itemId) === SEED_MARKER;
  }

  /** Upgrade a seed-marked item to "truly seen" (after a real notification). */
  markNotified(itemId) {
    this.seenItems.set(itemId, Date.now());
  }

  /** Remove entries older than 90 days to prevent unbounded growth.
   *  SEED_MARKER (0) entries are NEVER cleaned up — they represent the
   *  full pre-existing library and must persist for the rescan feature.
   */
  cleanup() {
    const cutoff = Date.now() - CLEANUP_AGE_MS;
    for (const [id, ts] of this.seenItems) {
      if (ts === SEED_MARKER) continue;
      if (ts < cutoff) this.seenItems.delete(id);
    }
  }
}

/** Singleton deduplicator shared by poller and WebSocket client. */
export const deduplicator = new ItemDeduplicator();
