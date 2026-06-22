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
};

const COMPLETED_STAGES = new Set([STAGES.AVAILABLE, STAGES.DECLINED]);

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

  if (status === 3) return STAGES.DECLINED;
  if (status === 1) return STAGES.PENDING;
  if (status === 2) {
    if (mediaStatus === 5) return STAGES.AVAILABLE;
    if (mediaStatus === 4) return STAGES.PARTIALLY_AVAILABLE;
    return STAGES.PROCESSING;
  }
  return STAGES.PENDING;
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
