import { Router } from "express";
import fs from "fs";
import path from "path";
import { authenticateToken } from "../utils/auth.js";
import logger from "../utils/logger.js";

const router = Router();

const DEFAULT_LIMIT = 2000;
const MAX_LIMIT = 10000;

// Parse one raw log line (JSON from the file transport, or the human console
// format) into { timestamp, level, message }.
export function parseLine(line) {
  try {
    const j = JSON.parse(line);
    return { timestamp: j.timestamp || "N/A", level: j.level || "unknown", message: j.message || "" };
  } catch {
    const m = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+(\w+):\s+(.+)$/);
    if (m) return { timestamp: m[1], level: m[2], message: m[3] };
    return { timestamp: "N/A", level: "unknown", message: line };
  }
}

// Read and parse a whole log file, newest entry first. Empty when missing.
export function readEntries(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter((l) => l.trim());
    const entries = lines.map(parseLine);
    entries.reverse(); // newest first
    return entries;
  } catch (error) {
    logger.error("Error parsing log file:", error);
    return [];
  }
}

// Apply level / source-tag / free-text filters. Each filter is optional.
export function filterEntries(entries, { level, source, q } = {}) {
  const lvl = level && level !== "all" ? String(level).toLowerCase() : null;
  const src = source && source !== "all" ? source : null;
  const text = q ? String(q).toLowerCase() : null;
  return entries.filter((e) => {
    if (lvl && String(e.level).toLowerCase() !== lvl) return false;
    if (src && !e.message.includes(src)) return false;
    if (text && !e.message.toLowerCase().includes(text)) return false;
    return true;
  });
}

// Slice a filtered list into an offset/limit page plus pagination metadata.
export function paginate(filtered, offset = 0, limit = DEFAULT_LIMIT) {
  const off = Math.max(0, Number.isFinite(offset) ? offset : 0);
  const lim = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(limit) ? limit : DEFAULT_LIMIT));
  const page = filtered.slice(off, off + lim);
  return { page, total: filtered.length, offset: off, limit: lim, hasMore: off + lim < filtered.length };
}

// Resolve the newest rotated log file matching `prefix` (e.g. "combined-"),
// falling back to "<base>.log".
function latestLogFile(logsDir, prefix, fallback) {
  let target = path.join(logsDir, fallback);
  try {
    const files = fs.readdirSync(logsDir).filter((f) => f.startsWith(prefix) && f.endsWith(".log"));
    if (files.length > 0) {
      files.sort().reverse();
      target = path.join(logsDir, files[0]);
    }
  } catch {
    // fall back to default path
  }
  return target;
}

function makeHandler(prefix, fallback) {
  return (req, res) => {
    const logsDir = path.join(process.cwd(), "logs");
    const filePath = latestLogFile(logsDir, prefix, fallback);

    const all = readEntries(filePath);
    const filtered = filterEntries(all, {
      level: req.query.level,
      source: req.query.source,
      q: req.query.q,
    });
    const limit = parseInt(req.query.limit, 10) || DEFAULT_LIMIT;
    const offset = parseInt(req.query.offset, 10) || 0;
    const { page, total, hasMore } = paginate(filtered, offset, limit);

    res.json({
      file: path.basename(filePath),
      entries: page,
      count: page.length,
      total,
      offset: Math.max(0, offset),
      limit,
      hasMore,
    });
  };
}

router.get("/logs/error", authenticateToken, makeHandler("error-", "error.log"));
router.get("/logs/all", authenticateToken, makeHandler("combined-", "combined.log"));

export default router;
