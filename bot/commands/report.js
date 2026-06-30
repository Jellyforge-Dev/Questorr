import { t } from "../../utils/botStrings.js";
import { EmbedBuilder } from "discord.js";
import * as seerrApi from "../../api/seerr.js";
import { getSeerrUrl, getSeerrApiKey } from "../helpers.js";
import { recordIssueReporter } from "../../utils/issueReporters.js";
import logger from "../../utils/logger.js";

// Overseerr/Jellyseerr issue types: 1=Video, 2=Audio, 3=Subtitle, 4=Other
const TYPE_LABELS = {
  1: "report_type_video",
  2: "report_type_audio",
  3: "report_type_subtitle",
  4: "report_type_other",
};

export async function handleReportCommand(interaction) {
  if (process.env.SHOW_REPORT_COMMAND === "false") {
    return interaction.reply({ content: t("report_disabled"), flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });

  const sub = interaction.options.getSubcommand();
  const mediaType = sub === "series" ? "tv" : "movie";

  const raw = interaction.options.getString("title") || "";
  const parts = raw.split("|");
  if (parts.length < 2) {
    return interaction.editReply({ content: t("report_select_title") });
  }
  const tmdbId = parseInt(parts[0], 10);
  const titleFromOption = parts.slice(2).join("|");
  const issueType = parseInt(interaction.options.getString("type"), 10) || 4;
  const message = (interaction.options.getString("message") || "").slice(0, 500);
  const season = sub === "series" ? interaction.options.getInteger("season") : null;
  const episode = sub === "series" ? interaction.options.getInteger("episode") : null;

  const seerrUrl = getSeerrUrl();
  const seerrApiKey = getSeerrApiKey();
  if (!seerrUrl || !seerrApiKey) {
    return interaction.editReply({ content: t("report_seerr_missing") });
  }

  try {
    // Issues attach to a Seerr media item — only reportable if the title is
    // tracked in Seerr (requested/available), i.e. has a mediaInfo.id.
    const result = await seerrApi.checkMediaStatus(tmdbId, mediaType, [], seerrUrl, seerrApiKey);
    const mediaId = result?.data?.mediaInfo?.id;
    if (!result?.exists || !mediaId) {
      return interaction.editReply({ content: t("report_not_in_seerr") });
    }

    const issueOpts = mediaType === "tv" ? { season, episode } : {};
    const created = await seerrApi.createIssue(mediaId, issueType, message, seerrUrl, seerrApiKey, issueOpts);

    const mediaTitle = result.data?.title || result.data?.name || titleFromOption;
    const typeLabel = t(TYPE_LABELS[issueType] || "report_type_other");

    // Remember who reported it so we can DM them when an admin resolves it.
    if (created?.id) {
      recordIssueReporter(created.id, interaction.user.id, `${mediaType === "movie" ? "🎬" : "📺"} ${mediaTitle}`);
    }

    // Notify the admin channel.
    try {
      const channelId =
        process.env.SEERR_ADMIN_CHANNEL_ID ||
        process.env.SEERR_CHANNEL_ID ||
        process.env.JELLYFIN_CHANNEL_ID;
      if (channelId) {
        const channel = await interaction.client.channels.fetch(channelId);
        if (channel) {
          const embed = new EmbedBuilder()
            .setColor("#f0a05a")
            .setTitle(t("report_admin_title"))
            .addFields(
              { name: t("report_field_title"), value: `${mediaType === "movie" ? "🎬" : "📺"} ${mediaTitle}`, inline: false },
              { name: t("report_field_type"), value: typeLabel, inline: true },
              { name: t("report_field_reporter"), value: `<@${interaction.user.id}>`, inline: true }
            )
            .setTimestamp();
          if (mediaType === "tv" && (season || episode)) {
            const se =
              (season ? `S${String(season).padStart(2, "0")}` : "") +
              (episode ? `E${String(episode).padStart(2, "0")}` : "");
            embed.addFields({ name: t("report_field_episode"), value: se, inline: true });
          }
          if (message) embed.addFields({ name: t("report_field_message"), value: message, inline: false });
          await channel.send({ embeds: [embed] });
        }
      }
    } catch (notifyErr) {
      logger.warn(`[report] Failed to notify admin channel: ${notifyErr.message}`);
    }

    return interaction.editReply({ content: t("report_success") });
  } catch (err) {
    logger.error("[report] Failed to create issue:", err.message);
    return interaction.editReply({ content: t("report_error") });
  }
}
