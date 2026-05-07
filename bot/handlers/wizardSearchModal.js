/**
 * Wizard search modals — for commands that need a single text input
 * (title or name). User clicks a wizard button → modal pops up → user
 * types → submit triggers the underlying command handler.
 *
 * Note: Discord modals do NOT support autocomplete. Users who want live
 * title suggestions should still type /search directly.
 */

import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import { t } from "../../utils/botStrings.js";
import { handleSearchOrRequest } from "../commands/search.js";
import { handleRecommendCommand } from "../commands/recommend.js";
import { handleSimilarCommand } from "../commands/similar.js";
import { handleCollectionCommand } from "../commands/collection.js";
import { handleCastCommand } from "../commands/cast.js";
import { handleStatusCommand } from "../commands/status.js";
import logger from "../../utils/logger.js";

const MODAL_CONFIG = {
  wizard_search:     { command: "search",     labelKey: "wizard_modal_label_title", optionName: "title" },
  wizard_request:    { command: "request",    labelKey: "wizard_modal_label_title", optionName: "title" },
  wizard_recommend:  { command: "recommend",  labelKey: "wizard_modal_label_title", optionName: "title" },
  wizard_similar:    { command: "similar",    labelKey: "wizard_modal_label_title", optionName: "title" },
  wizard_collection: { command: "collection", labelKey: "wizard_modal_label_title", optionName: "title" },
  wizard_cast:       { command: "cast",       labelKey: "wizard_modal_label_name",  optionName: "name"  },
  wizard_status:     { command: "status",     labelKey: "wizard_modal_label_title", optionName: "title" },
};

export const WIZARD_MODAL_BUTTON_IDS = Object.keys(MODAL_CONFIG);

export async function showWizardSearchModal(interaction) {
  const cfg = MODAL_CONFIG[interaction.customId];
  if (!cfg) return;

  const modal = new ModalBuilder()
    .setCustomId(`wizard_modal_submit|${cfg.command}|${cfg.optionName}`)
    .setTitle(`/${cfg.command}`);

  const input = new TextInputBuilder()
    .setCustomId("title_input")
    .setLabel(t(cfg.labelKey))
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(200);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

export async function handleWizardModalSubmit(interaction) {
  const [, command, optionName] = interaction.customId.split("|");
  const value = interaction.fields.getTextInputValue("title_input")?.trim();
  if (!value) return;

  // Patch interaction.options so existing handlers can read getString("title")/getString("name")
  interaction.options = {
    getString: (name) => (name === optionName ? value : null),
    getInteger: () => null,
    getNumber: () => null,
    getBoolean: () => null,
  };

  logger.info(`[wizard-modal] submit: /${command} "${value}"`);

  try {
    switch (command) {
      case "search":     return await handleSearchOrRequest(interaction, value, "search");
      case "request":    return await handleSearchOrRequest(interaction, value, "request");
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
