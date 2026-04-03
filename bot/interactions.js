import { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from "discord.js";
import * as tmdbApi from "../api/tmdb.js";
import * as seerrApi from "../api/seerr.js";
import { fetchOMDbData } from "../api/omdb.js";
import { buildNotificationEmbed, buildButtons } from "./embeds.js";
import {
  getOptionStringRobust,
  parseQualityAndServerOptions,
  checkRolePermission,
  getSeerrAutoApprove,
} from "./botUtils.js";
import {
  botState,
  pendingRequests,
  savePendingRequests,
} from "./botState.js";
import { getUserMappings } from "../utils/configFile.js";
import { getSeerrApiUrl } from "../utils/seerrUrl.js";
import logger from "../utils/logger.js";
import { isValidUrl } from "../utils/url.js";
import { fetchRandomJellyfinItem, findJellyfinItemByTmdbId } from "../api/jellyfin.js";
import { ButtonBuilder, ButtonStyle } from "discord.js";

// ─── URL helpers (mirrors seerrWebhook.js) ────────────────────────────────────
function buildSeerrUrl(mediaType, tmdbId) {
  const base = (process.env.SEERR_URL || "").replace(/\/$/, "");
  if (!base || !tmdbId) return null;
  return `${base}/${mediaType === "movie" ? "movie" : "tv"}/${tmdbId}`;
}
function buildJellyfinUrl(itemId) {
  const base = (process.env.JELLYFIN_BASE_URL || "").replace(/\/$/, "");
  const serverId = process.env.JELLYFIN_SERVER_ID || "";
  if (!base || !itemId) return null;
  return `${base}/web/index.html#!/details?id=${itemId}&serverId=${serverId}`;
}


// Convenience accessors — read process.env at call time so config reloads are respected
const getSeerrUrl = () => getSeerrApiUrl(process.env.SEERR_URL || "");
const getSeerrApiKey = () => process.env.SEERR_API_KEY;
const getTmdbApiKey = () => process.env.TMDB_API_KEY;

// ----------------- COMMON SEARCH LOGIC -----------------
async function handleSearchOrRequest(
  interaction,
  rawInput,
  mode,
  tags = [],
  options = {}
) {
  const isPrivateMode = process.env.PRIVATE_MESSAGE_MODE === "true" || options.ephemeral === true;

  try {
    await interaction.deferReply({ ephemeral: isPrivateMode });
  } catch (err) {
    logger.error(`Failed to defer reply: ${err.message}`);
    return;
  }

  let tmdbId, mediaType;

  if (rawInput.includes("|")) {
    [tmdbId, mediaType] = rawInput.split("|");
  } else {
    const results = await tmdbApi.tmdbSearch(rawInput, getTmdbApiKey());
    const found = results.filter(
      (r) => r.media_type === "movie" || r.media_type === "tv"
    );
    if (found.length) {
      tmdbId = found[0].id;
      mediaType = found[0].media_type;
    }
  }

  if (!tmdbId || !mediaType) {
    if (isPrivateMode) {
      return interaction.editReply({
        content: "⚠️ The title seems to be invalid.",
      });
    } else {
      await interaction.deleteReply();
      return interaction.followUp({
        content: "⚠️ The title seems to be invalid.",
        flags: 64,
      });
    }
  }

  try {
    const details = await tmdbApi.tmdbGetDetails(
      tmdbId,
      mediaType,
      getTmdbApiKey()
    );

    if (mode === "request") {
      const status = await seerrApi.checkMediaStatus(
        tmdbId,
        mediaType,
        ["all"],
        getSeerrUrl(),
        getSeerrApiKey()
      );

      if (status.exists && status.available) {
        if (isPrivateMode) {
          await interaction.editReply({
            content: "✅ This content is already available in your library!",
            components: [],
            embeds: [],
          });
        } else {
          await interaction.deleteReply();
          await interaction.followUp({
            content: "✅ This content is already available in your library!",
            flags: 64,
          });
        }
        return;
      }

      let tagIds = [];
      if (tags && tags.length > 0) {
        try {
          const allTags = await seerrApi.fetchTags(
            getSeerrUrl(),
            getSeerrApiKey()
          );
          const relevantTags = Array.isArray(allTags)
            ? allTags.filter((tag) =>
              mediaType === "tv" ? tag.type === "sonarr" : tag.type === "radarr"
            )
            : [];

          tagIds = tags
            .map((tagLabel) => {
              const tag = relevantTags.find(
                (t) => (t.label || t.name) === tagLabel
              );
              return tag ? tag.id : null;
            })
            .filter((id) => id !== null);

          logger.debug(
            `Converted tag labels ${tags.join(", ")} to IDs: ${tagIds.join(", ")}`
          );
        } catch (err) {
          logger.warn("Failed to convert tag labels to IDs:", err?.message);
        }
      }

      const { profileId, serverId } = parseQualityAndServerOptions(
        options,
        mediaType
      );

      let seasonsToRequest = ["all"];
      if (mediaType === "tv" && details.seasons) {
        const seasonNumbers = details.seasons
          .filter((s) => s.season_number > 0)
          .map((s) => s.season_number);

        if (seasonNumbers.length > 0) {
          seasonsToRequest = seasonNumbers;
          logger.info(
            `[REQUEST] Resolved 'all' seasons to explicit list: ${seasonsToRequest.join(", ")}`
          );
        }
      }

      await seerrApi.sendRequest({
        tmdbId,
        mediaType,
        seasons: seasonsToRequest,
        tags: tagIds,
        profileId,
        serverId,
        seerrUrl: getSeerrUrl(),
        apiKey: getSeerrApiKey(),
        discordUserId: interaction.user.id,
        userMappings: getUserMappings(),
        isAutoApproved: getSeerrAutoApprove(),
      });
      logger.info(
        `[REQUEST] Discord User ${interaction.user.id} requested ${mediaType} ${tmdbId}. Auto-Approve: ${getSeerrAutoApprove()}`
      );

      if (process.env.NOTIFY_ON_AVAILABLE === "true") {
        const requestKey = `${tmdbId}-${mediaType}`;
        if (!pendingRequests.has(requestKey)) {
          pendingRequests.set(requestKey, new Set());
        }
        pendingRequests.get(requestKey).add(interaction.user.id);
        savePendingRequests();
      }
    }

    const imdbId = await tmdbApi.tmdbGetExternalImdb(
      tmdbId,
      mediaType,
      getTmdbApiKey()
    );

    const omdb = imdbId ? await fetchOMDbData(imdbId) : null;

    const embed = buildNotificationEmbed(
      details,
      mediaType,
      imdbId,
      mode === "request" ? "success" : "search",
      omdb,
      tmdbId
    );

    const components = buildButtons(
      tmdbId,
      imdbId,
      mode === "request",
      mediaType,
      details
    );

    const showTagSelection = process.env.SHOW_TAG_SELECTION !== "false";
    if (mediaType === "movie" && mode === "search" && showTagSelection) {
      try {
        const allTags = await seerrApi.fetchTags(
          getSeerrUrl(),
          getSeerrApiKey()
        );

        const radarrTags = Array.isArray(allTags)
          ? allTags.filter((tag) => tag.type === "radarr")
          : [];

        if (radarrTags && radarrTags.length > 0) {
          const uniqueTags = [];
          const seenIds = new Set();

          for (const tag of radarrTags) {
            if (!seenIds.has(tag.id)) {
              seenIds.add(tag.id);
              uniqueTags.push(tag);
            }
          }

          const tagOptions = uniqueTags.slice(0, 25).map((tag) => ({
            label: tag.label || tag.name || `Tag ${tag.id}`,
            value: tag.id.toString(),
          }));

          const tagMenu = new StringSelectMenuBuilder()
            .setCustomId(`select_tags|${tmdbId}|`)
            .setPlaceholder("Select tags (optional)")
            .addOptions(tagOptions)
            .setMinValues(0)
            .setMaxValues(Math.min(5, tagOptions.length));

          const tagRow = new ActionRowBuilder().addComponents(tagMenu);
          components.push(tagRow);
        }
      } catch (err) {
        logger.debug(
          "Failed to fetch tags for movie tag selector:",
          err?.message
        );
      }
    }

    await interaction.editReply({ embeds: [embed], components });
  } catch (err) {
    logger.error("Error in handleSearchOrRequest:", err);

    let errorMessage = "⚠️ An error occurred.";
    if (err.response && err.response.data && err.response.data.message) {
      errorMessage = `⚠️ Seerr error: ${err.response.data.message}`;
    } else if (err.message) {
      if (err.message.includes("403")) {
        errorMessage =
          "⚠️ Request failed: You might have exceeded your quota or don't have permission.";
      } else {
        errorMessage = `⚠️ Error: ${err.message}`;
      }
    }

    if (isPrivateMode) {
      await interaction.editReply({
        content: errorMessage,
        components: [],
        embeds: [],
      });
    } else {
      try {
        await interaction.deleteReply();
      } catch (e) {
        // ignore if already deleted
      }
      await interaction.followUp({
        content: errorMessage,
        flags: 64,
      });
    }
  }
}


// ─── /status Command Handler ──────────────────────────────────────────────────

// ─── Build rich description for /status embed ─────────────────────────────────
function buildStatusDescription(tmdbDetails, statusLine) {
  const parts = [statusLine];
  if (tmdbDetails) {
    const overview = tmdbDetails.overview;
    const genres = (tmdbDetails.genres || []).slice(0, 3).map(g => g.name).join(", ");
    const runtime = tmdbDetails.runtime
      ? `${Math.floor(tmdbDetails.runtime / 60)}h ${tmdbDetails.runtime % 60}m`
      : (tmdbDetails.episode_run_time?.[0]
        ? `~${tmdbDetails.episode_run_time[0]}m / ep`
        : null);
    const rating = tmdbDetails.vote_average ? `${tmdbDetails.vote_average.toFixed(1)}/10` : null;
    const ageRating = tmdbDetails.content_ratings?.results?.find(r => r.iso_3166_1 === "US")?.rating
      || tmdbDetails.release_dates?.results?.find(r => r.iso_3166_1 === "US")
         ?.release_dates?.find(d => d.certification)?.certification
      || null;

    const meta = [];
    if (genres) meta.push(`**Genre:** ${genres}`);
    if (runtime) meta.push(`**Runtime:** ${runtime}`);
    if (rating) meta.push(`**Rating:** ⭐ ${rating}`);
    if (ageRating) meta.push(`**Age Rating:** ${ageRating}`);
    if (meta.length > 0) parts.push(meta.join(" · "));
    if (overview) {
      const trimmed = overview.length > 300 ? overview.substring(0, 297) + "..." : overview;
      parts.push("\n" + trimmed);
    }
  }
  return parts.join("\n");
}

async function handleStatusCommand(interaction) {
  if (process.env.SHOW_STATUS_COMMAND === "false") {
    return interaction.reply({ content: "⚠️ The /status command is currently disabled.", flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });

  const raw = interaction.options.getString("title") || "";
  // Format: "tmdbId|media_type|title"
  const parts = raw.split("|");
  if (parts.length < 2) {
    return interaction.editReply({
      content: "❌ Please select a title from the dropdown suggestions.",
    });
  }

  const tmdbId = parseInt(parts[0], 10);
  const mediaType = parts[1]; // "movie" or "tv"
  const titleFromOption = parts.slice(2).join("|");

  const seerrUrl = getSeerrUrl();
  const seerrApiKey = getSeerrApiKey();

  // Fetch full TMDB details for rich embed (genres, runtime, rating, poster)
  let tmdbDetails = null;
  try {
    tmdbDetails = await tmdbApi.tmdbGetDetails(tmdbId, mediaType, getTmdbApiKey());
  } catch (_) {}

  if (!seerrUrl || !seerrApiKey) {
    return interaction.editReply({ content: "❌ Seerr is not configured." });
  }

  try {
    const result = await seerrApi.checkMediaStatus(tmdbId, mediaType, [], seerrUrl, seerrApiKey);

    // Seerr status codes: 1=Unknown, 2=Pending, 3=Processing, 4=Partially Available, 5=Available
    const statusMap = {
      1: { emoji: "❓", label: "Unknown" },
      2: { emoji: "⏳", label: "Pending Approval" },
      3: { emoji: "⬇️", label: "Processing / Downloading" },
      4: { emoji: "🟡", label: "Partially Available" },
      5: { emoji: "✅", label: "Available" },
      6: { emoji: "🗑️", label: "Deleted" },
      7: { emoji: "🔄", label: "Pending" },
    };

    const mediaTitle = result.data?.title || result.data?.name || titleFromOption;
    const mediaYear = result.data?.releaseDate?.slice(0, 4)
      || result.data?.firstAirDate?.slice(0, 4)
      || result.data?.release_date?.slice(0, 4)
      || result.data?.first_air_date?.slice(0, 4) || "";

    if (!result.exists || result.status == null) {
      const nfDesc = buildStatusDescription(tmdbDetails, "This title has not been requested yet.");
      const embed = new EmbedBuilder()
        .setColor("#89b4fa")
        .setTitle(`${mediaType === "movie" ? "🎬" : "📺"} ${mediaTitle}${mediaYear ? ` (${mediaYear})` : ""}`)
        .setDescription(nfDesc)
        .setTimestamp();
      if (tmdbDetails?.poster_path) {
        embed.setThumbnail(`https://image.tmdb.org/t/p/w500${tmdbDetails.poster_path}`);
      }
      const nfButtons = [
        new ButtonBuilder()
          .setCustomId(`status_request_btn|${tmdbId}|${mediaType}|${titleFromOption}`)
          .setLabel("📥 Request")
          .setStyle(ButtonStyle.Primary),
      ];
      const seerrNF = buildSeerrUrl(mediaType, tmdbId);
      if (seerrNF && isValidUrl(seerrNF)) {
        nfButtons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("View on Seerr").setURL(seerrNF));
      }
      return interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(nfButtons)] });
    }

    const statusInfo = statusMap[result.status] || { emoji: "❓", label: `Status ${result.status}` };

    const resultDesc = buildStatusDescription(tmdbDetails, `**Status:** ${statusInfo.emoji} ${statusInfo.label}`);
    const embed = new EmbedBuilder()
      .setColor(
        result.status === 5 ? "#1ec8a0" :
        result.status === 4 ? "#f9e2af" :
        result.status === 3 ? "#89b4fa" :
        result.status === 2 ? "#f0a05a" : "#6c7086"
      )
      .setTitle(`${mediaType === "movie" ? "🎬" : "📺"} ${mediaTitle}${mediaYear ? ` (${mediaYear})` : ""}`)
      .setDescription(resultDesc)
      .setTimestamp();

    // Poster: prefer TMDB, fallback to Seerr data
    const posterPath = tmdbDetails?.poster_path || result.data?.posterPath || result.data?.poster_path;
    if (posterPath) {
      embed.setThumbnail(`https://image.tmdb.org/t/p/w500${posterPath}`);
    }

    const statusButtons = [];
    const showSeerr = process.env.EMBED_SHOW_BUTTON_SEERR !== "false";
    const showWatch = process.env.EMBED_SHOW_BUTTON_WATCH !== "false";

    if (showSeerr) {
      const seerrLink = buildSeerrUrl(mediaType, tmdbId);
      if (seerrLink && isValidUrl(seerrLink)) {
        statusButtons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("View on Seerr").setURL(seerrLink));
      }
    }
    if (showWatch && result.status === 5) {
      const jfKey = process.env.JELLYFIN_API_KEY;
      const jfBase = process.env.JELLYFIN_BASE_URL;
      if (jfKey && jfBase) {
        try {
          const jfId = await findJellyfinItemByTmdbId(tmdbId, mediaType, titleFromOption, jfKey, jfBase);
          if (jfId) {
            const watchUrl = buildJellyfinUrl(jfId);
            if (watchUrl && isValidUrl(watchUrl)) {
              statusButtons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("▶ Watch Now!").setURL(watchUrl));
            }
          }
        } catch (_) {}
      }
    }
    const replyOpts = { embeds: [embed] };
    if (statusButtons.length > 0) replyOpts.components = [new ActionRowBuilder().addComponents(statusButtons)];
    return interaction.editReply(replyOpts);

  } catch (err) {
    logger.error("Status command error:", err);
    return interaction.editReply({
      content: "❌ Could not fetch status from Seerr. Please try again.",
    });
  }
}


