import axios from "axios";
import { EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { t } from "../utils/botStrings.js";

/**
 * Proactive health alerts. Periodically checks whether Seerr and Jellyfin are
 * reachable and posts to an admin channel on state changes (down / recovered).
 * The first poll only records a baseline (no alert) so a restart doesn't spam.
 */

let intervalId = null;
const lastState = {}; // service → "reachable" | "unreachable"

/**
 * Pure transition detector. Returns the alerts to send for a state change.
 * A service with no previous state (baseline) never alerts.
 */
export function computeTransitions(prev, curr) {
  const out = [];
  for (const svc of Object.keys(curr)) {
    const was = prev[svc];
    const now = curr[svc];
    if (was === undefined || was === now) continue;
    if (now === "unreachable") out.push({ service: svc, type: "down" });
    else if (now === "reachable" && was === "unreachable") out.push({ service: svc, type: "up" });
  }
  return out;
}

async function checkServices() {
  const state = {};
  const checks = [];
  if (process.env.SEERR_URL && process.env.SEERR_API_KEY) {
    const base = process.env.SEERR_URL.replace(/\/+$/, "");
    checks.push(
      axios.get(`${base}/api/v1/status`, { headers: { "X-Api-Key": process.env.SEERR_API_KEY }, timeout: 5000 })
        .then(() => { state.seerr = "reachable"; })
        .catch(() => { state.seerr = "unreachable"; })
    );
  }
  if (process.env.JELLYFIN_BASE_URL && process.env.JELLYFIN_API_KEY) {
    const base = process.env.JELLYFIN_BASE_URL.replace(/\/+$/, "");
    checks.push(
      axios.get(`${base}/System/Info`, { headers: { "X-Emby-Token": process.env.JELLYFIN_API_KEY }, timeout: 5000 })
        .then(() => { state.jellyfin = "reachable"; })
        .catch(() => { state.jellyfin = "unreachable"; })
    );
  }
  await Promise.allSettled(checks);
  return state;
}

function resolveChannel() {
  return (
    process.env.HEALTH_ALERT_CHANNEL_ID ||
    process.env.SEERR_ADMIN_CHANNEL_ID ||
    process.env.SEERR_CHANNEL_ID ||
    process.env.JELLYFIN_CHANNEL_ID ||
    null
  );
}

const LABELS = { seerr: "Seerr", jellyfin: "Jellyfin" };

async function tick(client) {
  try {
    const curr = await checkServices();
    const transitions = computeTransitions(lastState, curr);
    Object.assign(lastState, curr);
    if (!transitions.length) return;

    const channelId = resolveChannel();
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    for (const tr of transitions) {
      const name = LABELS[tr.service] || tr.service;
      const down = tr.type === "down";
      const embed = new EmbedBuilder()
        .setColor(down ? "#f0596b" : "#2ecc8e")
        .setTitle(down ? t("health_alert_down_title") : t("health_alert_up_title"))
        .setDescription(t(down ? "health_alert_down_body" : "health_alert_up_body", { service: name }))
        .setTimestamp();
      await channel.send({ embeds: [embed] }).catch((e) => logger.warn(`[healthAlerts] send failed: ${e.message}`));
      logger.info(`[healthAlerts] ${name} → ${tr.type}`);
    }
  } catch (e) {
    logger.warn(`[healthAlerts] tick failed: ${e.message}`);
  }
}

export function startHealthAlertPoller(client) {
  if (process.env.HEALTH_ALERTS_ENABLED !== "true") return;
  stopHealthAlertPoller();
  const sec = Math.max(30, parseInt(process.env.HEALTH_ALERT_INTERVAL_SECONDS, 10) || 120);
  tick(client); // baseline (no alerts on first run)
  intervalId = setInterval(() => tick(client), sec * 1000);
  logger.info(`[healthAlerts] enabled — checking Seerr/Jellyfin every ${sec}s`);
}

export function stopHealthAlertPoller() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  for (const k of Object.keys(lastState)) delete lastState[k];
}
