import fs from "fs";
import path from "path";
import { CONFIG_PATH } from "./configFile.js";
import logger from "./logger.js";

/**
 * Maps a Seerr issue id to the Discord user who reported it via /report.
 * Needed because issues are created with the Seerr API key, so Seerr attributes
 * them to the key owner — not the Discord reporter. We persist the mapping so
 * that when the issue is resolved we can DM the original reporter (with the
 * admin's resolving comment).
 *
 * Bounded, persisted to config/issue-reporters.json.
 */

const MAX_ENTRIES = 1000;
const FILE = path.join(path.dirname(CONFIG_PATH), "issue-reporters.json");

const map = new Map(); // issueId (string) → { discordUserId, title, at }

export function recordIssueReporter(issueId, discordUserId, title) {
  if (!issueId || !discordUserId) return;
  map.set(String(issueId), { discordUserId, title: title || "", at: new Date().toISOString() });
  if (map.size > MAX_ENTRIES) {
    const oldest = map.keys().next().value;
    map.delete(oldest);
  }
  save();
}

export function getIssueReporter(issueId) {
  return map.get(String(issueId)) || null;
}

export function removeIssueReporter(issueId) {
  if (map.delete(String(issueId))) save();
}

export function clear() {
  map.clear();
}

export function save() {
  try {
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify([...map.entries()]), { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(tmp, FILE);
  } catch (err) {
    logger.warn(`⚠️ Failed to persist issue reporters: ${err.message}`);
  }
}

export function load() {
  map.clear();
  if (!fs.existsSync(FILE)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf-8"));
    if (Array.isArray(parsed)) {
      for (const [k, v] of parsed) map.set(String(k), v);
    }
  } catch (err) {
    logger.warn(`⚠️ Failed to load issue reporters: ${err.message}`);
  }
}

load();
