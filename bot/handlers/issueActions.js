import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { createIssueComment, updateIssueStatus } from "../../api/seerr.js";
import { getSeerrUrl, getSeerrApiKey } from "../helpers.js";
import { t } from "../../utils/botStrings.js";
import logger from "../../utils/logger.js";

/**
 * Buttons attached to an issue's admin-channel post so admins can comment on or
 * resolve the issue from Discord, without opening the Seerr web UI. Posting a
 * comment / resolving fires the matching Seerr webhook, which DMs the reporter.
 */
export function buildIssueAdminButtons(issueId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`issue_comment|${issueId}`).setStyle(ButtonStyle.Primary).setLabel(t("issue_btn_comment")).setEmoji("💬"),
    new ButtonBuilder().setCustomId(`issue_resolve|${issueId}`).setStyle(ButtonStyle.Success).setLabel(t("issue_btn_resolve")).setEmoji("✅")
  );
}

export async function handleIssueButton(interaction) {
  const [action, issueId] = interaction.customId.split("|");
  const isResolve = action === "issue_resolve";
  const modal = new ModalBuilder()
    .setCustomId(`${isResolve ? "issue_resolve_modal" : "issue_comment_modal"}|${issueId}`)
    .setTitle(isResolve ? t("issue_modal_resolve_title") : t("issue_modal_comment_title"));
  const input = new TextInputBuilder()
    .setCustomId("issue_comment_text")
    .setLabel(isResolve ? t("issue_modal_resolve_label") : t("issue_modal_comment_label"))
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(!isResolve) // comment is required for a comment, optional when resolving
    .setMaxLength(1000);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

export async function handleIssueModal(interaction) {
  const [action, issueId] = interaction.customId.split("|");
  const isResolve = action === "issue_resolve_modal";
  const text = (interaction.fields.getTextInputValue("issue_comment_text") || "").trim();

  const seerrUrl = getSeerrUrl();
  const seerrApiKey = getSeerrApiKey();
  if (!seerrUrl || !seerrApiKey) {
    return interaction.reply({ content: t("command_config_missing"), flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });
  try {
    if (text) await createIssueComment(issueId, text, seerrUrl, seerrApiKey);
    if (isResolve) await updateIssueStatus(issueId, "resolved", seerrUrl, seerrApiKey);
    return interaction.editReply({ content: isResolve ? t("issue_resolved_done") : t("issue_comment_done") });
  } catch (err) {
    logger.error(`[issueActions] Failed (${action} ${issueId}): ${err.message}`);
    return interaction.editReply({ content: t("issue_action_error") });
  }
}
