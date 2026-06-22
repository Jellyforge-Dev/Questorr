import fs from "fs";
import path from "path";
import { CONFIG_PATH } from "./configFile.js";
import logger from "./logger.js";

// Standalone lifecycle store for Discord-originated Seerr requests, keyed on the
// Seerr requestId. Bridges the per-Discord-user mapping blind spot: the poller can
// match status updates by requestId for mapped *and* unmapped users.
// Kept out of botState.js on purpose (botState stays lean).

export const STAGES = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  AVAILABLE: "Available",
  PARTIALLY_AVAILABLE: "PartiallyAvailable",
  DECLINED: "Declined",
  FAILED: "Failed",
};

// Terminal stages — prune drops these once old enough.
const COMPLETED_STAGES = new Set([STAGES.AVAILABLE, STAGES.DECLINED, STAGES.FAILED]);

const STORE_PATH = path.join(path.dirname(CONFIG_PATH), "request-store.json");

// key -> record
const records = new Map();

function keyFor({ requestId, tmdbId, mediaType }) {
  return requestId != null ? String(requestId) : `${tmdbId}-${mediaType}`;
}

/**
 * Map Seerr request/media status integers to a single user-facing stage.
 * Single source of truth — if Seerr changes its status integers, fix it here.
 */
export function deriveStage(req) {
  const status = req?.status;
  const mediaStatus = req?.media?.status;

  // request.status: 1 PENDING, 2 APPROVED, 3 DECLINED, 4 FAILED, 5 COMPLETED.
  // PENDING/DECLINED/FAILED gate on request.status. Everything else past approval
  // (APPROVED/COMPLETED) derives availability from media.status — Jellyseerr flips
  // the request to COMPLETED (5) once the media is available, so gating the media
  // check on status === 2 would wrongly revert an available item to Pending.
  if (status === 3) return STAGES.DECLINED;
  if (status === 1) return STAGES.PENDING;
  if (status === 4) return STAGES.FAILED;

  // media.status: 1 UNKNOWN, 2 PENDING, 3 PROCESSING, 4 PARTIALLY_AVAILABLE, 5 AVAILABLE.
  if (mediaStatus === 5) return STAGES.AVAILABLE;
  if (mediaStatus === 4) return STAGES.PARTIALLY_AVAILABLE;
  return STAGES.PROCESSING;
}

/**
 * Add a record at request-click time. Older Seerr without an id degrades to a
 * tmdbId-mediaType pseudo-key with a Pending stage.
 */
export function add({ requestId, tmdbId, mediaType, title, discordUserId, seerrStatus, mediaStatus }) {
  const now = new Date().toISOString();
  const stage =
    seerrStatus != null
      ? deriveStage({ status: seerrStatus, media: { status: mediaStatus } })
      : STAGES.PENDING;

  const record = {
    requestId: requestId ?? null,
    tmdbId,
    mediaType,
    title,
    discordUserId,
    stage,
    seerrStatus: seerrStatus ?? null,
    mediaStatus: mediaStatus ?? null,
    requestedAt: now,
    updatedAt: now,
  };

  records.set(keyFor(record), record);
  save();
  return record;
}

/**
 * Bulk reconcile against an array of Seerr request objects. Matches existing
 * records by requestId only; unknown ids are ignored (not created).
 */
export function updateFromSeerr(reqArray) {
  if (!Array.isArray(reqArray)) return;
  let changed = false;

  for (const req of reqArray) {
    if (req?.id == null) continue;
    const record = records.get(String(req.id));
    if (!record) continue;

    record.seerrStatus = req.status ?? null;
    record.mediaStatus = req.media?.status ?? null;
    record.stage = deriveStage(req);
    record.updatedAt = new Date().toISOString();
    changed = true;
  }

  if (changed) save();
}

