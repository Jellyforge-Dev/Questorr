import { t } from "../../utils/botStrings.js";
import logger from "../../utils/logger.js";

export async function handleRequestedButton(interaction) {
  try {
    await interaction.reply({
      content: t("already_requested"),
      flags: 64,
    });
  } catch (replyErr) {
    logger.error("Failed to send 'already requested' reply:", replyErr);
  }
}
