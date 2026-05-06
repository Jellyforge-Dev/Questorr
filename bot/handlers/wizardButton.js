/**
 * Wizard button dispatcher — routes `wizard_*` custom-IDs to existing
 * command handlers. Patches `interaction.options` with synthetic getters
 * so handlers can read parameters as if they came from a slash command.
 */

import { handleForYouCommand } from "../commands/foryou.js";
import { handleRandomCommand } from "../commands/random.js";
import { handleWatchlistCommand } from "../commands/watchlist.js";
import { handleHistoryCommand } from "../commands/history.js";
import { handleUpcomingCommand } from "../commands/upcoming.js";
import logger from "../../utils/logger.js";

function patchOptions(interaction, params) {
  interaction.options = {
    getString: (name) => (name in params ? params[name] : null),
    getInteger: (name) => (name in params ? params[name] : null),
    getNumber: (name) => (name in params ? params[name] : null),
    getBoolean: (name) => (name in params ? params[name] : null),
  };
}

export async function handleWizardButton(interaction) {
  const id = interaction.customId;
  logger.info(`[wizard] button click: ${id}`);

  switch (id) {
    case "wizard_foryou_all":
      patchOptions(interaction, { filter: "all" });
      return handleForYouCommand(interaction);

    case "wizard_foryou_avail":
      patchOptions(interaction, { filter: "available" });
      return handleForYouCommand(interaction);

    case "wizard_random_movie":
      patchOptions(interaction, { type: "movie" });
      return handleRandomCommand(interaction);

    case "wizard_random_series":
      patchOptions(interaction, { type: "series" });
      return handleRandomCommand(interaction);

    case "wizard_watchlist":
      patchOptions(interaction, {});
      return handleWatchlistCommand(interaction);

    case "wizard_history":
      patchOptions(interaction, {});
      return handleHistoryCommand(interaction);

    case "wizard_upcoming":
      patchOptions(interaction, {});
      return handleUpcomingCommand(interaction);

    default:
      logger.warn(`[wizard] unknown custom_id: ${id}`);
  }
}
