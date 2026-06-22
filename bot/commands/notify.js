import { t } from "../../utils/botStrings.js";
import { toggleNotify } from "../../utils/notifyPrefs.js";

/**
 * /notify — opt in/out of a DM when one of your requests becomes available.
 * Toggles the per-user preference and confirms ephemerally.
 */
export async function handleNotifyCommand(interaction) {
  const on = toggleNotify(interaction.user.id);
  return interaction.reply({
    content: on ? t("notify_enabled") : t("notify_disabled"),
    flags: 64,
  });
}
