/**
 * Discord Slash Command Definitions
 * Defines all slash commands for the Discord bot
 */

import { SlashCommandBuilder } from "discord.js";

/**
 * Get all command definitions
 * @returns {Array} Array of command builders
 */
export function getCommands() {
  // Debug: log current SHOW_ env values
  const showTag = process.env.SHOW_TAG_SELECTION;
  const showServer = process.env.SHOW_SERVER_SELECTION;
  const showQuality = process.env.SHOW_QUALITY_SELECTION;
  console.log(`[getCommands] SHOW_TAG=${showTag} SHOW_SERVER=${showServer} SHOW_QUALITY=${showQuality}`);

  return [
    new SlashCommandBuilder()
      .setName("search")
      .setDescription("Search for a movie/TV show (you can request it later)")
      .addStringOption((opt) =>
        opt
          .setName("title")
          .setDescription("Title")
          .setRequired(true)
          .setAutocomplete(true)
      ),
    (() => {
      const cmd = new SlashCommandBuilder()
        .setName("request")
        .setDescription("Send instant request for a movie/TV show")
        .addStringOption((opt) =>
          opt
            .setName("title")
            .setDescription("Title")
            .setRequired(true)
            .setAutocomplete(true)
        );

      // Conditionally add tag, server, quality options based on config
      if (process.env.SHOW_TAG_SELECTION === "true") {
        cmd.addStringOption((opt) =>
          opt
            .setName("tag")
            .setDescription("Select a tag for this request (optional, e.g., anime)")
            .setRequired(false)
            .setAutocomplete(true)
        );
      }

      if (process.env.SHOW_SERVER_SELECTION === "true") {
        cmd.addStringOption((opt) =>
          opt
            .setName("server")
            .setDescription("Select a Radarr/Sonarr server (optional, uses default if not specified)")
            .setRequired(false)
            .setAutocomplete(true)
        );
      }

      if (process.env.SHOW_QUALITY_SELECTION === "true") {
        cmd.addStringOption((opt) =>
          opt
            .setName("quality")
            .setDescription("Select a quality profile (optional, uses default if not specified)")
            .setRequired(false)
            .setAutocomplete(true)
        );
      }

      return cmd;
    })(),
    new SlashCommandBuilder()
      .setName("trending")
      .setDescription("Browse trending movies and TV shows")
      .addStringOption((opt) =>
        opt
          .setName("title")
          .setDescription("Select from trending content")
          .setRequired(true)
          .setAutocomplete(true)
      ),
    ...(process.env.SHOW_STATUS_COMMAND !== "false" ? [
      new SlashCommandBuilder()
        .setName("status")
        .setDescription("Check the request status of a movie or TV show in Seerr")
        .addStringOption((opt) =>
          opt.setName("title").setDescription("Title to check").setRequired(true).setAutocomplete(true)
        ),
    ] : []),
    new SlashCommandBuilder()
      .setName("history")
      .setDescription("View recently added movies and series on Jellyfin")
      .addStringOption((opt) =>
        opt
          .setName("type")
          .setDescription("Filter by type")
          .setRequired(false)
          .addChoices(
            { name: "📋 All", value: "all" },
            { name: "🎬 Movies", value: "movie" },
            { name: "📺 Series", value: "series" }
          )
      ),
    new SlashCommandBuilder()
      .setName("upcoming")
      .setDescription("Browse upcoming movie releases and new TV shows from TMDB")
      .addStringOption((opt) =>
        opt
          .setName("type")
          .setDescription("Filter by type")
          .setRequired(false)
          .addChoices(
            { name: "📋 All", value: "all" },
            { name: "🎬 Movies", value: "movie" },
            { name: "📺 TV Shows", value: "tv" }
          )
      ),
    new SlashCommandBuilder()
      .setName("watchlist")
      .setDescription("View recent media requests from Seerr")
      .addStringOption((opt) =>
        opt
          .setName("filter")
          .setDescription("Filter requests")
          .setRequired(false)
          .addChoices(
            { name: "📋 All Requests", value: "all" },
            { name: "👤 My Requests", value: "mine" },
            { name: "⏳ Pending", value: "pending" },
            { name: "✅ Available", value: "available" }
          )
      ),
    ...(process.env.SHOW_RANDOM_COMMAND !== "false" ? [
      new SlashCommandBuilder()
        .setName("random")
        .setDescription("Get a random movie or TV show from your Jellyfin library")
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("Movie or Series?")
            .setRequired(true)
            .addChoices(
              { name: "🎬 Movie", value: "movie" },
              { name: "📺 Series", value: "series" }
            )
        ),
    ] : []),
  ].map((c) => c.toJSON());
}

/**
 * Register commands with Discord
 * @param {REST} rest - Discord REST client
 * @param {string} botId - Bot application ID
 * @param {string} guildId - Guild ID to register commands in
 * @param {Function} logger - Logger instance
 */
export async function registerCommands(rest, botId, guildId, logger) {
  try {
    const commands = getCommands();

    // Log exact command options being registered
    const requestCmd = commands.find(c => c.name === "request");
    const optionNames = requestCmd?.options?.map(o => o.name) || [];
    logger.info(`[registerCommands] /request options being sent to Discord: [${optionNames.join(", ") || "none"}]`);

    if (guildId) {
      // Guild-specific registration: instant propagation (no caching delay)
      const guildEndpoint = `/applications/${botId}/guilds/${guildId}/commands`;
      await rest.put(guildEndpoint, { body: commands });
      logger.info("✅ Guild commands registered successfully!");

      // Also clear any global commands that might override guild commands
      try {
        const globalEndpoint = `/applications/${botId}/commands`;
        const globalCmds = await rest.get(globalEndpoint);
        if (globalCmds && globalCmds.length > 0) {
          logger.info(`[registerCommands] Found ${globalCmds.length} global commands – clearing to prevent override...`);
          await rest.put(globalEndpoint, { body: [] });
          logger.info("[registerCommands] ✅ Global commands cleared.");
        }
      } catch (globalErr) {
        logger.warn("[registerCommands] Could not check/clear global commands:", globalErr.message);
      }
    } else {
      // No GUILD_ID configured – fall back to global (up to 1 hour delay)
      logger.warn("⚠️ No GUILD_ID configured – registering global commands (up to 1 hour to update).");
      const globalEndpoint = `/applications/${botId}/commands`;
      await rest.put(globalEndpoint, { body: commands });
      logger.info("✅ Global commands registered successfully!");
    }
  } catch (err) {
    logger.error(`❌ Failed to register Discord commands: ${err.message}`);
    if (err.response) {
      logger.error(`Response data:`, err.response.data);
    }
    throw new Error(`Failed to register Discord commands: ${err.message}`);
  }
}
