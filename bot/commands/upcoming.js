import { t } from "../../utils/botStrings.js";
import { EmbedBuilder } from "discord.js";
import { tmdbGetUpcoming } from "../../api/tmdb.js";
import * as seerrApi from "../../api/seerr.js";
import { getTmdbApiKey, getSeerrUrl, getSeerrApiKey } from "../helpers.js";
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

    // Show up to 10 upcoming releases with Seerr status
    const shown = results.slice(0, 10);
    const itemsWithStatus = await Promise.all(
      shown.map(async (r) => {
        let seerrStatus = null;
        try {
          const sr = await seerrApi.checkMediaStatus(r.id, r.media_type, [], getSeerrUrl(), getSeerrApiKey());
          seerrStatus = sr?.status ?? null;
        } catch (_) {}
        return { ...r, seerrStatus };
      })
    );
    const lines = itemsWithStatus.map((r, i) => {
      const title = r.title || r.name || "Unknown";
      const date = r.release_date || r.first_air_date || "TBA";
      const emoji = r.media_type === "movie" ? "\uD83C\uDFAC" : "\uD83D\uDCFA";
      const rating = r.vote_average ? `\u2B50 ${r.vote_average.toFixed(1)}` : "";
      let statusIcon = "";
      if (r.seerrStatus === 5) statusIcon = " \u2705";
      else if (r.seerrStatus === 4) statusIcon = " \uD83D\uDCE5";
      else if (r.seerrStatus === 2 || r.seerrStatus === 3) statusIcon = " \u23F3";
      return `${i + 1}. ${emoji} **${title}** \u2014 ${date}${rating ? ` \u00B7 ${rating}` : ""}${statusIcon}`;
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
