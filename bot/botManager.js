import path from "path";
import { fileURLToPath } from "url";
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
import { stopSubscriptionPoller } from "./subscriptionPoller.js";
import { stopWeeklyDigest } from "./weeklyDigest.js";
import { rescheduleTimedJobs } from "./jobScheduler.js";
import { loadConfigToEnv } from "../utils/configFile.js";
import logger from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_BOT_AVATAR_PATH = path.join(__dirname, "..", "assets", "discord-avatar.png");

/**
 * Uploads the Questorr logo as the bot's Discord avatar, but only the first
 * time — i.e. only while the application still has Discord's default (empty)
 * avatar. Never overwrites an avatar the user set manually, and never throws:
 * a failure here (missing file, rate limit, no permission) must not break bot
 * startup.
 */
async function setDefaultAvatarIfUnset(client) {
  if (client.user.avatar) return; // already customized — leave it alone
  try {
    await client.user.setAvatar(DEFAULT_BOT_AVATAR_PATH);
    logger.info("✅ No bot avatar was set — uploaded the default Questorr logo");
  } catch (err) {
    logger.warn(`⚠️ Could not set the default bot avatar: ${err.message}`);
  }
}

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
  // isBotRunning alone leaves a 1-5s gap between calling this function and
  // Discord confirming login (clientReady) where a second start trigger —
  // two dashboard tabs, or AUTO_START_BOT racing a manual click — would pass
  // the guard above and spin up a second Client. isStarting closes that gap;
  // it's set synchronously below, before any await.
  if (botState.isStarting) {
    logger.info("Bot start already in progress.");
    return { success: false, message: "Bot start already in progress." };
  }
  botState.isStarting = true;

  try {
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

    // registerCommands() already logs the full error and throws a fully
    // formatted "Failed to register Discord commands: ..." Error — wrapping
    // it again here just duplicated that same prefix in the message the
    // dashboard shows the user. Let it propagate as-is.
    await registerCommands(
      rest,
      process.env.BOT_ID,
      process.env.GUILD_ID,
      logger
    );

    // ----------------- REGISTER INTERACTIONS -----------------
    registerInteractions(client);

    // ----------------- LOGIN -----------------
    return await new Promise((resolve, reject) => {
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
        botState.isStarting = false;
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
        botState.isStarting = false;

        rescheduleTimedJobs(client);
        startJellyfinPoller(client);
        startSeerrStatusPoller();
        startHealthAlertPoller(client);
        setDefaultAvatarIfUnset(client); // fire-and-forget, never blocks startup

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
        botState.isStarting = false;
        reject(err);
      });
    });
  } catch (err) {
    botState.isStarting = false;
    throw err;
  }
}

/**
 * Mirror of startBot(): tears down every background timer/poller it started
 * (Jellyfin poller, Seerr status poller, cleanup advisor, subscription
 * poller, weekly digest) before destroying the Discord client. Without this,
 * stopping the bot only disconnected the Discord client — the scheduled jobs
 * kept firing in the background with botState.discordClient already null.
 */
export async function stopBot() {
  stopJellyfinPoller();
  stopSeerrStatusPoller();
  stopCleanupAdvisor();
  stopSubscriptionPoller();
  stopWeeklyDigest();
  if (botState.discordClient) {
    await botState.discordClient.destroy();
  }
  botState.isBotRunning = false;
  botState.discordClient = null;
  botState.botStartedAt = null;
}