// ─── /random Command Handler ──────────────────────────────────────────────────
async function handleRandomCommand(interaction) {
  if (process.env.SHOW_RANDOM_COMMAND === "false") {
    return interaction.reply({ content: "⚠️ The /random command is currently disabled.", flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });

  const type = interaction.options.getString("type") || "movie";
  const itemType = type === "movie" ? "Movie" : "Series";
  const emoji = type === "movie" ? "🎬" : "📺";
  const apiKey = process.env.JELLYFIN_API_KEY;
  const baseUrl = process.env.JELLYFIN_BASE_URL;

  if (!apiKey || !baseUrl) {
    return interaction.editReply({ content: "❌ Jellyfin is not configured." });
  }

  try {
    const item = await fetchRandomJellyfinItem(apiKey, baseUrl, itemType);
    if (!item) {
      return interaction.editReply({ content: `❌ No ${type} found in your Jellyfin library.` });
    }

    const year = item.ProductionYear ? ` (${item.ProductionYear})` : "";
    const genres = item.Genres?.slice(0, 3).join(", ") || "";
    const ageRating = item.OfficialRating || "";
    const communityRating = item.CommunityRating ? `${item.CommunityRating.toFixed(1)}/10` : null;
    const runtimeMin = item.RunTimeTicks ? Math.round(item.RunTimeTicks / 600000000) : null;
    const runtime = runtimeMin ? `${Math.floor(runtimeMin / 60)}h ${runtimeMin % 60}m` : null;
    const overview = item.Overview
      ? (item.Overview.length > 300 ? item.Overview.substring(0, 297) + "..." : item.Overview)
      : "";

    const meta = [];
    if (genres) meta.push(`**Genre:** ${genres}`);
    if (runtime) meta.push(`**Runtime:** ${runtime}`);
    if (communityRating) meta.push(`**Rating:** ⭐ ${communityRating}`);
    if (ageRating) meta.push(`**Age Rating:** ${ageRating}`);

    let description = meta.join(" · ");
    if (overview) description += `\n\n${overview}`;

    const embed = new EmbedBuilder()
      .setColor(process.env.EMBED_COLOR_SEARCH || "#f0a05a")
      .setAuthor({ name: `🎲 Random ${itemType}` })
      .setTitle(`${emoji} ${item.Name}${year}`)
      .setDescription(description || "No description available.")
      .setTimestamp();

        const tmdbIdFromJf = item.ProviderIds?.Tmdb || item.ProviderIds?.tmdb || item.ProviderIds?.TMDB;
    if (tmdbIdFromJf && getTmdbApiKey()) {
      try {
        const tmdbType = itemType === "Movie" ? "movie" : "tv";
        const tmdbData = await tmdbApi.tmdbGetDetails(tmdbIdFromJf, tmdbType, getTmdbApiKey());
        if (tmdbData?.poster_path) {
          embed.setThumbnail("https://image.tmdb.org/t/p/w500" + tmdbData.poster_path);
        }
      } catch (_) {}
    }

    const watchUrl = buildJellyfinUrl(item.Id);
    const components = [];
    const showWatchRandom = process.env.EMBED_SHOW_BUTTON_WATCH !== "false";
    if (showWatchRandom && watchUrl && isValidUrl(watchUrl)) {
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("▶ Watch Now!").setURL(watchUrl)
        )
      );
    }
    return interaction.editReply({ embeds: [embed], components });
  } catch (err) {
    logger.error("Random command error:", err);
    return interaction.editReply({ content: "❌ Could not fetch a random title. Please try again." });
  }
}

