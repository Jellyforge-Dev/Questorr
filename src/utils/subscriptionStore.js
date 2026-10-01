import fs from "fs";
import path from "path";
import { CONFIG_PATH } from "./configFile.js";
import logger from "./logger.js";

/**
 * Subscriptions: per-user series subscriptions (DM on a new season appearing in
 * Jellyfin) and per-user opt-in for the weekly recommendation DM. Persisted like
 * the other stores (atomic tmp+rename, mode 0600).
 */

const STORE_PATH = path.join(path.dirname(CONFIG_PATH), "subscription-store.json");

// series: array of { discordUserId, tmdbId, title, seasonCount }
let series = [];
// weekly opt-in: set of discordUserId
const weekly = new Set();

function sameSub(a, discordUserId, tmdbId) {
  return a.discordUserId === String(discordUserId) && a.tmdbId === Number(tmdbId);
}

export function addSeries({ discordUserId, tmdbId, title, seasonCount }) {
  const uid = String(discordUserId);
  const id = Number(tmdbId);
  if (series.some((s) => sameSub(s, uid, id))) return false;
  series.push({ discordUserId: uid, tmdbId: id, title: title ?? null, seasonCount: Number(seasonCount) || 0 });
  save();
  return true;
}

export function removeSeries(discordUserId, tmdbId) {
  const before = series.length;
  series = series.filter((s) => !sameSub(s, discordUserId, tmdbId));
  const removed = series.length < before;
  if (removed) save();
  return removed;
}

export function getSeriesByUser(discordUserId) {
  return series.filter((s) => s.discordUserId === String(discordUserId));
}

export function allSeries() {
  return [...series];
}

export function updateSeasonCount(discordUserId, tmdbId, count) {
  const sub = series.find((s) => sameSub(s, discordUserId, tmdbId));
  if (!sub) return false;
  sub.seasonCount = Number(count) || 0;
  save();
  return true;
}

export function toggleWeekly(discordUserId) {
  const uid = String(discordUserId);
  if (weekly.has(uid)) weekly.delete(uid);
  else weekly.add(uid);
  save();
  return weekly.has(uid);
}

export function isWeeklyEnabled(discordUserId) {
  return weekly.has(String(discordUserId));
}

export function getWeeklyUsers() {
  return [...weekly];
}

export function clear() {
  series = [];
  weekly.clear();
}

export function save() {
  try {
    const tmp = STORE_PATH + ".tmp";
    const data = JSON.stringify({ series, weekly: [...weekly] }, null, 2);
    fs.writeFileSync(tmp, data, { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(tmp, STORE_PATH);
  } catch (err) {
    logger.warn(`⚠️ Failed to persist subscription store: ${err.message}`);
  }
}

export function load() {
  clear();
  if (!fs.existsSync(STORE_PATH)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
    if (Array.isArray(parsed.series)) series = parsed.series;
    if (Array.isArray(parsed.weekly)) parsed.weekly.forEach((id) => weekly.add(String(id)));
  } catch (err) {
    logger.warn(`⚠️ Failed to load subscription store: ${err.message}`);
  }
}

load();
