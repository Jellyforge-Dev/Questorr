import { t } from "../../utils/botStrings.js";
import * as tmdbApi from "../../api/tmdb.js";
import * as seerrApi from "../../api/seerr.js";
import { buildButtons } from "../embeds.js";
import { getSeerrUrl, getSeerrApiKey, getTmdbApiKey } from "../helpers.js";
import logger from "../../utils/logger.js";

export async function handleTagSelect(interaction) {
  const parts = interaction.customId.split("|");
  const tmdbId = parseInt(parts[1], 10);
  // mediaType is carried explicitly in the customId (set by search.js for
  // movies and seasonSelect.js for tv) — it used to be guessed from whether
  // any seasons were selected, which misclassified a tv show as a movie
  // whenever the user picked zero seasons across the multi-menu picker
  // shown for shows with more than 24 seasons.
  const mediaType = parts[2] === "tv" ? "tv" : "movie";
  const selectedSeasonsParam = parts[3] || "";
  const selectedSeasons = selectedSeasonsParam
    ? selectedSeasonsParam.split(",")
    : [];
  const selectedTagIds = interaction.values.map((v) => v.toString());

  if (!tmdbId) {
    return interaction.reply({
      content: t("invalid_request_data"),
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
        content: t("error_tag_select"),
        flags: 64,
      });
    } catch (followUpErr) {
      logger.error("Failed to send follow-up message:", followUpErr);
    }
  }
}