// ----------------- REGISTER INTERACTIONS -----------------
export function registerInteractions(client) {
  client.on("interactionCreate", async (interaction) => {
    try {
      // Check role permissions for all commands
      if (
        interaction.isCommand() ||
        (interaction.isStringSelectMenu() &&
          !interaction.customId.startsWith("request_seasons|") &&
          !interaction.customId.startsWith("request_with_tags|"))
      ) {
        if (!checkRolePermission(interaction.member)) {
          return interaction.reply({
            content: "❌ You don't have permission to use this command.",
            flags: 64,
          });
        }
      }

      // Autocomplete
      if (interaction.isAutocomplete()) {
        const focusedOption = interaction.options.getFocused(true);
        const focusedValue = focusedOption.value;

        // Handle Tag Autocomplete
        if (focusedOption.name === "tag") {
          try {
            const allTags = await seerrApi.fetchTags(
              getSeerrUrl(),
              getSeerrApiKey()
            );

            const filteredTags = Array.isArray(allTags)
              ? allTags.filter((tag) => {
                const label = tag.label || tag.name || "";
                return label
                  .toLowerCase()
                  .includes(focusedValue.toLowerCase());
              })
              : [];

            const uniqueTags = [];
            const seenLabels = new Set();

            for (const tag of filteredTags) {
              const label = tag.label || tag.name;
              if (label && !seenLabels.has(label)) {
                seenLabels.add(label);
                uniqueTags.push({
                  name: label,
                  value: label,
                });
              }
            }

            return await interaction.respond(uniqueTags.slice(0, 25));
          } catch (e) {
            logger.error("Tag autocomplete error:", e);
            return await interaction.respond([]);
          }
        }

        // Handle Quality Profile Autocomplete
        if (focusedOption.name === "quality") {
          try {
            const titleOption = interaction.options.getString("title");
            let mediaType = null;

            if (titleOption && titleOption.includes("|")) {
              const parts = titleOption.split("|");
              mediaType = parts[1];
            }

            const serverOption = interaction.options.getString("server");
            let selectedServerId = null;

            if (serverOption && serverOption.includes("|")) {
              const parts = serverOption.split("|");
              const parsedServerId = parseInt(parts[0], 10);

              if (!isNaN(parsedServerId)) {
                selectedServerId = parsedServerId;
              } else {
                logger.warn(
                  `Invalid server option in autocomplete - non-numeric serverId: ${parts[0]}`
                );
              }
            }

            const allProfiles = await seerrApi.fetchQualityProfiles(
              getSeerrUrl(),
              getSeerrApiKey()
            );

            const filteredProfiles = allProfiles.filter((profile) => {
              const name = profile.name || "";
              const matchesSearch = name
                .toLowerCase()
                .includes(focusedValue.toLowerCase());

              let matchesType = true;
              if (mediaType) {
                matchesType =
                  (mediaType === "movie" && profile.type === "radarr") ||
                  (mediaType === "tv" && profile.type === "sonarr");
              }

              let matchesServer = true;
              if (selectedServerId !== null) {
                matchesServer = profile.serverId === selectedServerId;
              }

              return matchesSearch && matchesType && matchesServer;
            });

            const uniqueProfiles = [];
            const seenNames = new Set();

            for (const profile of filteredProfiles) {
              const displayName = `${profile.name} (${profile.serverName})`;
              const key = `${profile.id}-${profile.serverId}`;
              if (!seenNames.has(key)) {
                seenNames.add(key);
                uniqueProfiles.push({
                  name:
                    displayName.length > 100
                      ? displayName.substring(0, 97) + "..."
                      : displayName,
                  value: `${profile.id}|${profile.serverId}|${profile.type}`,
                });
              }
            }

            return await interaction.respond(uniqueProfiles.slice(0, 25));
          } catch (e) {
            logger.error("Quality profile autocomplete error:", e);
            return await interaction.respond([]);
          }
        }

        // Server Autocomplete
        if (focusedOption.name === "server") {
          try {
            const titleOption = interaction.options.getString("title");
            let mediaType = null;

            if (titleOption && titleOption.includes("|")) {
              const parts = titleOption.split("|");
              mediaType = parts[1];
            }

            const allServers = await seerrApi.fetchServers(
              getSeerrUrl(),
              getSeerrApiKey()
            );

            const filteredServers = allServers.filter((server) => {
              const name = server.name || "";
              const matchesSearch = name
                .toLowerCase()
                .includes(focusedValue.toLowerCase());

              if (mediaType) {
                const matchesType =
                  (mediaType === "movie" && server.type === "radarr") ||
                  (mediaType === "tv" && server.type === "sonarr");
                return matchesSearch && matchesType;
              }

              return matchesSearch;
            });

            const serverChoices = filteredServers.map((server) => {
              const typeEmoji = server.type === "radarr" ? "🎬" : "📺";
              const displayName = `${typeEmoji} ${server.name}${server.isDefault ? " (default)" : ""}`;
              return {
                name:
                  displayName.length > 100
                    ? displayName.substring(0, 97) + "..."
                    : displayName,
                value: `${server.id}|${server.type}`,
              };
            });

            return await interaction.respond(serverChoices.slice(0, 25));
          } catch (e) {
            logger.error("Server autocomplete error:", e);
            return await interaction.respond([]);
          }
        }

        // Trending autocomplete
        if (interaction.commandName === "trending") {
          try {
            const trendingResults = await tmdbApi.tmdbGetTrending(
              getTmdbApiKey()
            );
            const filtered = trendingResults
              .filter(
                (r) => r.media_type === "movie" || r.media_type === "tv"
              )
              .filter((r) => {
                const title = r.title || r.name || "";
                return title
                  .toLowerCase()
                  .includes(focusedValue.toLowerCase());
              })
              .slice(0, 10);

            const trendingChoices = await Promise.all(
              filtered.map(async (item) => {
                try {
                  const details = await tmdbApi.tmdbGetDetails(
                    item.id,
                    item.media_type,
                    getTmdbApiKey()
                  );

                  const emoji = item.media_type === "movie" ? "🎬" : "📺";
                  const date =
                    item.release_date || item.first_air_date || "";
                  const year = date ? ` (${date.slice(0, 4)})` : "";

                  let extraInfo = "";
                  if (item.media_type === "movie") {
                    const director = details.credits?.crew?.find(
                      (c) => c.job === "Director"
                    );
                    const directorName = director ? director.name : null;
                    const runtime = details.runtime;
                    const hours = runtime ? Math.floor(runtime / 60) : 0;
                    const minutes = runtime ? runtime % 60 : 0;
                    const runtimeStr = runtime
                      ? `${hours}h ${minutes}m`
                      : null;

                    if (directorName && runtimeStr) {
                      extraInfo = ` — directed by ${directorName} — runtime: ${runtimeStr}`;
                    } else if (directorName) {
                      extraInfo = ` — directed by ${directorName}`;
                    } else if (runtimeStr) {
                      extraInfo = ` — runtime: ${runtimeStr}`;
                    }
                  } else {
                    const creator = details.created_by?.[0]?.name;
                    const seasonCount = details.number_of_seasons;
                    const seasonStr = seasonCount
                      ? `${seasonCount} season${seasonCount > 1 ? "s" : ""}`
                      : null;

                    if (creator && seasonStr) {
                      extraInfo = ` — created by ${creator} — ${seasonStr}`;
                    } else if (creator) {
                      extraInfo = ` — created by ${creator}`;
                    } else if (seasonStr) {
                      extraInfo = ` — ${seasonStr}`;
                    }
                  }

                  let fullName = `${emoji} ${item.title || item.name}${year}${extraInfo}`;
                  if (fullName.length > 98) {
                    fullName = fullName.substring(0, 95) + "...";
                  }

                  return { name: fullName, value: `${item.id}|${item.media_type}` };
                } catch (err) {
                  const emoji = item.media_type === "movie" ? "🎬" : "📺";
                  const date =
                    item.release_date || item.first_air_date || "";
                  const year = date ? ` (${date.slice(0, 4)})` : "";
                  let basicName = `${emoji} ${item.title || item.name}${year}`;
                  if (basicName.length > 98) {
                    basicName = basicName.substring(0, 95) + "...";
                  }
                  return { name: basicName, value: `${item.id}|${item.media_type}` };
                }
              })
            );

            await interaction.respond(trendingChoices);
            return;
          } catch (e) {
            logger.error("Trending autocomplete error:", e);
            return interaction.respond([]);
          }
        }

        // /status autocomplete – reuse TMDB search
        if (interaction.commandName === "status") {
          if (!focusedValue) return interaction.respond([]);
          try {
            const results = await tmdbApi.tmdbSearch(focusedValue, getTmdbApiKey());
            const choices = results.slice(0, 10).map((r) => {
              const title = r.title || r.name || "Unknown";
              const year = r.release_date?.slice(0, 4) || r.first_air_date?.slice(0, 4) || "";
              const typeEmoji = r.media_type === "movie" ? "🎬" : "📺";
              const label = `${typeEmoji} ${title}${year ? ` (${year})` : ""}`;
              return {
                name: label.length > 100 ? label.substring(0, 97) + "..." : label,
                value: `${r.id}|${r.media_type}|${title}`,
              };
            });
            return await interaction.respond(choices);
          } catch (e) {
            logger.error("Status autocomplete error:", e);
            return interaction.respond([]);
          }
        }

        // Regular search autocomplete
        if (!focusedValue) return interaction.respond([]);

        try {
          const results = await tmdbApi.tmdbSearch(
            focusedValue,
            getTmdbApiKey()
          );
          const filtered = results
            .filter(
              (r) => r.media_type === "movie" || r.media_type === "tv"
            )
            .slice(0, 10);

          const detailedChoices = await Promise.all(
            filtered.map(async (item) => {
              try {
                const details = await tmdbApi.tmdbGetDetails(
                  item.id,
                  item.media_type,
                  getTmdbApiKey()
                );

                const emoji = item.media_type === "movie" ? "🎬" : "📺";
                const date =
                  item.release_date || item.first_air_date || "";
                const year = date ? ` (${date.slice(0, 4)})` : "";

                let extraInfo = "";
                if (item.media_type === "movie") {
                  const director = details.credits?.crew?.find(
                    (c) => c.job === "Director"
                  );
                  const directorName = director ? director.name : null;
                  const runtime = details.runtime;
                  const hours = runtime ? Math.floor(runtime / 60) : 0;
                  const minutes = runtime ? runtime % 60 : 0;
                  const runtimeStr = runtime
                    ? `${hours}h ${minutes}m`
                    : null;

                  if (directorName && runtimeStr) {
                    extraInfo = ` — directed by ${directorName} — runtime: ${runtimeStr}`;
                  } else if (directorName) {
                    extraInfo = ` — directed by ${directorName}`;
                  } else if (runtimeStr) {
                    extraInfo = ` — runtime: ${runtimeStr}`;
                  }
                } else {
                  const creator = details.created_by?.[0]?.name;
                  const seasonCount = details.number_of_seasons;
                  const seasonStr = seasonCount
                    ? `${seasonCount} season${seasonCount > 1 ? "s" : ""}`
                    : null;

                  if (creator && seasonStr) {
                    extraInfo = ` — created by ${creator} — ${seasonStr}`;
                  } else if (creator) {
                    extraInfo = ` — created by ${creator}`;
                  } else if (seasonStr) {
                    extraInfo = ` — ${seasonStr}`;
                  }
                }

                let fullName = `${emoji} ${item.title || item.name}${year}${extraInfo}`;
                if (fullName.length > 98) {
                  fullName = fullName.substring(0, 95) + "...";
                }

                return { name: fullName, value: `${item.id}|${item.media_type}` };
              } catch (err) {
                logger.debug(
                  `Failed to fetch details for ${item.id}:`,
                  err?.message
                );
                const emoji = item.media_type === "movie" ? "🎬" : "📺";
                const date =
                  item.release_date || item.first_air_date || "";
                const year = date ? ` (${date.slice(0, 4)})` : "";
                let basicName = `${emoji} ${item.title || item.name}${year}`;
                if (basicName.length > 98) {
                  basicName = basicName.substring(0, 95) + "...";
                }
                return { name: basicName, value: `${item.id}|${item.media_type}` };
              }
            })
          );

          await interaction.respond(detailedChoices);
        } catch (e) {
          logger.error("Autocomplete error:", e);
          return await interaction.respond([]);
        }
      }

      // status_request_btn — quick request from /status embed
      if (interaction.isButton() && interaction.customId.startsWith("status_request_btn|")) {
        const parts = interaction.customId.split("|");
        const tmdbId = parseInt(parts[1], 10);
        const mediaType = parts[2] || "movie";
        const title = parts.slice(3).join("|");
        if (!tmdbId) return interaction.reply({ content: "⚠️ Invalid request.", flags: 64 });
        return handleSearchOrRequest(interaction, `${tmdbId}|${mediaType}|${title}`, "request", [], { ephemeral: true });
      }

      // Commands
      if (interaction.isCommand()) {
        if (!getSeerrUrl() || !getSeerrApiKey() || !getTmdbApiKey()) {
          return interaction.reply({
            content:
              "⚠️ This command is disabled because Seerr or TMDB configuration is missing.",
            flags: 64,
          });
        }
        const raw = getOptionStringRobust(interaction);
        if (interaction.commandName === "search")
          return handleSearchOrRequest(interaction, raw, "search");
        if (interaction.commandName === "request") {
          const tag = interaction.options.getString("tag");
          const quality = interaction.options.getString("quality");
          const server = interaction.options.getString("server");
          return handleSearchOrRequest(
            interaction,
            raw,
            "request",
            tag ? [tag] : [],
            { quality, server }
          );
        }
        if (interaction.commandName === "trending") {
          return handleSearchOrRequest(interaction, raw, "search");
        }
        if (interaction.commandName === "status") {
          return handleStatusCommand(interaction);
        }
        if (interaction.commandName === "random") {
          return handleRandomCommand(interaction);
        }
      }

      // ===== REQUEST BUTTON HANDLER =====
      // customId format: request_btn|tmdbId|mediaType|seasonsParam|tagsParam
      if (
        interaction.isButton() &&
        interaction.customId.startsWith("request_btn|")
      ) {
        const parts = interaction.customId.split("|");
        const tmdbId = parseInt(parts[1], 10);
        const mediaType = parts[2] || "movie";
        const seasonsParam = parts[3] || "";
        const tagsParam = parts[4] || "";

        if (!tmdbId) {
          return interaction.reply({ content: "⚠️ ID invalid.", flags: 64 });
        }

        await interaction.deferUpdate();

        try {
          const details = await tmdbApi.tmdbGetDetails(
            tmdbId,
            mediaType,
            getTmdbApiKey()
          );

          const selectedSeasons = seasonsParam ? seasonsParam.split(",") : [];
          const selectedTagNames = tagsParam ? tagsParam.split(",") : [];
          let selectedTagIds = [];
          if (selectedTagNames.length > 0) {
            try {
              const allTags = await seerrApi.fetchTags(
                getSeerrUrl(),
                getSeerrApiKey()
              );

              const filteredTags = Array.isArray(allTags)
                ? mediaType === "movie"
                  ? allTags.filter((tag) => tag.type === "radarr")
                  : allTags.filter((tag) => tag.type === "sonarr")
                : [];

              selectedTagIds = selectedTagNames
                .map((tagName) => {
                  const tag = filteredTags.find(
                    (t) => (t.label || t.name) === tagName
                  );
                  return tag ? tag.id : null;
                })
                .filter((id) => id !== null);
            } catch (err) {
              logger.debug(
                "Failed to fetch tags for API call:",
                err?.message
              );
            }
          }

          const checkSeasons =
            mediaType === "movie"
              ? ["all"]
              : selectedSeasons.length > 0
                ? selectedSeasons
                : ["all"];
          const status = await seerrApi.checkMediaStatus(
            tmdbId,
            mediaType,
            checkSeasons,
            getSeerrUrl(),
            getSeerrApiKey()
          );

          if (status.exists && status.available) {
            await interaction.followUp({
              content:
                "✅ This content is already available in your library!",
              flags: 64,
            });
            return;
          }

          let seasonsToRequest =
            mediaType === "movie"
              ? undefined
              : selectedSeasons.length > 0
                ? selectedSeasons
                : ["all"];

          if (
            mediaType === "tv" &&
            (seasonsToRequest.includes("all") ||
              (Array.isArray(seasonsToRequest) &&
                seasonsToRequest[0] === "all"))
          ) {
            if (details.seasons) {
              const seasonNumbers = details.seasons
                .filter((s) => s.season_number > 0)
                .map((s) => s.season_number);
              if (seasonNumbers.length > 0) {
                seasonsToRequest = seasonNumbers;
                logger.info(
                  `[REQUEST BTN] Resolved 'all' seasons to explicit list: ${seasonsToRequest.join(", ")}`
                );
              }
            }
          }

          const { profileId, serverId } = parseQualityAndServerOptions(
            {},
            mediaType
          );

          await seerrApi.sendRequest({
            tmdbId,
            mediaType,
            seasons: seasonsToRequest,
            tags: selectedTagIds.length > 0 ? selectedTagIds : undefined,
            profileId,
            serverId,
            seerrUrl: getSeerrUrl(),
            apiKey: getSeerrApiKey(),
            discordUserId: interaction.user.id,
            userMappings: getUserMappings(),
            isAutoApproved: getSeerrAutoApprove(),
          });
          logger.info(
            `[REQUEST] Discord User ${interaction.user.id} requested ${mediaType} ${tmdbId}. Auto-Approve: ${getSeerrAutoApprove()}`
          );

          if (process.env.NOTIFY_ON_AVAILABLE === "true") {
            const requestKey = `${tmdbId}-${mediaType}`;
            if (!pendingRequests.has(requestKey)) {
              pendingRequests.set(requestKey, new Set());
            }
            pendingRequests.get(requestKey).add(interaction.user.id);
            savePendingRequests();
          }

          const imdbId = await tmdbApi.tmdbGetExternalImdb(
            tmdbId,
            mediaType,
            getTmdbApiKey()
          );
          const omdb = imdbId ? await fetchOMDbData(imdbId) : null;

          const embed = buildNotificationEmbed(
            details,
            mediaType,
            imdbId,
            "success",
            omdb,
            tmdbId
          );

          const components = buildButtons(
            tmdbId,
            imdbId,
            true,
            mediaType,
            details,
            selectedSeasons.length > 0 ? selectedSeasons : ["all"],
            selectedTagNames
          );

          await interaction.editReply({ embeds: [embed], components });
        } catch (err) {
          logger.error("Button request error:", err);
          try {
            await interaction.followUp({
              content: "⚠️ I could not send the request.",
              flags: 64,
            });
          } catch (followUpErr) {
            logger.error("Failed to send follow-up message:", followUpErr);
          }
        }
      }

      // ===== SELECT SEASONS HANDLER =====
      // customId format: select_seasons|tmdbId|selectedTagsParam|menuIndex
      if (
        interaction.isStringSelectMenu() &&
        interaction.customId.startsWith("select_seasons|")
      ) {
        const parts = interaction.customId.split("|");
        const tmdbId = parseInt(parts[1], 10);
        const selectedTagsParam = parts[2] || "";
        const menuIndex = parts[3] ? parseInt(parts[3], 10) : undefined;
        const currentSelections = interaction.values;

        if (!tmdbId) {
          return interaction.reply({
            content: "⚠️ Invalid selection.",
            flags: 64,
          });
        }

        await interaction.deferUpdate();

        try {
          const selectedTags = selectedTagsParam
            ? selectedTagsParam.split(",")
            : [];

          const details = await tmdbApi.tmdbGetDetails(
            tmdbId,
            "tv",
            getTmdbApiKey()
          );
          const imdbId = await tmdbApi.tmdbGetExternalImdb(
            tmdbId,
            "tv",
            getTmdbApiKey()
          );

          let allSelectedSeasons = [];

          if (currentSelections.includes("all")) {
            allSelectedSeasons = ["all"];
          } else {
            const existingComponents =
              interaction.message.components || [];

            for (const row of existingComponents) {
              for (const component of row.components) {
                if (
                  component.customId &&
                  component.customId.startsWith("select_seasons|")
                ) {
                  const componentParts = component.customId.split("|");
                  const componentMenuIndex = componentParts[3]
                    ? parseInt(componentParts[3], 10)
                    : undefined;

                  if (
                    componentMenuIndex === menuIndex ||
                    (componentMenuIndex === undefined &&
                      menuIndex === undefined)
                  ) {
                    allSelectedSeasons.push(
                      ...currentSelections.filter((v) => v !== "all")
                    );
                  } else {
                    const existingSelections =
                      component.options
                        ?.filter((opt) => opt.default)
                        .map((opt) => opt.value)
                        .filter((v) => v !== "all") || [];
                    allSelectedSeasons.push(...existingSelections);
                  }
                }
              }
            }

            allSelectedSeasons = [...new Set(allSelectedSeasons)];
          }

          const components = buildButtons(
            tmdbId,
            imdbId,
            false,
            "tv",
            details,
            [],
            [],
            allSelectedSeasons,
            selectedTags
          );

          const seenSeasons = new Set();
          const uniqueSeasons = details.seasons.filter((s) => {
            if (s.season_number <= 0) return false;
            if (seenSeasons.has(s.season_number)) return false;
            seenSeasons.add(s.season_number);
            return true;
          });

          const tagsParam =
            selectedTags.length > 0 ? selectedTags.join(",") : "";
          const hasAllSeasons = allSelectedSeasons.includes("all");

          if (uniqueSeasons.length <= 24) {
            const seasonOptions = [
              { label: "All Seasons", value: "all" },
              ...uniqueSeasons.map((s) => ({
                label: `Season ${s.season_number} (${s.episode_count} episodes)`,
                value: String(s.season_number),
              })),
            ];

            const selectMenu = new StringSelectMenuBuilder()
              .setCustomId(`select_seasons|${tmdbId}|${tagsParam}`)
              .setPlaceholder("Select seasons to request...")
              .setMinValues(1)
              .setMaxValues(Math.min(25, seasonOptions.length))
              .addOptions(seasonOptions);

            components.push(new ActionRowBuilder().addComponents(selectMenu));
          } else {
            const SEASONS_PER_MENU = 24;
            const MAX_SEASON_MENUS = 4;

            const firstBatchSeasons = uniqueSeasons.slice(0, SEASONS_PER_MENU);
            const firstMenuOptions = [
              { label: "All Seasons", value: "all" },
              ...firstBatchSeasons.map((s) => ({
                label: `Season ${s.season_number} (${s.episode_count} episodes)`,
                value: String(s.season_number),
              })),
            ];

            const firstMenu = new StringSelectMenuBuilder()
              .setCustomId(`select_seasons|${tmdbId}|${tagsParam}|0`)
              .setPlaceholder(
                `Seasons 1-${firstBatchSeasons[firstBatchSeasons.length - 1].season_number}`
              )
              .setMinValues(0)
              .setMaxValues(firstMenuOptions.length)
              .addOptions(firstMenuOptions);

            components.push(
              new ActionRowBuilder().addComponents(firstMenu)
            );

            let menuIdx = 1;
            let offset = SEASONS_PER_MENU;

            while (
              offset < uniqueSeasons.length &&
              menuIdx < MAX_SEASON_MENUS
            ) {
              const batchSeasons = uniqueSeasons.slice(
                offset,
                offset + SEASONS_PER_MENU
              );

              if (batchSeasons.length > 0) {
                const batchOptions = batchSeasons.map((s) => ({
                  label: `Season ${s.season_number} (${s.episode_count} episodes)`,
                  value: String(s.season_number),
                }));

                const batchMenu = new StringSelectMenuBuilder()
                  .setCustomId(
                    `select_seasons|${tmdbId}|${tagsParam}|${menuIdx}`
                  )
                  .setPlaceholder(
                    `Seasons ${batchSeasons[0].season_number}-${batchSeasons[batchSeasons.length - 1].season_number}`
                  )
                  .setMinValues(0)
                  .setMaxValues(batchOptions.length)
                  .addOptions(batchOptions);

                components.push(
                  new ActionRowBuilder().addComponents(batchMenu)
                );
              }

              offset += SEASONS_PER_MENU;
              menuIdx++;
            }
          }

          const showTagSelectionTV = process.env.SHOW_TAG_SELECTION !== "false";
          if (selectedTags.length === 0 && !hasAllSeasons && showTagSelectionTV) {
            try {
              const tags = await seerrApi.fetchTags(
                getSeerrUrl(),
                getSeerrApiKey()
              );

              if (tags && tags.length > 0) {
                const uniqueTags = [];
                const seenIds = new Set();

                for (const tag of tags) {
                  if (!seenIds.has(tag.id)) {
                    seenIds.add(tag.id);
                    uniqueTags.push(tag);
                  }
                }

                const tagOptions = uniqueTags.slice(0, 25).map((tag) => ({
                  label: tag.label || tag.name || `Tag ${tag.id}`,
                  value: tag.id.toString(),
                }));

                const tagMenu = new StringSelectMenuBuilder()
                  .setCustomId(
                    `select_tags|${tmdbId}|${allSelectedSeasons.join(",")}`
                  )
                  .setPlaceholder("Select tags (optional)")
                  .addOptions(tagOptions)
                  .setMinValues(0)
                  .setMaxValues(Math.min(5, tagOptions.length));

                const tagRow = new ActionRowBuilder().addComponents(tagMenu);
                components.push(tagRow);
              }
            } catch (err) {
              logger.debug(
                "Failed to fetch tags for season selector:",
                err?.message
              );
            }
          }

          await interaction.editReply({ components });
        } catch (err) {
          logger.error("Season selection error:", err);
          try {
            await interaction.followUp({
              content: "⚠️ Error processing season selection.",
              flags: 64,
            });
          } catch (followUpErr) {
            logger.error("Failed to send follow-up message:", followUpErr);
          }
        }
      }

      // Already-requested button
      if (
        interaction.isButton() &&
        interaction.customId.startsWith("requested|")
      ) {
        try {
          await interaction.reply({
            content: "This item was already requested.",
            flags: 64,
          });
        } catch (replyErr) {
          logger.error(
            "Failed to send 'already requested' reply:",
            replyErr
          );
        }
      }

      // ===== DAILY RANDOM PICK REQUEST BUTTON HANDLER =====
      // customId format: request_random_tmdbId_mediaType
      if (
        interaction.isButton() &&
        interaction.customId.startsWith("request_random_")
      ) {
        const parts = interaction.customId.split("_");
        const tmdbId = parseInt(parts[2], 10);
        const mediaType = parts[3] || "movie";

        if (!tmdbId) {
          return interaction.reply({
            content: "⚠️ Invalid media ID.",
            flags: 64,
          });
        }

        await interaction.deferUpdate();

        try {
          const details = await tmdbApi.tmdbGetDetails(
            tmdbId,
            mediaType,
            getTmdbApiKey()
          );

          const { profileId, serverId } = parseQualityAndServerOptions(
            {},
            mediaType
          );

          await seerrApi.sendRequest({
            tmdbId,
            mediaType,
            seasons: mediaType === "tv" ? ["all"] : undefined,
            profileId,
            serverId,
            seerrUrl: getSeerrUrl(),
            apiKey: getSeerrApiKey(),
            discordUserId: interaction.user.id,
            userMappings: getUserMappings(),
            isAutoApproved: getSeerrAutoApprove(),
          });

          if (process.env.NOTIFY_ON_AVAILABLE === "true") {
            const requestKey = `${tmdbId}-${mediaType}`;
            if (!pendingRequests.has(requestKey)) {
              pendingRequests.set(requestKey, new Set());
            }
            pendingRequests.get(requestKey).add(interaction.user.id);
            savePendingRequests();
          }

          await interaction.followUp({
            content: `✅ **${details.title || details.name}** has been requested!`,
            flags: 64,
          });
        } catch (err) {
          logger.error("Daily random pick request error:", err);
          await interaction.followUp({
            content: "⚠️ Error processing request.",
            flags: 64,
          });
        }
      }

      // ===== SELECT TAGS HANDLER =====
      // customId format: select_tags|tmdbId|selectedSeasonsParam
      if (
        interaction.isStringSelectMenu() &&
        interaction.customId.startsWith("select_tags|")
      ) {
        const parts = interaction.customId.split("|");
        const tmdbId = parseInt(parts[1], 10);
        const selectedSeasonsParam = parts[2] || "";
        const selectedSeasons = selectedSeasonsParam
          ? selectedSeasonsParam.split(",")
          : [];
        const selectedTagIds = interaction.values.map((v) => v.toString());

        if (!tmdbId) {
          return interaction.reply({
            content: "⚠️ Invalid request data.",
            flags: 64,
          });
        }

        await interaction.deferUpdate();

        try {
          const mediaType = selectedSeasons.length > 0 ? "tv" : "movie";

          const details = await tmdbApi.tmdbGetDetails(
            tmdbId,
            mediaType,
            getTmdbApiKey()
          );
          const imdbId = await tmdbApi.tmdbGetExternalImdb(
            tmdbId,
            mediaType,
            getTmdbApiKey()
          );

          let selectedTagNames = [];
          if (selectedTagIds.length > 0) {
            try {
              const allTags = await seerrApi.fetchTags(
                getSeerrUrl(),
                getSeerrApiKey()
              );

              const filteredTags = Array.isArray(allTags)
                ? mediaType === "movie"
                  ? allTags.filter((tag) => tag.type === "radarr")
                  : allTags.filter((tag) => tag.type === "sonarr")
                : [];

              selectedTagNames = selectedTagIds
                .map((tagId) => {
                  const tag = filteredTags.find(
                    (t) => t.id.toString() === tagId
                  );
                  return tag ? tag.label || tag.name : null;
                })
                .filter((name) => name !== null);
            } catch (err) {
              logger.debug("Failed to fetch tag names:", err?.message);
              selectedTagNames = selectedTagIds;
            }
          }

          const components = buildButtons(
            tmdbId,
            imdbId,
            false,
            mediaType,
            details,
            [],
            [],
            selectedSeasons,
            selectedTagNames
          );

          await interaction.editReply({ components });
        } catch (err) {
          logger.error("Tag selection error:", err);
          try {
            await interaction.followUp({
              content: "⚠️ Error updating selection.",
              flags: 64,
            });
          } catch (followUpErr) {
            logger.error("Failed to send follow-up message:", followUpErr);
          }
        }
      }
    } catch (outerErr) {
      logger.error("Interaction handler error:", outerErr);
    }
  });
}
