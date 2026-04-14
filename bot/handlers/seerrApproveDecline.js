import { approveRequest, declineRequest } from "../../api/seerr.js";
import { getSeerrUrl, getSeerrApiKey } from "../helpers.js";
import { t } from "../../utils/botStrings.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import logger from "../../utils/logger.js";

/**
 * Handle approve/decline button clicks on MEDIA_PENDING admin notifications.
 */
export async function handleSeerrApproveDecline(interaction) {
  const [action, requestId] = interaction.customId.split("|");
  const isApprove = action === "seerr_approve";

  const seerrUrl = getSeerrUrl();
  const apiKey = getSeerrApiKey();

  if (!seerrUrl || !apiKey) {
    return interaction.reply({ content: t("command_config_missing"), flags: 64 });
  }

  await interaction.deferUpdate();

  try {
    if (isApprove) {
      await approveRequest(parseInt(requestId, 10), seerrUrl, apiKey);
    } else {
      await declineRequest(parseInt(requestId, 10), seerrUrl, apiKey);
    }

    // Update the message: disable buttons and show who acted
    const username = interaction.user.username;
    const label = isApprove
      ? `✅ ${t("btn_approved_by")} ${username}`
      : `❌ ${t("btn_declined_by")} ${username}`;

    // Rebuild components: replace approve/decline with a disabled status button, keep link buttons
    const originalRow = interaction.message.components[0];
    const newButtons = [];

    // Add disabled status button
    newButtons.push(
      new ButtonBuilder()
        .setCustomId("seerr_action_done")
        .setLabel(label)
        .setStyle(isApprove ? ButtonStyle.Success : ButtonStyle.Danger)
        .setDisabled(true)
    );

    // Keep link buttons from the original row
    if (originalRow) {
      for (const comp of originalRow.components) {
        if (comp.data.style === ButtonStyle.Link) {
          newButtons.push(ButtonBuilder.from(comp));
        }
      }
    }

    await interaction.editReply({
      components: [new ActionRowBuilder().addComponents(newButtons)],
    });

    logger.info(`[SEERR] ${isApprove ? "✅ Approved" : "❌ Declined"} request ${requestId} by ${username}`);
  } catch (err) {
    logger.error(`[SEERR] Failed to ${isApprove ? "approve" : "decline"} request ${requestId}:`, err.message);
    try {
      await interaction.followUp({
        content: `❌ Failed to ${isApprove ? "approve" : "decline"} request: ${err.message}`,
        flags: 64,
      });
    } catch (followUpErr) {
      logger.debug("[seerrApproveDecline] Follow-up message failed: %s", followUpErr.message);
    }
  }
}
