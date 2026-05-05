import { approveRequest, declineRequest } from "../../api/seerr.js";
import { getSeerrUrl, getSeerrApiKey } from "../helpers.js";
import { t } from "../../utils/botStrings.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import logger from "../../utils/logger.js";
import { botState } from "../botState.js";

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
    let apiResult;
    if (isApprove) {
      apiResult = await approveRequest(parseInt(requestId, 10), seerrUrl, apiKey);
    } else {
      apiResult = await declineRequest(parseInt(requestId, 10), seerrUrl, apiKey);
    }

    // DM the requester
    try {
      const discordClient = botState.discordClient;
      if (discordClient && apiResult) {
        let discordId = apiResult?.requestedBy?.settings?.discordId;
        if (!discordId) {
          const seerrUsername = apiResult?.requestedBy?.username || apiResult?.requestedBy?.displayName;
          if (seerrUsername) {
            try {
              const raw = process.env.USER_MAPPINGS;
              const mappings = typeof raw === "string" ? JSON.parse(raw) : (raw || []);
              const match = Array.isArray(mappings) && mappings.find(
                (m) => m.seerrDisplayName === seerrUsername || String(m.seerrUserId) === String(seerrUsername)
              );
              if (match?.discordUserId) discordId = match.discordUserId;
            } catch (_) {}
          }
        }
        if (discordId) {
          const title = interaction.message.embeds[0]?.title || "Unknown";
          const dmEmbed = new EmbedBuilder()
            .setColor(isApprove ? "#1ec8a0" : "#e74c3c")
            .setAuthor({ name: isApprove ? "✅ Anfrage genehmigt" : "❌ Anfrage abgelehnt" })
            .setTitle(title)
            .setDescription(isApprove
              ? `Deine Anfrage für **${title}** wurde von einem Admin **genehmigt**. Der Download startet in Kürze.`
              : `Deine Anfrage für **${title}** wurde **abgelehnt**.`)
            .setTimestamp();
          const dmUser = await discordClient.users.fetch(discordId);
          await dmUser.send({ embeds: [dmEmbed] });
          logger.info(`[SEERR] ✉️ DM sent to ${discordId} after ${isApprove ? "approval" : "decline"} of "${title}"`);
        }
      }
    } catch (dmErr) {
      logger.warn(`[SEERR] Could not send DM after ${isApprove ? "approve" : "decline"}: ${dmErr.message}`);
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
