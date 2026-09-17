import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
} from "discord.js";
import { registerCommands } from "../discord/commands.js";
import { botState, loadPendingRequests } from "./botState.js";
import { load as loadRequestStore, prune as pruneRequestStore } from "../utils/requestStore.js";
import { registerInteractions } from "./interactions.js";
import { stopCleanupAdvisor } from "./cleanupAdvisor.js";
import { startJellyfinPoller, stopJellyfinPoller } from "./jellyfinPoller.js";
import { startSeerrStatusPoller, stopSeerrStatusPoller } from "./seerrStatusPoller.js";
import { startHealthAlertPoller } from "./healthAlertPoller.js";
import { rescheduleTimedJobs } from "./jobScheduler.js";
import { loadConfigToEnv } from "../utils/configFile.js";
import logger from "../utils/logger.js";

/**
 * True if `err` looks like discord.js's DisallowedIntents error — thrown when
 * the client requests a privileged intent (e.g. GuildMembers) that hasn't been
 * enabled for this application yet under Developer Portal → Bot → Privileged
 * Gateway Intents. Matched by name AND message substring since discord.js has
 * changed how reliably this rejects `client.login()` across versions (see
 * https://github.com/discordjs/discord.js/issues/9621) — callers should check
 * this from multiple listeners (login().catch, client 'error', client
 * 'shardError'), not just the login promise alone.
 */
export function isDisallowedIntentsError(err) {
  if (!err) return false;
  if (err.name === "DisallowedIntents") return true;
  const msg = String(err.message || "").toLowerCase();
  return msg.includes("disallowed intent");
}

export async function startBot() {
  if (botState.isBotRunning && botState.discordClient) {
    logger.info("Bot is already running.");
    return { success: true, message: "Bot is already running." };
  }

  loadPendingRequests();
  loadRequestStore();
  pruneRequestStore(); // drop completed entries older than 30 days on each start

  const configLoaded = loadConfigToEnv();
  if (!configLoaded) {
    throw new Error(
      "Configuration file (config.json) not found or is invalid."
    );
  }

  // ----------------- VALIDATE ENV -----------------
  const REQUIRED_DISCORD = ["DISCORD_TOKEN", "BOT_ID"];
  const missing = REQUIRED_DISCORD.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `Bot cannot start. Missing required Discord variables: ${missing.join(", ")}`
    );
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.Channel],
  });
  botState.discordClient = client;

  // ----------------- REGISTER COMMANDS -----------------
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    await registerCommands(
      rest,
      process.env.BOT_ID,
      process.env.GUILD_ID,
      logger
    );
  } catch (err) {
    logger.error(
      `[REGISTER COMMANDS] Failed to register Discord commands:`,
      err
    );
    throw new Error(`Failed to register Discord commands: ${err.message}`);
  }

  // ----------------- REGISTER INTERACTIONS -----------------
  registerInteractions(client);

  // ----------------- LOGIN -----------------
  return new Promise((resolve, reject) => {
    let settled = false;

    const failWithDisallowedIntents = (err) => {
      if (settled) return;
      settled = true;
      logger.error(
        "[DISCORD LOGIN ERROR] Server Members Intent is not enabled for this application " +
          "(Developer Portal → Bot → Privileged Gateway Intents). Original error: " +
          (err?.message || err)
      );
      botState.isBotRunning = false;
      botState.discordClient = null;
      const wrapped = new Error(
        "Server Members Intent is not enabled for this bot application. Enable it under " +
          "Developer Portal → Bot → Privileged Gateway Intents, then start the bot again."
      );
      wrapped.code = "DISALLOWED_INTENTS";
      reject(wrapped);
    };

    // discord.js's handling of this error has been inconsistent across versions
    // (github.com/discordjs/discord.js/issues/9621) — sometimes it rejects
    // login() cleanly, sometimes it only surfaces via an 'error'/'shardError'
    // event. Listen on all three so the dashboard reliably gets a clear cause
    // instead of a generic timeout/crash.
    client.on("error", (err) => {
      if (isDisallowedIntentsError(err)) failWithDisallowedIntents(err);
    });
    client.on("shardError", (err) => {
      if (isDisallowedIntentsError(err)) failWithDisallowedIntents(err);
    });

    client.once("clientReady", async () => {
      if (settled) return;
      settled = true;
      logger.info(`✅ Bot logged in as ${client.user.tag}`);
      botState.isBotRunning = true;
      botState.botStartedAt = Date.now();

      rescheduleTimedJobs(client);
      startJellyfinPoller(client);
      startSeerrStatusPoller();
      startHealthAlertPoller(client);

      resolve({ success: true, message: `Logged in as ${client.user.tag}` });
    });

    client.login(process.env.DISCORD_TOKEN).catch((err) => {
      if (isDisallowedIntentsError(err)) {
        failWithDisallowedIntents(err);
        return;
      }
      if (settled) return;
      settled = true;
      logger.error("[DISCORD LOGIN ERROR] Bot login failed:");
      if (err && err.message) {
        logger.error("[DISCORD LOGIN ERROR] Message:", err.message);
      }
      if (err && err.code) {
        logger.error("[DISCORD LOGIN ERROR] Code:", err.code);
      }
      if (err && err.stack) {
        logger.error("[DISCORD LOGIN ERROR] Stack:", err.stack);
      }
      botState.isBotRunning = false;
      botState.discordClient = null;
      reject(err);
    });
  });
}