/**
 * Backfill records for Seerr requests not yet tracked by the store, attributing
 * them to the given Discord user. Only safe to call with requests known to
 * belong to that user (e.g. fetchSeerrUserRequestsFull via the requestedBy
 * filter) — never with a global fetch, which mixes other users' requests.
 * Existing requestIds and requests without a TMDB id are skipped.
 *
 * Seerr's request `media` object frequently has no title/name; such records are
 * stored with title null and resolved later by resolveMissingTitles (the single
 * TMDB-resolution path), which also covers records persisted before this existed.
 *
 * @returns {number} how many records were added
 */
export function backfillFromSeerr(reqArray, discordUserId) {
  if (!Array.isArray(reqArray) || !discordUserId) return 0;
  const now = new Date().toISOString();
  let added = 0;

  for (const req of reqArray) {
    if (req?.id == null) continue;
    const key = String(req.id);
    if (records.has(key)) continue; // already tracked (by click-time add or prior backfill)

    const tmdbId = req.media?.tmdbId;
    if (tmdbId == null) continue; // can't build a useful record without a TMDB id

    const mediaType = (req.media?.mediaType || req.type) === "tv" ? "tv" : "movie";
    const title =
      req.media?.title || req.media?.name || req.media?.originalTitle || req.media?.originalName || null;

    records.set(key, {
      requestId: req.id,
      tmdbId,
      mediaType,
      title,
      discordUserId,
      stage: deriveStage(req),
      seerrStatus: req.status ?? null,
      mediaStatus: req.media?.status ?? null,
      requestedAt: req.createdAt || now,
      updatedAt: now,
    });
    added++;
  }

  if (added > 0) save();
  return added;
}

/**
 * Resolve titles for a user's already-stored records that still have none.
 * updateFromSeerr never sets title and backfill skips existing requestIds, so
 * records persisted before a title was available (e.g. backfilled with null)
 * would otherwise stay title-less and render as "TMDB <id>" forever. Runs the
 * injected async resolver only for those records and persists any results.
 *
 * @returns {Promise<number>} how many titles were resolved
 */
export async function resolveMissingTitles(discordUserId, resolveTitle) {
  if (!discordUserId || typeof resolveTitle !== "function") return 0;

  const pending = [...records.values()].filter(
    (r) => r.discordUserId === discordUserId && !r.title && r.tmdbId != null
  );

  // Resolve in parallel — TMDB lookups are independent and the result set is
  // small (a user's open requests). Each lookup is best-effort and isolated.
  const results = await Promise.all(
    pending.map(async (record) => {
      try {
        const title = await resolveTitle(record.tmdbId, record.mediaType);
        if (title) {
          record.title = title;
          return true;
        }
      } catch {
        /* best-effort; embed falls back to "TMDB <id>" */
      }
      return false;
    })
  );

  const resolved = results.filter(Boolean).length;
  if (resolved > 0) save();
  return resolved;
}

/** All records for a given Discord user (for the /queue view). */
export function getByUser(discordUserId) {
  return [...records.values()].filter((r) => r.discordUserId === discordUserId);
}

/** Drop completed (Available/Declined) entries older than maxAgeDays. */
export function prune(maxAgeDays = 30) {
  const cutoff = Date.now() - maxAgeDays * 86400_000;
  let changed = false;

  for (const [key, record] of records) {
    if (!COMPLETED_STAGES.has(record.stage)) continue;
    if (new Date(record.updatedAt).getTime() < cutoff) {
      records.delete(key);
      changed = true;
    }
  }

  if (changed) save();
}

/** Remove all in-memory records (does not touch disk). */
export function clear() {
  records.clear();
}

export function save() {
  try {
    const serialized = {};
    for (const [key, record] of records) {
      serialized[key] = record;
    }
    const tmp = STORE_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(serialized, null, 2), { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(tmp, STORE_PATH);
  } catch (err) {
    logger.warn(`⚠️ Failed to persist request store to disk: ${err.message}`);
  }
}

export function load() {
  records.clear();
  if (!fs.existsSync(STORE_PATH)) return;
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    for (const [key, record] of Object.entries(parsed)) {
      records.set(key, record);
    }
    logger.info(`✅ Loaded ${records.size} request-store record(s) from disk`);
  } catch (err) {
    logger.warn(`⚠️ Failed to load request store from disk: ${err.message}`);
  }
}
