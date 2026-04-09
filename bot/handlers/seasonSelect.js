import { t } from "../../utils/botStrings.js";
import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import * as tmdbApi from "../../api/tmdb.js";
import * as seerrApi from "../../api/seerr.js";
import { buildButtons } from "../embeds.js";
import { getSeerrUrl, getSeerrApiKey, getTmdbApiKey } from "../helpers.js";
import logger from "../../utils/logger.js";

export async function handleSeasonSelect(interaction) {
  const parts = interaction.customId.split("|");
  const tmdbId = parseInt(parts[1], 10);
  const selectedTagsParam = parts[2] || "";
  const menuIndex = parts[3] ? parseInt(parts[3], 10) : undefined;
  const currentSelections = interaction.values;

  if (!tmdbId) {
    return interaction.reply({
      content: t("invalid_selection"),
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
        { label: t("all_seasons"), value: "all" },
        ...uniqueSeasons.map((s) => ({
          label: t("season_label") + " " + s.season_number + " (" + s.episode_count + " " + t("episodes_label") + ")",
          value: String(s.season_number),
        })),
      ];

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`select_seasons|${tmdbId}|${tagsParam}`)
        .setPlaceholder(t("select_seasons_placeholder"))
        .setMinValues(1)
        .setMaxValues(Math.min(25, seasonOptions.length))
        .addOptions(seasonOptions);

      components.push(new ActionRowBuilder().addComponents(selectMenu));
    } else {
      const SEASONS_PER_MENU = 24;
      const MAX_SEASON_MENUS = 4;

      const firstBatchSeasons = uniqueSeasons.slice(0, SEASONS_PER_MENU);
      const firstMenuOptions = [
        { label: t("all_seasons"), value: "all" },
        ...firstBatchSeasons.map((s) => ({
          label: t("season_label") + " " + s.season_number + " (" + s.episode_count + " " + t("episodes_label") + ")",
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
            label: t("season_label") + " " + s.season_number + " (" + s.episode_count + " " + t("episodes_label") + ")",
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
            .setPlaceholder(t("select_tags_placeholder"))
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
        content: t("error_season_select"),
        flags: 64,
      });
    } catch (followUpErr) {
      logger.error("Failed to send follow-up message:", followUpErr);
    }
  }
}
