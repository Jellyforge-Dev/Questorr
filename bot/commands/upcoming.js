import { t } from "../../utils/botStrings.js";
import { EmbedBuilder } from "discord.js";
import { tmdbGetUpcoming } from "../../api/tmdb.js";
import { getTmdbApiKey } from "../helpers.js";
import logger from "../../utils/logger.js";

export async function handleUpcomingCommand(interaction) {
  await interaction.deferReply({ flags: 64 });

  const apiKey = getTmdbApiKey();
  if (!apiKey) {
    return interaction.editReply({ content: t("command_config_missing") });
  }

  const type = interaction.options.getString("type") || "all";

  try {
    const results = await tmdbGetUpcoming(apiKey, type);

    if (!results || results.length === 0) {
      return interaction.editReply({ content: t("upcoming_empty") });
    }

    // Show up to 10 upcoming releases
    const shown = results.slice(0, 10);
    const lines = shown.map((r, i) => {
      const title = r.title || r.name || "Unknown";
      const date = r.release_date || r.first_air_date || "TBA";
      const emoji = r.media_type === "movie" ? "🎬" : "📺";
      const rating = r.vote_average ? `⭐ ${r.vote_average.toFixed(1)}` : "";
      return `${i + 1}. ${emoji} **${title}** — ${date}${rating ? ` · ${rating}` : ""}`;
    });

    const embed = new EmbedBuilder()
      .setColor("#89b4fa")
      .setAuthor({ name: t("upcoming_title") })
      .setDescription(lines.join("\n"))
      .setTimestamp();

    if (results.length > 10) {
      embed.setFooter({ text: `Showing 10 of ${results.length} results` });
    }

    const footerText = process.env.EMBED_FOOTER_TEXT;
    if (footerText && results.length <= 10) embed.setFooter({ text: footerText });

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error("Upcoming command error:", err);
    return interaction.editReply({ content: t("upcoming_error") });
  }
}
