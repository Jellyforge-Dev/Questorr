import { Router } from "express";
import { authenticateToken } from "../utils/auth.js";
import { readConfig } from "../utils/configFile.js";
import { sanitizeConfigForClient } from "../utils/configSanitize.js";
import { WEBHOOK_SECRET } from "../utils/auth.js";
import { configTemplate } from "../lib/config.js";
import { getAvailableLanguages } from "../utils/availableLanguages.js";
import logger from "../utils/logger.js";

const router = Router();

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
  "Surrogate-Control": "no-store",
};

router.get("/config", authenticateToken, (req, res) => {
  Object.entries(NO_CACHE_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  const config = readConfig();
  // Merge template defaults with saved config so new keys always have defaults
  // even when config.json was created before those keys existed.
  const merged = { ...configTemplate, ...(config || {}) };
  res.json(sanitizeConfigForClient(merged));
});

router.get("/webhook-secret", authenticateToken, (req, res) => {
  Object.entries(NO_CACHE_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  logger.info(`[Security] Webhook secret accessed from ${req.ip}`);
  const freshSecret = process.env.WEBHOOK_SECRET || WEBHOOK_SECRET || null;
  res.json({ secret: freshSecret });
});

router.get("/widget-api-key", authenticateToken, (req, res) => {
  Object.entries(NO_CACHE_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  logger.info(`[Security] Widget API key accessed from ${req.ip}`);
  res.json({ key: process.env.WIDGET_API_KEY || null });
});

router.get("/languages", async (req, res) => {
  res.json(getAvailableLanguages());
});

export default router;
