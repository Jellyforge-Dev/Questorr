import fs from "fs";
import path from "path";
import { CONFIG_PATH } from "./configFile.js";
import logger from "./logger.js";

/**
 * Per-user opt-in for proactive "your request is now available" DMs (/notify).
 * A simple persisted set of Discord user IDs who opted in.
 */

const PREFS_PATH = path.join(path.dirname(CONFIG_PATH), "notify-prefs.json");
const enabled = new Set();

export function isNotifyEnabled(discordUserId) {
  return enabled.has(String(discordUserId));
}

/** Set explicit state; returns the new boolean state. */
export function setNotify(discordUserId, on) {
  const id = String(discordUserId);
  if (on) enabled.add(id);
  else enabled.delete(id);
  save();
  return on;
}

/** Flip current state; returns the new boolean state. */
export function toggleNotify(discordUserId) {
  return setNotify(discordUserId, !isNotifyEnabled(discordUserId));
}

export function clear() {
  enabled.clear();
}

export function save() {
  try {
    const tmp = PREFS_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify([...enabled]), { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(tmp, PREFS_PATH);
  } catch (err) {
    logger.warn(`⚠️ Failed to persist notify prefs: ${err.message}`);
  }
}

export function load() {
  enabled.clear();
  if (!fs.existsSync(PREFS_PATH)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(PREFS_PATH, "utf-8"));
    if (Array.isArray(parsed)) parsed.forEach((id) => enabled.add(String(id)));
  } catch (err) {
    logger.warn(`⚠️ Failed to load notify prefs: ${err.message}`);
  }
}

load();
