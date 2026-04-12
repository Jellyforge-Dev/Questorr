import { t } from "../../utils/botStrings.js";
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import * as tmdbApi from "../../api/tmdb.js";
import { findJellyfinItemByTmdbId } from "../../api/jellyfin.js";
import { buildSeerrUrl, buildJellyfinUrl, getTmdbApiKey, parseButtonConfig } from "../helpers.js";
import { isValidUrl } from "../../utils/url.js";
import logger from "../../utils/logger.js";

export async function handleRecommendCommand(interaction) {
  await interaction.deferReply({ flags: 64 });

  const apiKey = getTmdbApiKey();
  if (!apiKey) {
    return interaction.editReply({ content: t("command_config_missing") });
  }

  const raw = interaction.options.getString("title");
  if (!raw) {
    return interaction.editReply({ content: t("title_invalid") });
  }

  try {
    // Parse TMDB ID from autocomplete (format: "Title|tmdbId|mediaType")
    let tmdbId, mediaType;
    if (raw.includes("|")) {
      const parts = raw.split("|");
      tmdbId = parts[1];
      mediaType = parts[2] || "movie";
    } else {
      // Plain text search — find best match
      const results = await tmdbApi.tmdbSearch(raw, apiKey);
      if (!results || results.length === 0) {
        return interaction.editReply({ content: t("recommend_not_found") });
      }
      const best = results[0];
      tmdbId = best.id;
      mediaType = best.media_type || (best.title ? "movie" : "tv");
    }

    // Fetch source title details
    const sourceDetails = await tmdbApi.tmdbGetDetails(tmdbId, mediaType, apiKey);
    if (!sourceDetails) {
      return interaction.editReply({ content: t("recommend_not_found") });
    }
    const sourceTitle = sourceDetails.title || sourceDetails.name || "Unknown";

    // Fetch similar titles from TMDB
    const similar = await tmdbApi.tmdbGetSimilar(tmdbId, mediaType, apiKey);
    if (!similar || similar.length === 0) {
      return interaction.editReply({ content: t("recommend_no_similar").replace("{{title}}", sourceTitle) });
    }

    // Take top 5, fetch details + check Jellyfin availability
    const top = similar.slice(0, 5);
    const jellyfinApiKey = process.env.JELLYFIN_API_KEY;
    const jellyfinBaseUrl = process.env.JELLYFIN_BASE_URL;

    const recommendations = await Promise.all(
      top.map(async (item) => {
        const id = item.id;
        const type = mediaType; // similar endpoint returns same type
        const title = item.title || item.name || "Unknown";
        const year = (item.release_date || item.first_air_date || "").substring(0, 4);
        const rating = item.vote_average ? item.vote_average.toFixed(1) : null;
        const overview = item.overview
          ? item.overview.length > 150
            ? item.overview.substring(0, 147) + "..."
            : item.overview
          : "";

        // Check Jellyfin availability
        let jellyfinItemId = null;
        let available = false;
        if (jellyfinApiKey && jellyfinBaseUrl) {
          try {
            jellyfinItemId = await findJellyfinItemByTmdbId(
              String(id), type, title, jellyfinApiKey, jellyfinBaseUrl
            );
            available = !!jellyfinItemId;
          } catch (_) {}
        }

        return { id, type, title, year, rating, overview, available, jellyfinItemId };
      })
    );

    // Build embed
    const emoji = mediaType === "movie" ? "🎬" : "📺";
    const embed = new EmbedBuilder()
      .setColor(process.env.EMBED_COLOR_SEARCH || "#f0a05a")
      .setAuthor({ name: t("recommend_title") })
      .setTitle(`${emoji} ${t("recommend_based_on").replace("{{title}}", sourceTitle)}`)
      .setTimestamp();

    if (sourceDetails.poster_path) {
      embed.setThumbnail(`https://image.tmdb.org/t/p/w500${sourceDetails.poster_path}`);
    }

    const footerText = process.env.EMBED_FOOTER_TEXT;
    if (footerText) embed.setFooter({ text: footerText });

    // Build description with recommendations
    const lines = recommendations.map((rec, i) => {
      const status = rec.available ? "✅" : "❌";
      const ratingStr = rec.rating ? ` ⭐ ${rec.rating}` : "";
      const yearStr = rec.year ? ` (${rec.year})` : "";
      let line = `**${i + 1}. ${rec.title}${yearStr}**${ratingStr} ${status}`;
      if (rec.overview) line += `\n> ${rec.overview}`;
      return line;
    });

    embed.setDescription(
      `${t("recommend_legend")}\n\n${lines.join("\n\n")}`
    );

    // Build buttons for available items (Watch Now links)
    const components = [];
    const _showRec = parseButtonConfig("NOTIF_BUTTONS_RANDOM");

    for (const rec of recommendations) {
      if (rec.available && rec.jellyfinItemId && _showRec("watch")) {
        const watchUrl = buildJellyfinUrl(rec.jellyfinItemId);
        if (watchUrl && isValidUrl(watchUrl)) {
          const label = `▶ ${rec.title.substring(0, 70)}`;
          components.push(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel(label)
              .setURL(watchUrl)
          );
        }
      }
    }

    // Limit to 5 buttons (Discord max per row)
    const replyOpts = { embeds: [embed] };
    if (components.length > 0) {
      replyOpts.components = [new ActionRowBuilder().addComponents(components.slice(0, 5))];
    }

    return interaction.editReply(replyOpts);
  } catch (err) {
    logger.error("Recommend command error:", err);
    return interaction.editReply({ content: t("recommend_error") });
  }
}
