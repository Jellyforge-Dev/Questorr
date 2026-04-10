import { t } from "../../utils/botStrings.js";
import { EmbedBuilder } from "discord.js";
import { fetchLatestAdditions } from "../../api/jellyfin.js";
import { buildJellyfinUrl } from "../helpers.js";
import logger from "../../utils/logger.js";

export async function handleHistoryCommand(interaction) {
  await interaction.deferReply({ flags: 64 });

  const apiKey = process.env.JELLYFIN_API_KEY;
  const baseUrl = process.env.JELLYFIN_BASE_URL;

  if (!apiKey || !baseUrl) {
    return interaction.editReply({ content: t("history_jf_missing") });
  }

  const type = interaction.options.getString("type") || "all";

  try {
    const items = await fetchLatestAdditions(apiKey, baseUrl, 10, type);

    if (!items || items.length === 0) {
      return interaction.editReply({ content: t("history_empty") });
    }

    const lines = items.map((item, i) => {
      const emoji = item.Type === "Movie" ? "🎬" : "📺";
      const year = item.ProductionYear ? ` (${item.ProductionYear})` : "";
      const rating = item.CommunityRating ? ` ⭐ ${item.CommunityRating.toFixed(1)}` : "";
      const date = item.DateCreated ? new Date(item.DateCreated).toLocaleDateString() : "";
      return `${i + 1}. ${emoji} **${item.Name}**${year}${rating}\n   ↳ Added ${date}`;
    });

    const embed = new EmbedBuilder()
      .setColor("#17b8c4")
      .setAuthor({ name: t("history_title") })
      .setDescription(lines.join("\n\n"))
      .setTimestamp();

    const footerText = process.env.EMBED_FOOTER_TEXT;
    if (footerText) embed.setFooter({ text: footerText });

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error("History command error:", err);
    return interaction.editReply({ content: t("history_error") });
  }
}
