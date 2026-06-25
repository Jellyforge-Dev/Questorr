import { t } from "../../utils/botStrings.js";
import * as tmdbApi from "../../api/tmdb.js";
import * as seerrApi from "../../api/seerr.js";
import { parseQualityAndServerOptions, getSeerrAutoApprove, getQuotaDenial } from "../botUtils.js";
import { pendingRequests, savePendingRequests } from "../botState.js";
import { add as addToRequestStore } from "../../utils/requestStore.js";
import { getUserMappings } from "../../utils/configFile.js";
import { getSeerrUrl, getSeerrApiKey, getTmdbApiKey } from "../helpers.js";
import logger from "../../utils/logger.js";

export async function handleRandomRequestButton(interaction) {
  const parts = interaction.customId.split("_");
  const tmdbId = parseInt(parts[2], 10);
  const mediaType = parts[3] || "movie";

  if (!tmdbId) {
    return interaction.reply({
      content: t("invalid_media_id"),
      flags: 64,
    });
  }

  await interaction.deferUpdate();

  const quotaDenial = getQuotaDenial(interaction);
  if (quotaDenial) {
    return interaction.followUp({ content: quotaDenial, flags: 64 });
  }

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

    const createdRequest = await seerrApi.sendRequest({
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

    // Mirror requestButton.js: record the request in the lifecycle store keyed on
    // the Seerr requestId so /queue can show its status.
    addToRequestStore({
      requestId: createdRequest?.id ?? null,
      tmdbId,
      mediaType,
      title: details.title || details.name,
      discordUserId: interaction.user.id,
    });

    // Round 12: ALWAYS record the request in pendingRequests (see
    // requestButton.js for the full rationale — used as dedup source for the
    // Jellyfin poller).
    {
      const requestKey = `${tmdbId}-${mediaType}`;
      if (!pendingRequests.has(requestKey)) {
        pendingRequests.set(requestKey, new Set());
      }
      pendingRequests.get(requestKey).add(interaction.user.id);
      savePendingRequests();
    }

    await interaction.followUp({
      content: t("request_success").replace("{{title}}", details.title || details.name),
      flags: 64,
    });
  } catch (err) {
    logger.error("Daily random pick request error:", err);
    await interaction.followUp({
      content: t("error_processing"),
      flags: 64,
    });
  }
}
