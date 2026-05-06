/**
 * /help — wizard with command overview and quick-action buttons.
 *
 * Posts an ephemeral embed listing every Questorr command (descriptions from
 * the `wizard_*` i18n namespace) plus 7 buttons that directly execute the
 * commands which need no text input. Search-style commands stay text-only
 * because Discord's native autocomplete delivers a better UX than a blind
 * modal text field.
 */

import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { t } from "../../utils/botStrings.js";

function buildDescription() {
  return [
    `**${t("wizard_section_quick")}**`,
    `🎯 \`/foryou\` — ${t("wizard_desc_foryou")}`,
    `🎲 \`/random\` — ${t("wizard_desc_random")}`,
    "",
    `**${t("wizard_section_browse")}**`,
    `📋 \`/watchlist\` — ${t("wizard_desc_watchlist")}`,
    `📚 \`/history\` — ${t("wizard_desc_history")}`,
    `📅 \`/upcoming\` — ${t("wizard_desc_upcoming")}`,
    `📈 \`/trending\` — ${t("wizard_desc_trending")}`,
    "",
    `**${t("wizard_section_search")}**`,
    `🔍 \`/search <title>\` — ${t("wizard_desc_search")}`,
    `📥 \`/request <title>\` — ${t("wizard_desc_request")}`,
    `❓ \`/status <title>\` — ${t("wizard_desc_status")}`,
    "",
    `**${t("wizard_section_discover")}**`,
    `⭐ \`/recommend <title>\` — ${t("wizard_desc_recommend")}`,
    `🔗 \`/similar <title>\` — ${t("wizard_desc_similar")}`,
    `📦 \`/collection <title>\` — ${t("wizard_desc_collection")}`,
    `🎭 \`/cast <name>\` — ${t("wizard_desc_cast")}`,
    `🎬 \`/discover <type>\` — ${t("wizard_desc_discover")}`,
  ].join("\n");
}

export async function handleHelpCommand(interaction) {
  await interaction.deferReply({ flags: 64 });

  const embed = new EmbedBuilder()
    .setColor("#a6e3a1")
    .setAuthor({ name: t("wizard_title") })
    .setDescription(buildDescription())
    .setFooter({ text: t("wizard_footer") });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("wizard_foryou_all")
      .setStyle(ButtonStyle.Primary)
      .setLabel(t("wizard_btn_foryou_all"))
      .setEmoji("🎯"),
    new ButtonBuilder()
      .setCustomId("wizard_foryou_avail")
      .setStyle(ButtonStyle.Secondary)
      .setLabel(t("wizard_btn_foryou_avail"))
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId("wizard_random_movie")
      .setStyle(ButtonStyle.Secondary)
      .setLabel(t("wizard_btn_random_movie"))
      .setEmoji("🎲"),
    new ButtonBuilder()
      .setCustomId("wizard_random_series")
      .setStyle(ButtonStyle.Secondary)
      .setLabel(t("wizard_btn_random_series"))
      .setEmoji("🎲"),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("wizard_watchlist")
      .setStyle(ButtonStyle.Secondary)
      .setLabel(t("wizard_btn_watchlist"))
      .setEmoji("📋"),
    new ButtonBuilder()
      .setCustomId("wizard_history")
      .setStyle(ButtonStyle.Secondary)
      .setLabel(t("wizard_btn_history"))
      .setEmoji("📚"),
    new ButtonBuilder()
      .setCustomId("wizard_upcoming")
      .setStyle(ButtonStyle.Secondary)
      .setLabel(t("wizard_btn_upcoming"))
      .setEmoji("📅"),
  );

  return interaction.editReply({ embeds: [embed], components: [row1, row2] });
}
