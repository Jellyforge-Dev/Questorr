/**
 * Contextual action buttons that appear under search/random/foryou results:
 *   🔗 Similar | 📦 Collection | 🎭 Cast | ⭐ Recommend
 *
 * Each button carries a pre-resolved `tmdbId|mediaType`, so the underlying
 * command handler can skip its own TMDB search and respond instantly.
 *
 * Custom-ID schema:
 *   action_similar|{tmdbId}|{mediaType}
 *   action_collection|{tmdbId}|{mediaType}
 *   action_cast|{tmdbId}|{mediaType}
 *   action_recommend|{tmdbId}|{mediaType}
 *   action_cast_pick|{personId}              (after a cast member is chosen)
 */

import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} from "discord.js";
import { t } from "../../utils/botStrings.js";
import * as tmdbApi from "../../api/tmdb.js";
import { getTmdbApiKey } from "../helpers.js";
import logger from "../../utils/logger.js";

// ── Public dispatcher ────────────────────────────────────────────────────────

export async function handleActionButton(interaction) {
  const [action, tmdbId, mediaType] = interaction.customId.split("|");
  if (!tmdbId || !mediaType) return;

  // Cast → ephemeral select with the title's top cast members
  if (action === "action_cast") {
    return await showCastSelectForTitle(interaction, tmdbId, mediaType);
  }

  // Similar / Collection / Recommend → reuse the slash-command handlers
  // with a pre-resolved `tmdbId|mediaType` value.
  await interaction.deferReply({ flags: 64 });

  interaction.options = {
    getString:  (n) => (n === "title" ? `${tmdbId}|${mediaType}` : null),
    getInteger: () => null,
    getNumber:  () => null,
    getBoolean: () => null,
  };

  try {
    switch (action) {
      case "action_similar": {
        const { handleSimilarCommand } = await import("../commands/similar.js");
        return await handleSimilarCommand(interaction);
      }
      case "action_collection": {
        const { handleCollectionCommand } = await import("../commands/collection.js");
        return await handleCollectionCommand(interaction);
      }
      case "action_recommend": {
        const { handleRecommendCommand } = await import("../commands/recommend.js");
        return await handleRecommendCommand(interaction);
      }
    }
  } catch (err) {
    logger.error(`[action-button] dispatch error for ${action}: ${err.message}`);
    try {
      await interaction.editReply({ content: t("error_occurred"), components: [], embeds: [] });
    } catch (_) { /* swallow */ }
  }
}

// ── Cast: pick-list flow ─────────────────────────────────────────────────────

async function showCastSelectForTitle(interaction, tmdbId, mediaType) {
  await interaction.deferReply({ flags: 64 });

  let details;
  try {
    details = await tmdbApi.tmdbGetDetails(tmdbId, mediaType, getTmdbApiKey());
  } catch (err) {
    logger.warn(`[action-cast] tmdbGetDetails failed for ${mediaType}/${tmdbId}: ${err.message}`);
    return interaction.editReply({ content: t("cast_error") });
  }

  const cast = (details?.credits?.cast || [])
    .slice(0, 24) // Discord select-menu hard cap is 25
    .filter(c => c?.name);

  if (cast.length === 0) {
    return interaction.editReply({ content: t("cast_no_credits") });
  }

  const options = cast.map(c => ({
    label:       (c.name || "?").slice(0, 100),
    value:       `${c.id}`,
    description: c.character ? c.character.slice(0, 100) : undefined,
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId(`action_cast_pick|${tmdbId}|${mediaType}`)
    .setPlaceholder(t("action_cast_pick_placeholder"))
    .addOptions(options);

  const title = details?.title || details?.name || "?";
  const embed = new EmbedBuilder()
    .setColor("#89b4fa")
    .setDescription(`🎭 ${t("action_cast_pick_intro").replace("{{title}}", `**${title}**`)}`);

  await interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] });
}

/**
 * Select-menu submit after the user picks a cast member from the list above.
 * Routes to the existing /cast command using the actor's NAME (cast.js looks
 * the person up via tmdbSearchPerson, so name is the canonical input).
 */
export async function handleActionCastPick(interaction) {
  const personId = interaction.values?.[0];
  if (!personId) return;

  // We need the actor's name, not the id, because cast.js searches by name.
  // Fetch person details from TMDB.
  await interaction.deferUpdate();

  let person;
  try {
    person = await tmdbApi.tmdbGetPerson(personId, getTmdbApiKey());
  } catch (err) {
    logger.warn(`[action-cast-pick] tmdbGetPerson failed for ${personId}: ${err.message}`);
  }
  const name = person?.name;
  if (!name) {
    return interaction.editReply({ content: t("cast_not_found"), components: [], embeds: [] });
  }

  interaction.options = {
    getString:  (n) => (n === "name" ? name : null),
    getInteger: () => null,
    getNumber:  () => null,
    getBoolean: () => null,
  };

  try {
    const { handleCastCommand } = await import("../commands/cast.js");
    return await handleCastCommand(interaction);
  } catch (err) {
    logger.error(`[action-cast-pick] handleCastCommand error: ${err.message}`);
  }
}
