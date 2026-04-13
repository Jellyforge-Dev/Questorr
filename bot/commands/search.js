import { t } from "../../utils/botStrings.js";
import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import * as tmdbApi from "../../api/tmdb.js";
import * as seerrApi from "../../api/seerr.js";
import { fetchOMDbData } from "../../api/omdb.js";
import { buildNotificationEmbed, buildButtons } from "../embeds.js";
import { parseQualityAndServerOptions, getSeerrAutoApprove } from "../botUtils.js";
import { pendingRequests, savePendingRequests } from "../botState.js";
import { getUserMappings } from "../../utils/configFile.js";
import { getSeerrUrl, getSeerrApiKey, getTmdbApiKey } from "../helpers.js";
import logger from "../../utils/logger.js";

export async function handleSearchOrRequest(
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
        content: t("title_invalid"),
      });
    } else {
      await interaction.deleteReply();
      return interaction.followUp({
        content: t("title_invalid"),
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
            content: t("content_already_available"),
            components: [],
            embeds: [],
          });
        } else {
          await interaction.deleteReply();
          await interaction.followUp({
            content: t("content_already_available"),
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

    const [imdbId, trailerUrl, seerrResult] = await Promise.all([
      tmdbApi.tmdbGetExternalImdb(tmdbId, mediaType, getTmdbApiKey()),
      tmdbApi.tmdbGetTrailer(tmdbId, mediaType, getTmdbApiKey()),
      seerrApi.getSeerrStatus(tmdbId, mediaType).catch(() => null),
    ]);
    const seerrStatusCode = seerrResult?.status ?? null;

    const omdb = imdbId ? await fetchOMDbData(imdbId) : null;

    const embed = buildNotificationEmbed(
      details,
      mediaType,
      imdbId,
      mode === "request" ? "success" : "search",
      omdb,
      tmdbId,
      mode === "search" ? seerrStatusCode : null
    );

    const components = buildButtons(
      tmdbId,
      imdbId,
      mode === "request",
      mediaType,
      details,
      [],
      [],
      [],
      [],
      trailerUrl
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
            .setPlaceholder(t("select_tags_placeholder"))
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

    let errorMessage = t("error_occurred");
    if (err.response && err.response.data && err.response.data.message) {
      errorMessage = t("error_seerr").replace("{{message}}", err.response.data.message);
    } else if (err.message) {
      if (err.message.includes("403")) {
        errorMessage = t("error_quota");
      } else {
        errorMessage = t("error_generic").replace("{{message}}", err.message);
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
