import fs from "fs";
import path from "path";
import { CONFIG_PATH } from "./configFile.js";
import logger from "./logger.js";

/**
 * Admin audit trail. Records security-relevant admin actions — request
 * approve/decline (who clicked in Discord), dashboard config changes (key
 * names only, never secret values), bot start/stop/restart, and dashboard
 * logins — so an owner can answer "who did what, when?" with several people
 * administering Questorr.
 *
 * Bounded ring buffer, persisted to config/admin-audit.json. Secret VALUES
 * must never be passed in; callers log changed key names only.
 */

const MAX_ENTRIES = 500;
const AUDIT_PATH = path.join(path.dirname(CONFIG_PATH), "admin-audit.json");

const entries = []; // oldest first

/**
 * @param {{actor: string, action: string, target?: string, detail?: string}} entry
 */
export function recordAudit(entry) {
  entries.push({ ...entry, at: new Date().toISOString() });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  save();
}

/** Most recent entries, newest first. */
export function getRecentAudit(limit = 100) {
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
    logger.warn(`⚠️ Failed to persist admin audit: ${err.message}`);
  }
}

export function load() {
  entries.length = 0;
  if (!fs.existsSync(AUDIT_PATH)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(AUDIT_PATH, "utf-8"));
    if (Array.isArray(parsed)) entries.push(...parsed.slice(-MAX_ENTRIES));
  } catch (err) {
    logger.warn(`⚠️ Failed to load admin audit: ${err.message}`);
  }
}

load();
