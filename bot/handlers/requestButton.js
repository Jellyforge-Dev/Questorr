import { t } from "../../utils/botStrings.js";
import * as tmdbApi from "../../api/tmdb.js";
import * as seerrApi from "../../api/seerr.js";
import { fetchOMDbData } from "../../api/omdb.js";
import { buildNotificationEmbed, buildButtons } from "../embeds.js";
import { parseQualityAndServerOptions, getSeerrAutoApprove } from "../botUtils.js";
import { pendingRequests, savePendingRequests } from "../botState.js";
import { getUserMappings } from "../../utils/configFile.js";
import { getSeerrUrl, getSeerrApiKey, getTmdbApiKey } from "../helpers.js";
import logger from "../../utils/logger.js";

export async function handleRequestButton(interaction) {
  const parts = interaction.customId.split("|");
  const tmdbId = parseInt(parts[1], 10);
  const mediaType = parts[2] || "movie";
  const seasonsParam = parts[3] || "";
  const tagsParam = parts[4] || "";

  if (!tmdbId) {
    return interaction.reply({ content: t("id_invalid"), flags: 64 });
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
        content: t("content_already_available"),
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
        content: t("error_request_failed"),
        flags: 64,
      });
    } catch (followUpErr) {
      logger.error("Failed to send follow-up message:", followUpErr);
    }
  }
}
