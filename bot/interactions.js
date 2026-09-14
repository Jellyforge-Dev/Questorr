import { handleSearchOrRequest } from "./commands/search.js";
import { handleStatusCommand } from "./commands/status.js";
import { handleReportCommand } from "./commands/report.js";
import { handleIssueButton, handleIssueModal } from "./handlers/issueActions.js";
import { handleRandomCommand } from "./commands/random.js";
import { handleWatchlistCommand, handleWatchlistPagination } from "./commands/watchlist.js";
import { handleUpcomingCommand, handleUpcomingPagination } from "./commands/upcoming.js";
import { handleHistoryCommand } from "./commands/history.js";
import { handleRecommendCommand } from "./commands/recommend.js";
import { handleForYouCommand } from "./commands/foryou.js";
import { handleHelpCommand } from "./commands/help.js";
import { handleWizardButton } from "./handlers/wizardButton.js";
import { showWizardSearchModal, handleWizardModalSubmit, WIZARD_DIRECT_MODAL_BUTTON_IDS } from "./handlers/wizardSearchModal.js";
import { handleDymYes, handleDymNo, handleDymPick } from "./handlers/didYouMean.js";
import { showWizardSmartPicker, handleSmartPickerSelect, PICKER_BUTTON_IDS } from "./handlers/wizardSmartPicker.js";
import { handleActionButton, handleActionCastPick } from "./handlers/actionButton.js";
import { handleDiscoverCommand } from "./commands/discover.js";
import { handleCollectionCommand, buildCollectionReply } from "./commands/collection.js";
import { handleCastCommand, handleCastPagination } from "./commands/cast.js";
import { handleSimilarCommand } from "./commands/similar.js";
import { handleQueueCommand } from "./commands/queue.js";
import { handleSubscribeCommand, showSubscribeModal, handleSubscribeModalSubmit } from "./commands/subscribe.js";
import { handleAutocomplete } from "./autocomplete/index.js";
import { handleRequestButton } from "./handlers/requestButton.js";
import { handleStatusRequestButton } from "./handlers/statusRequestButton.js";
import { handleRandomRequestButton } from "./handlers/randomRequestButton.js";
import { handleSeasonSelect } from "./handlers/seasonSelect.js";
import { handleTagSelect } from "./handlers/tagSelect.js";
import { handleRequestedButton } from "./handlers/requestedButton.js";
import { handleSeerrApproveDecline } from "./handlers/seerrApproveDecline.js";
import { handleCleanupPagination } from "./cleanupAdvisor.js";
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

      // ─── Modal Submits ─────────────────────────────────────────────
      if (interaction.isModalSubmit()) {
        if (interaction.customId === "subscribe_modal_submit") {
          return handleSubscribeModalSubmit(interaction);
        }
        if (interaction.customId.startsWith("wizard_modal_submit|")) {
          return handleWizardModalSubmit(interaction);
        }
        if (
          interaction.customId.startsWith("issue_comment_modal|") ||
          interaction.customId.startsWith("issue_resolve_modal|")
        ) {
          return handleIssueModal(interaction);
        }
      }

      // ─── Buttons ───────────────────────────────────────────────────
      if (interaction.isButton()) {
        // "Meintest du?" confirmation / alternative selection
        if (interaction.customId.startsWith("dym_yes|"))  return handleDymYes(interaction);
        if (interaction.customId.startsWith("dym_no|"))   return handleDymNo(interaction);
        if (interaction.customId.startsWith("dym_pick|")) return handleDymPick(interaction);

        // Admin issue actions (comment / resolve) → open a modal
        if (
          interaction.customId.startsWith("issue_comment|") ||
          interaction.customId.startsWith("issue_resolve|")
        ) {
          return handleIssueButton(interaction);
        }

        // Contextual action buttons (Similar / Collection / Cast / Recommend) on result embeds
        if (
          interaction.customId.startsWith("action_similar|") ||
          interaction.customId.startsWith("action_collection|") ||
          interaction.customId.startsWith("action_cast|") ||
          interaction.customId.startsWith("action_recommend|")
        ) {
          // Track action-button usage (e.g. "action:similar", "action:recommend")
          const actionName = interaction.customId.split("|")[0].replace("action_", "action:");
          trackCommand(actionName, interaction.user.id, interaction.user.username, interaction.user.displayAvatarURL({ size: 64 }));
          return handleActionButton(interaction);
        }

        // /subscribe series → free-text modal (before the generic wizard_ check)
        if (interaction.customId === "wizard_subscribe") {
          return showSubscribeModal(interaction);
        }

        // /search & /request go straight to the modal
        if (WIZARD_DIRECT_MODAL_BUTTON_IDS.includes(interaction.customId)) {
          // Track wizard modal triggers (wizard_search / wizard_request)
          const wizKey = interaction.customId.replace("wizard_", "btn:");
          trackCommand(wizKey, interaction.user.id, interaction.user.username, interaction.user.displayAvatarURL({ size: 64 }));
          return showWizardSearchModal(interaction);
        }
        // /recommend, /similar, /collection, /cast → contextual smart-picker
        if (PICKER_BUTTON_IDS.includes(interaction.customId)) {
          return showWizardSmartPicker(interaction);
        }
        if (interaction.customId.startsWith("wizard_")) {
          // Track wizard shortcut buttons (foryou_all, foryou_avail, random_movie, etc.)
          const btnKey = interaction.customId.replace("wizard_", "btn:");
          trackCommand(btnKey, interaction.user.id, interaction.user.username, interaction.user.displayAvatarURL({ size: 64 }));
          return handleWizardButton(interaction);
        }
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
        if (interaction.customId.startsWith("seerr_approve|") || interaction.customId.startsWith("seerr_decline|")) {
          return handleSeerrApproveDecline(interaction);
        }
        if (interaction.customId.startsWith("collection_show|")) {
          // "Sammlung anzeigen" button on Seerr-webhook embeds — reuses the
          // /collection command's reply builder, scoped to the originating
          // movie's TMDB ID. Reply is ephemeral so it doesn't clutter the channel.
          if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ flags: 64 });
          }
          const tmdbIdRaw = interaction.customId.split("|")[1];
          const reply = await buildCollectionReply({ tmdbId: tmdbIdRaw, mediaType: "movie" });
          return interaction.editReply(reply);
        }
        if (interaction.customId.startsWith("watchlist_prev|") || interaction.customId.startsWith("watchlist_next|")) {
          return handleWatchlistPagination(interaction);
        }
        if (interaction.customId.startsWith("cast_prev|") || interaction.customId.startsWith("cast_next|")) {
          return handleCastPagination(interaction);
        }
        if (interaction.customId.startsWith("upcoming_prev|") || interaction.customId.startsWith("upcoming_next|")) {
          return handleUpcomingPagination(interaction);
        }
        if (interaction.customId.startsWith("cleanup_prev|") || interaction.customId.startsWith("cleanup_next|")) {
          return handleCleanupPagination(interaction);
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
        if (interaction.customId.startsWith("smartpick|")) {
          return handleSmartPickerSelect(interaction);
        }
        if (interaction.customId.startsWith("action_cast_pick|")) {
          return handleActionCastPick(interaction);
        }
      }

      // ─── Slash Commands ───────────────────────────────────────────
      if (interaction.isCommand()) {
        // Track command usage
        trackCommand(interaction.commandName, interaction.user.id, interaction.user.username, interaction.user.displayAvatarURL({ size: 64 }));

        // /help works without backend config — handle BEFORE the gate below
        if (interaction.commandName === "help") {
          return handleHelpCommand(interaction);
        }

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
        if (interaction.commandName === "report") {
          return handleReportCommand(interaction);
        }
        if (interaction.commandName === "random") {
          return handleRandomCommand(interaction);
        }
        if (interaction.commandName === "watchlist") {
          return handleWatchlistCommand(interaction);
        }
        if (interaction.commandName === "upcoming") {
          return handleUpcomingCommand(interaction);
        }
        if (interaction.commandName === "history") {
          return handleHistoryCommand(interaction);
        }
        if (interaction.commandName === "recommend") {
          return handleRecommendCommand(interaction);
        }
        if (interaction.commandName === "foryou") {
          return handleForYouCommand(interaction);
        }
        if (interaction.commandName === "discover") {
          return handleDiscoverCommand(interaction);
        }
        if (interaction.commandName === "collection") {
          return handleCollectionCommand(interaction);
        }
        if (interaction.commandName === "cast") {
          return handleCastCommand(interaction);
        }
        if (interaction.commandName === "similar") {
          return handleSimilarCommand(interaction);
        }
        if (interaction.commandName === "queue") {
          return handleQueueCommand(interaction);
        }
        if (interaction.commandName === "subscribe") {
          return handleSubscribeCommand(interaction);
        }
      }
    } catch (outerErr) {
      logger.error("Interaction handler error:", outerErr);
    }
  });
}
