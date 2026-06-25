/**
 * Wizard search modals — for commands that need a single text input
 * (title or name). User clicks a wizard button → modal pops up → user
 * types → submit triggers the underlying command handler.
 *
 * For /search and /request a "Meintest du?" (Did You Mean?) check runs
 * before dispatching: if the TMDB top result differs significantly from
 * the raw input the user sees a confirmation prompt instead of the full
 * result, which lets them catch typos or wrong titles immediately.
 *
 * Note: Discord modals do NOT support autocomplete. Users who want live
 * title suggestions should still type /search directly.
 */

import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import { t } from "../../utils/botStrings.js";
import { getTmdbApiKey } from "../helpers.js";
import * as tmdbApi from "../../api/tmdb.js";
import { handleSearchOrRequest } from "../commands/search.js";
import { handleRecommendCommand } from "../commands/recommend.js";
import { handleSimilarCommand } from "../commands/similar.js";
import { handleCollectionCommand } from "../commands/collection.js";
import { handleCastCommand } from "../commands/cast.js";
import { handleStatusCommand } from "../commands/status.js";
import { shouldShowDYM, showDYMPrompt } from "./didYouMean.js";
import logger from "../../utils/logger.js";

// ── Config map ────────────────────────────────────────────────────────────────

const MODAL_CONFIG = {
  wizard_search:     { command: "search",     labelKey: "wizard_modal_label_title", optionName: "title", titleKey: "wizard_modal_title_search",     placeholderKey: "wizard_modal_ph_title", dym: true  },
  wizard_request:    { command: "request",    labelKey: "wizard_modal_label_title", optionName: "title", titleKey: "wizard_modal_title_request",    placeholderKey: "wizard_modal_ph_title", dym: true  },
  wizard_recommend:  { command: "recommend",  labelKey: "wizard_modal_label_title", optionName: "title", titleKey: "wizard_modal_title_recommend",  placeholderKey: "wizard_modal_ph_title", dym: false },
  wizard_similar:    { command: "similar",    labelKey: "wizard_modal_label_title", optionName: "title", titleKey: "wizard_modal_title_similar",    placeholderKey: "wizard_modal_ph_title", dym: false },
  wizard_collection: { command: "collection", labelKey: "wizard_modal_label_title", optionName: "title", titleKey: "wizard_modal_title_collection", placeholderKey: "wizard_modal_ph_title", dym: false },
  wizard_cast:       { command: "cast",       labelKey: "wizard_modal_label_name",  optionName: "name",  titleKey: "wizard_modal_title_cast",       placeholderKey: "wizard_modal_ph_name",  dym: false },
  wizard_status:     { command: "status",     labelKey: "wizard_modal_label_title", optionName: "title", titleKey: "wizard_modal_title_status",     placeholderKey: "wizard_modal_ph_title", dym: false },
};

// All button IDs supported by the modal flow (used by the smart-picker
// custom-input fallback as well as direct routing).
export const WIZARD_MODAL_BUTTON_IDS = Object.keys(MODAL_CONFIG);

// Subset that should open a modal *directly* on click (no smart-picker step).
// /search and /request stay modal-first because they're generic (no
// reasonable shortlist of "recently watched" makes sense for a free search).
export const WIZARD_DIRECT_MODAL_BUTTON_IDS = ["wizard_search", "wizard_request"];

// ── Show modal ────────────────────────────────────────────────────────────────

