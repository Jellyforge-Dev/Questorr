/**
 * /help — wizard with command overview and quick-action buttons.
 *
 * Posts an ephemeral embed listing every Questorr command (descriptions from
 * the `wizard_*` i18n namespace) plus 7 buttons that directly execute the
 * commands which need no text input. Search-style commands stay text-only
 * because Discord's native autocomplete delivers a better UX than a blind
 * modal text field.
 */

import { buildHelpEmbed, buildHelpComponents } from "../helpers/helpMessage.js";

export async function handleHelpCommand(interaction) {
  await interaction.deferReply({ flags: 64 });
  return interaction.editReply({
    embeds: [buildHelpEmbed()],
    components: buildHelpComponents(),
  });
}
