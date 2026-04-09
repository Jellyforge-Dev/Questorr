import logger from "../../utils/logger.js";

export async function handleRequestedButton(interaction) {
  try {
    await interaction.reply({
      content: "This item was already requested.",
      flags: 64,
    });
  } catch (replyErr) {
    logger.error("Failed to send 'already requested' reply:", replyErr);
  }
}