export async function showWizardSearchModal(interaction) {
  const cfg = MODAL_CONFIG[interaction.customId];
  if (!cfg) return;

  const modal = new ModalBuilder()
    .setCustomId(`wizard_modal_submit|${cfg.command}|${cfg.optionName}`)
    .setTitle(t(cfg.titleKey));

  const input = new TextInputBuilder()
    .setCustomId("title_input")
    .setLabel(t(cfg.labelKey))
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(200)
    .setPlaceholder(t(cfg.placeholderKey));

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

// ── Handle submit ─────────────────────────────────────────────────────────────

export async function handleWizardModalSubmit(interaction) {
  const [, command, optionName] = interaction.customId.split("|");
  const value = interaction.fields.getTextInputValue("title_input")?.trim();
  if (!value) return;

  const cfg = Object.values(MODAL_CONFIG).find(c => c.command === command);

  logger.info(`[wizard-modal] submit: /${command} "${value}"`);

  // ── DYM path: search + request ────────────────────────────────────────────
  if (cfg?.dym) {
    // Defer immediately — TMDB lookup needs time
    await interaction.deferReply({ ephemeral: true });

    try {
      let results = (await tmdbApi.tmdbSearch(value, getTmdbApiKey()))
        .filter(r => r.media_type === "movie" || r.media_type === "tv");

      // Fallback: if the full query returned nothing the user probably
      // typo'd a word. Try leave-one-out variants — drop each word in turn
      // ("Man om Fire" → ["om Fire", "Man Fire", "Man om"]) so a typo in
      // a middle word still finds the canonical title. Then progressively
      // shorter prefixes as a last resort. DYM catches the rest.
      if (results.length === 0) {
        const words = value.split(/\s+/).filter(Boolean);

        const tryQuery = async (q) => {
          const r = (await tmdbApi.tmdbSearch(q, getTmdbApiKey()))
            .filter(x => x.media_type === "movie" || x.media_type === "tv");
          return r;
        };

        // Phase 1 — drop each word in turn (only worth it for ≥ 3 words,
        // since 2-word leave-one-out collapses to single-word prefixes).
        if (words.length >= 3) {
          for (let i = 0; i < words.length; i++) {
            const variant = words.filter((_, idx) => idx !== i).join(" ");
            const r = await tryQuery(variant);
            if (r.length > 0) {
              logger.info(`[wizard-modal] tmdb leave-one-out: "${value}" → "${variant}" (${r.length} hits)`);
              results = r;
              break;
            }
          }
        }

        // Phase 2 — progressively shorter prefixes if leave-one-out failed
        if (results.length === 0) {
          for (let n = words.length - 1; n >= 1; n--) {
            const partial = words.slice(0, n).join(" ");
            const r = await tryQuery(partial);
            if (r.length > 0) {
              logger.info(`[wizard-modal] tmdb prefix-fallback: "${value}" → "${partial}" (${r.length} hits)`);
              results = r;
              break;
            }
          }
        }
      }

      if (results.length > 0) {
        const topTitle = results[0].title || results[0].name || "";

        if (shouldShowDYM(value, topTitle)) {
          // Offer confirmation — do NOT dispatch yet
          return await showDYMPrompt(interaction, command, results);
        }

        // Good match → dispatch directly with pre-resolved ID (no double search)
        const resolved = `${results[0].id}|${results[0].media_type}`;
        _patchOptions(interaction, "title", resolved);
        return await handleSearchOrRequest(interaction, resolved, command, [], { ephemeral: true });
      }

      // No TMDB results → let handler respond with "title invalid"
      _patchOptions(interaction, optionName, value);
      return await handleSearchOrRequest(interaction, value, command, [], { ephemeral: true });
    } catch (err) {
      logger.error(`[wizard-modal] DYM path error for /${command}: ${err.message}`);
      try {
        await interaction.editReply({ content: t("error_occurred") });
      } catch (_) { /* already replied or timed out */ }
    }
    return;
  }

  // ── Standard path: all other commands ────────────────────────────────────
  _patchOptions(interaction, optionName, value);

  try {
    switch (command) {
      case "recommend":  return await handleRecommendCommand(interaction);
      case "similar":    return await handleSimilarCommand(interaction);
      case "collection": return await handleCollectionCommand(interaction);
      case "cast":       return await handleCastCommand(interaction);
      case "status":     return await handleStatusCommand(interaction);
    }
  } catch (err) {
    logger.error(`[wizard-modal] handler error for /${command}: ${err.message}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _patchOptions(interaction, optionName, value) {
  interaction.options = {
    getString:  (name) => (name === optionName ? value : null),
    getInteger: () => null,
    getNumber:  () => null,
    getBoolean: () => null,
  };
}
