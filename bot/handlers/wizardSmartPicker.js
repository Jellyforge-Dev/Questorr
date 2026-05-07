/**
 * Smart-Picker for the wizard buttons that need a contextual reference
 * (Recommend / Similar / Collection / Cast).
 *
 * Rather than opening a blind text-modal, the user gets an ephemeral
 * StringSelectMenu pre-filled with their recently-watched titles (or for
 * /cast, top actors from those titles). A "✏️ Type a title yourself…"
 * fallback option opens the existing modal.
 *
 * Custom-ID schema:
 *   smartpick|{command}     — the select-menu interaction
 *   value =  {command}|{tmdbIdOrActorName}|{mediaType?}    — picked option
 *   value =  {command}|__custom__                          — fallback to modal
 */

import { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from "discord.js";
import { t } from "../../utils/botStrings.js";
import { getTmdbApiKey } from "../helpers.js";
import * as tmdbApi from "../../api/tmdb.js";
import {
  fetchUserRecentlyPlayed,
  resolveJellyfinUserId,
} from "../../api/jellyfin.js";
import { getUserMappings } from "../../utils/configFile.js";
import { getSeerrUrl, getSeerrApiKey } from "../helpers.js";
import logger from "../../utils/logger.js";

// ── Config ────────────────────────────────────────────────────────────────────

const PICKER_CONFIG = {
  wizard_recommend:  { command: "recommend",  source: "watchedTitles", labelKey: "picker_recommend_pick"  },
  wizard_similar:    { command: "similar",    source: "watchedTitles", labelKey: "picker_similar_pick"    },
  wizard_collection: { command: "collection", source: "watchedTitles", labelKey: "picker_collection_pick" },
  wizard_cast:       { command: "cast",       source: "watchedActors", labelKey: "picker_cast_pick"       },
};

export const PICKER_BUTTON_IDS = Object.keys(PICKER_CONFIG);

// ── Suggestions ──────────────────────────────────────────────────────────────

/**
 * Resolve the Discord user's Jellyfin user-id and fetch their recent items.
 * Returns [] when no mapping or no Jellyfin config.
 */
async function fetchRecentlyWatchedItems(discordId, limit = 15) {
  const jfBase = process.env.JELLYFIN_BASE_URL;
  const jfKey  = process.env.JELLYFIN_API_KEY;
  if (!jfBase || !jfKey) return [];

  const jfUserId = await resolveJellyfinUserId(
    discordId,
    getUserMappings(),
    getSeerrUrl(),
    getSeerrApiKey(),
  );
  if (!jfUserId) return [];

  return await fetchUserRecentlyPlayed(jfUserId, jfKey, jfBase, limit);
}

/**
 * watchedTitles → list of { tmdbId, type, label } from Jellyfin's recently-played.
 * For collection-pickers, only Movies are kept (TV shows have no collections).
 */
async function suggestWatchedTitles(discordId, command) {
  const items = await fetchRecentlyWatchedItems(discordId, 20);
  const out = [];
  const seen = new Set();
  for (const it of items) {
    const tmdbId = it?.ProviderIds?.Tmdb;
    if (!tmdbId) continue;
    const type = it.Type === "Series" ? "tv" : "movie";
    if (command === "collection" && type !== "movie") continue;
    const key = `${tmdbId}|${type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      tmdbId: String(tmdbId),
      type,
      label: it.Name || "Unknown",
      year: it.ProductionYear ? String(it.ProductionYear) : "",
    });
    if (out.length >= 24) break;
  }
  return out;
}

/**
 * watchedActors → top cast members from the user's last 5 watched movies,
 * deduplicated and ranked by frequency. Each entry's "value" is the actor name
 * (the /cast command searches by name internally).
 */
async function suggestWatchedActors(discordId) {
  const apiKey = getTmdbApiKey();
  if (!apiKey) return [];

  const items = await fetchRecentlyWatchedItems(discordId, 8);
  const movieTmdbIds = items
    .filter(it => it.Type === "Movie" && it?.ProviderIds?.Tmdb)
    .slice(0, 5)
    .map(it => String(it.ProviderIds.Tmdb));

  if (movieTmdbIds.length === 0) return [];

  // Fetch details in parallel; tmdbGetDetails already includes credits.cast
  const detailsList = await Promise.all(
    movieTmdbIds.map(id => tmdbApi.tmdbGetDetails(id, "movie", apiKey).catch(() => null))
  );

  // Score each actor by how many of the watched movies they appear in,
  // and (within that) how prominent they are (lower order = lead role).
  const scoreByName = new Map();
  for (const det of detailsList) {
    const cast = det?.credits?.cast;
    if (!Array.isArray(cast)) continue;
    cast.slice(0, 6).forEach((actor, idx) => {
      const name = (actor?.name || "").trim();
      if (!name) return;
      const prev = scoreByName.get(name) || { count: 0, bestOrder: 99 };
      prev.count += 1;
      if (idx < prev.bestOrder) prev.bestOrder = idx;
      scoreByName.set(name, prev);
    });
  }

  return [...scoreByName.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].bestOrder - b[1].bestOrder)
    .slice(0, 24)
    .map(([name]) => ({ tmdbId: name, type: "actor", label: name, year: "" }));
}

async function fetchSuggestions(discordId, source, command) {
  if (source === "watchedActors") return suggestWatchedActors(discordId);
  return suggestWatchedTitles(discordId, command);
}

// ── Show picker ──────────────────────────────────────────────────────────────

export async function showWizardSmartPicker(interaction) {
  const cfg = PICKER_CONFIG[interaction.customId];
  if (!cfg) return;

  await interaction.deferReply({ flags: 64 });

  let items = [];
  try {
    items = await fetchSuggestions(interaction.user.id, cfg.source, cfg.command);
  } catch (err) {
    logger.warn(`[smart-picker] suggestions error for /${cfg.command}: ${err?.message}`);
  }

  // Empty state → fall back to the existing modal directly.
  if (items.length === 0) {
    return await offerCustomInputOnly(interaction, cfg);
  }

  const options = items.map(it => {
    const opt = {
      label: it.label.slice(0, 100),
      value: encodeValue(cfg.command, it),
    };
    if (it.year) opt.description = it.year;
    return opt;
  });

  // Append the "type your own title" fallback last
  options.push({
    label: t("picker_custom_input"),
    value: `${cfg.command}|__custom__`,
    description: t("picker_custom_input_hint"),
    emoji: "✏️",
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`smartpick|${cfg.command}`)
    .setPlaceholder(t(cfg.labelKey))
    .addOptions(options.slice(0, 25)); // hard Discord limit

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor("#89b4fa")
        .setDescription(`📋 ${t(cfg.labelKey)}`),
    ],
    components: [new ActionRowBuilder().addComponents(select)],
  });
}

/**
 * No history → show only the custom-input option so the user isn't stranded.
 */
async function offerCustomInputOnly(interaction, cfg) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`smartpick|${cfg.command}`)
    .setPlaceholder(t(cfg.labelKey))
    .addOptions([
      {
        label: t("picker_custom_input"),
        value: `${cfg.command}|__custom__`,
        description: t("picker_custom_input_hint"),
        emoji: "✏️",
      },
    ]);

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor("#f9e2af")
        .setDescription(`ℹ️ ${t("picker_empty_state")}`),
    ],
    components: [new ActionRowBuilder().addComponents(select)],
  });
}

function encodeValue(command, item) {
  // For watched titles  → command|tmdbId|type
  // For watched actors  → command|actorName    (no type segment)
  if (item.type === "actor") {
    // Actor names can contain "|", strip just in case
    const safeName = item.tmdbId.replace(/\|/g, " ").slice(0, 80);
    return `${command}|${safeName}`;
  }
  return `${command}|${item.tmdbId}|${item.type}`;
}

// ── Handle select ────────────────────────────────────────────────────────────

export async function handleSmartPickerSelect(interaction) {
  const value = interaction.values?.[0];
  if (!value) return;

  const parts = value.split("|");
  const command = parts[0];

  // Custom-input fallback → reuse the existing wizard modal
  if (parts[1] === "__custom__") {
    const { showWizardSearchModal } = await import("./wizardSearchModal.js");
    // The modal flow keys off interaction.customId; patch it just for this call.
    const fakeInteraction = new Proxy(interaction, {
      get(target, prop) {
        if (prop === "customId") return `wizard_${command}`;
        return target[prop];
      },
    });
    return showWizardSearchModal(fakeInteraction);
  }

  await interaction.deferUpdate();

  // /cast: parts = [command, actorName]   — actor name as plain text
  // others: parts = [command, tmdbId, type] — tmdbId|type pre-resolved
  if (command === "cast") {
    const actorName = parts.slice(1).join("|");
    return await dispatchCommand(interaction, "cast", actorName);
  }

  const tmdbId    = parts[1];
  const mediaType = parts[2] || "movie";
  const resolved  = `${tmdbId}|${mediaType}`;
  return await dispatchCommand(interaction, command, resolved);
}

// ── Dispatch to underlying command handler ──────────────────────────────────

async function dispatchCommand(interaction, command, value) {
  const optionName = command === "cast" ? "name" : "title";

  // Patch options so the handler's getString(...) returns our resolved value
  interaction.options = {
    getString:  (name) => (name === optionName ? value : null),
    getInteger: () => null,
    getNumber:  () => null,
    getBoolean: () => null,
  };

  try {
    switch (command) {
      case "recommend": {
        const { handleRecommendCommand } = await import("../commands/recommend.js");
        return await handleRecommendCommand(interaction);
      }
      case "similar": {
        const { handleSimilarCommand } = await import("../commands/similar.js");
        return await handleSimilarCommand(interaction);
      }
      case "collection": {
        const { handleCollectionCommand } = await import("../commands/collection.js");
        return await handleCollectionCommand(interaction);
      }
      case "cast": {
        const { handleCastCommand } = await import("../commands/cast.js");
        return await handleCastCommand(interaction);
      }
    }
  } catch (err) {
    logger.error(`[smart-picker] dispatch error for /${command}: ${err.message}`);
    try {
      await interaction.editReply({ content: t("error_occurred"), components: [], embeds: [] });
    } catch (_) { /* swallow */ }
  }
}
