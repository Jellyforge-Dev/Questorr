/**
 * Shared builder for the Help-Wizard embed + action rows.
 * Used by both the /help slash command (ephemeral) and the
 * "Post Help Wizard" dashboard action (public, pinnable).
 */

import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { t } from "../../utils/botStrings.js";

export function buildHelpDescription() {
  return [
    `**${t("wizard_section_quick")}**`,
    `🎯 \`/foryou\` — ${t("wizard_desc_foryou")}`,
    `🎲 \`/random\` — ${t("wizard_desc_random")}`,
    "",
    `**${t("wizard_section_browse")}**`,
    `📋 \`/watchlist\` — ${t("wizard_desc_watchlist")}`,
    `🗒️ \`/queue\` — ${t("wizard_desc_queue")}`,
    `🔔 \`/subscribe\` — ${t("wizard_desc_subscribe")}`,
    `📅 \`/upcoming\` — ${t("wizard_desc_upcoming")}`,
    `📈 \`/trending\` — ${t("wizard_desc_trending")}`,
    "",
    `**${t("wizard_section_search")}**`,
    `🔍 \`/search <title>\` — ${t("wizard_desc_search")}`,
    `📥 \`/request <title>\` — ${t("wizard_desc_request")}`,
    `❓ \`/status <title>\` — ${t("wizard_desc_status")}`,
    `🐛 \`/report <title>\` — ${t("wizard_desc_report")}`,
    "",
    `**${t("wizard_section_discover")}**`,
    `⭐ \`/recommend <title>\` — ${t("wizard_desc_recommend")}`,
    `🔗 \`/similar <title>\` — ${t("wizard_desc_similar")}`,
    `📦 \`/collection <title>\` — ${t("wizard_desc_collection")}`,
    `🎭 \`/cast <name>\` — ${t("wizard_desc_cast")}`,
    `🎬 \`/discover <type>\` — ${t("wizard_desc_discover")}`,
  ].join("\n");
}

export function buildHelpEmbed() {
  return new EmbedBuilder()
    .setColor("#a6e3a1")
    .setAuthor({ name: t("wizard_title") })
    .setDescription(buildHelpDescription())
    .setFooter({ text: t("wizard_footer") });
}

export function buildHelpComponents() {
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
      .setCustomId("wizard_queue")
      .setStyle(ButtonStyle.Secondary)
      .setLabel(t("wizard_btn_queue"))
      .setEmoji("🗒️"),
    new ButtonBuilder()
      .setCustomId("wizard_subscribe")
      .setStyle(ButtonStyle.Secondary)
      .setLabel(t("wizard_btn_subscribe"))
      .setEmoji("🔔"),
    new ButtonBuilder()
      .setCustomId("wizard_upcoming")
      .setStyle(ButtonStyle.Secondary)
      .setLabel(t("wizard_btn_upcoming"))
      .setEmoji("📅"),
  );

  // Modal-triggering buttons for the two generic search flows. Discovery
  // commands (Recommend / Similar / Collection / Cast) now appear as
  // contextual action buttons on each search result instead of as blind
  // wizard buttons — that removes the "what do I type?" UX pothole.
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("wizard_search")
      .setStyle(ButtonStyle.Secondary)
      .setLabel(t("wizard_btn_search"))
      .setEmoji("🔍"),
    new ButtonBuilder()
      .setCustomId("wizard_request")
      .setStyle(ButtonStyle.Secondary)
      .setLabel(t("wizard_btn_request"))
      .setEmoji("📥"),
  );

  return [row1, row2, row3];
}
