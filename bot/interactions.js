import { handleSearchOrRequest } from "./commands/search.js";
import { handleStatusCommand } from "./commands/status.js";
import { handleRandomCommand } from "./commands/random.js";
import { handleAutocomplete } from "./autocomplete/index.js";
import { handleRequestButton } from "./handlers/requestButton.js";
import { handleStatusRequestButton } from "./handlers/statusRequestButton.js";
import { handleRandomRequestButton } from "./handlers/randomRequestButton.js";
import { handleSeasonSelect } from "./handlers/seasonSelect.js";
import { handleTagSelect } from "./handlers/tagSelect.js";
import { handleRequestedButton } from "./handlers/requestedButton.js";
import { getOptionStringRobust, checkRolePermission } from "./botUtils.js";
import { getSeerrUrl, getSeerrApiKey, getTmdbApiKey } from "./helpers.js";
import { checkCommandRateLimit } from "./commandRateLimit.js";
import { trackCommand } from "./commandStats.js";
import { t } from "../utils/botStrings.js";
import logger from "../utils/logger.js";

// ----------------- REGISTER INTERACTIONS -----------------
export function registerInteractions(client) {
  client.on("interactionCreate", async (interaction) => {
    try {
      // Check role permissions for all commands and non-special select menus
      if (
        interaction.isCommand() ||
        (interaction.isStringSelectMenu() &&
          !interaction.customId.startsWith("request_seasons|") &&
          !interaction.customId.startsWith("request_with_tags|"))
      ) {
        if (!checkRolePermission(interaction.member)) {
          return interaction.reply({
            content: t("no_permission"),
            flags: 64,
          });
        }
      }

      // ─── Per-user command rate limiting (skip autocomplete) ────────
      if (interaction.isCommand() || interaction.isButton() || interaction.isStringSelectMenu()) {
        const limit = parseInt(process.env.COMMAND_RATE_LIMIT || "10", 10);
        if (!checkCommandRateLimit(interaction.user.id, limit)) {
          if (interaction.isCommand()) {
            return interaction.reply({ content: t("rate_limited"), flags: 64 });
          }
          return; // Silently drop rate-limited button/menu interactions
        }
      }

      // ─── Autocomplete ──────────────────────────────────────────────
      if (interaction.isAutocomplete()) {
        return handleAutocomplete(interaction);
      }

      // ─── Buttons ───────────────────────────────────────────────────
      if (interaction.isButton()) {
        if (interaction.customId.startsWith("status_request_btn|")) {
          return handleStatusRequestButton(interaction);
        }
        if (interaction.customId.startsWith("request_btn|")) {
          return handleRequestButton(interaction);
        }
        if (interaction.customId.startsWith("request_random_")) {
          return handleRandomRequestButton(interaction);
        }
        if (interaction.customId.startsWith("requested|")) {
          return handleRequestedButton(interaction);
        }
      }

      // ─── Select Menus ─────────────────────────────────────────────
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith("select_seasons|")) {
          return handleSeasonSelect(interaction);
        }
        if (interaction.customId.startsWith("select_tags|")) {
          return handleTagSelect(interaction);
        }
      }

      // ─── Slash Commands ───────────────────────────────────────────
      if (interaction.isCommand()) {
        // Track command usage
        trackCommand(interaction.commandName, interaction.user.id, interaction.user.username, interaction.user.displayAvatarURL({ size: 64 }));

        if (!getSeerrUrl() || !getSeerrApiKey() || !getTmdbApiKey()) {
          return interaction.reply({
            content: t("command_config_missing"),
            flags: 64,
          });
        }

        const raw = getOptionStringRobust(interaction);

        if (interaction.commandName === "search") {
          return handleSearchOrRequest(interaction, raw, "search");
        }
        if (interaction.commandName === "request") {
          const tag = interaction.options.getString("tag");
          const quality = interaction.options.getString("quality");
          const server = interaction.options.getString("server");
          return handleSearchOrRequest(
            interaction,
            raw,
            "request",
            tag ? [tag] : [],
            { quality, server }
          );
        }
        if (interaction.commandName === "trending") {
          return handleSearchOrRequest(interaction, raw, "search");
        }
        if (interaction.commandName === "status") {
          return handleStatusCommand(interaction);
        }
        if (interaction.commandName === "random") {
          return handleRandomCommand(interaction);
        }
      }
    } catch (outerErr) {
      logger.error("Interaction handler error:", outerErr);
    }
  });
}
