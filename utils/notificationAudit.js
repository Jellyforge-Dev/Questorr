import fs from "fs";
import path from "path";
import { CONFIG_PATH } from "./configFile.js";
import logger from "./logger.js";

/**
 * Notification audit trail. Every decision to post or skip a media notification
 * is recorded here (source, channel, dedup reason, title, tmdbId, event), so the
 * admin can answer "what was posted where and why?" from the dashboard — the
 * 5-tier channel routing + cross-source dedup is otherwise a black box.
 *
 * Bounded ring buffer, persisted to config/notification-audit.json.
 */

const MAX_ENTRIES = 200;
const AUDIT_PATH = path.join(path.dirname(CONFIG_PATH), "notification-audit.json");

const entries = []; // oldest first

export function recordNotification(entry) {
  entries.push({ ...entry, at: new Date().toISOString() });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  save();
}

/** Most recent entries, newest first. */
export function getRecentNotifications(limit = 50) {
  return entries.slice(-limit).reverse();
}

export function clear() {
  entries.length = 0;
}

export function save() {
  try {
    const tmp = AUDIT_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(entries), { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(tmp, AUDIT_PATH);
  } catch (err) {
    logger.warn(`⚠️ Failed to persist notification audit: ${err.message}`);
  }
}

export function load() {
  entries.length = 0;
  if (!fs.existsSync(AUDIT_PATH)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(AUDIT_PATH, "utf-8"));
    if (Array.isArray(parsed)) entries.push(...parsed.slice(-MAX_ENTRIES));
  } catch (err) {
    logger.warn(`⚠️ Failed to load notification audit: ${err.message}`);
  }
}

load();
