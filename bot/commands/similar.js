import { t } from "../../utils/botStrings.js";
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import * as tmdbApi from "../../api/tmdb.js";
import * as seerrApi from "../../api/seerr.js";
import { findJellyfinItemByTmdbId } from "../../api/jellyfin.js";
import { buildJellyfinUrl, getTmdbApiKey, getSeerrUrl, getSeerrApiKey, parseButtonConfig } from "../helpers.js";
import { isValidUrl } from "../../utils/url.js";
import logger from "../../utils/logger.js";

export async function handleSimilarCommand(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: 64 });
  }

  const apiKey = getTmdbApiKey();
  if (!apiKey) {
    return interaction.editReply({ content: t("command_config_missing") });
  }

  const raw = interaction.options.getString("title");
  if (!raw) {
    return interaction.editReply({ content: t("title_invalid") });
  }

  try {
    // Parse TMDB ID from autocomplete (format: "tmdbId|mediaType")
    let tmdbId, mediaType;
    if (raw.includes("|")) {
      const parts = raw.split("|");
      tmdbId = parts[0];
      mediaType = parts[1] || "movie";
    } else {
      const results = await tmdbApi.tmdbSearch(raw, apiKey);
      if (!results || results.length === 0) {
        return interaction.editReply({ content: t("similar_not_found") });
      }
      const best = results[0];
      tmdbId = best.id;
      mediaType = best.media_type || (best.title ? "movie" : "tv");
    }

    const sourceDetails = await tmdbApi.tmdbGetDetails(tmdbId, mediaType, apiKey);
    if (!sourceDetails) {
      return interaction.editReply({ content: t("similar_not_found") });
    }
    const sourceTitle = sourceDetails.title || sourceDetails.name || "Unknown";

    // Fetch genre/keyword-based similar titles via TMDB's /similar endpoint
    // (distinct from /recommendations — that one is used by /recommend).
    const similar = await tmdbApi.tmdbGetSimilarTitles(tmdbId, mediaType, apiKey);
    if (!similar || similar.length === 0) {
      return interaction.editReply({ content: t("similar_no_results").replace("{{title}}", sourceTitle) });
    }

    const top = similar.slice(0, 5);
    const jellyfinApiKey = process.env.JELLYFIN_API_KEY;
    const jellyfinBaseUrl = process.env.JELLYFIN_BASE_URL;

    const items = await Promise.all(
      top.map(async (item) => {
        const id = item.id;
        const title = item.title || item.name || "Unknown";
        const year = (item.release_date || item.first_air_date || "").substring(0, 4);
        const rating = item.vote_average ? item.vote_average.toFixed(1) : null;
        const overview = item.overview
          ? item.overview.length > 150
            ? item.overview.substring(0, 147) + "..."
            : item.overview
          : "";

        let jellyfinItemId = null;
        let available = false;
        if (jellyfinApiKey && jellyfinBaseUrl) {
          try {
            jellyfinItemId = await findJellyfinItemByTmdbId(
              String(id), mediaType, title, jellyfinApiKey, jellyfinBaseUrl
            );
            available = !!jellyfinItemId;
          } catch (err) {
            logger.error("[similar] Jellyfin availability check failed:", err.message);
          }
        }

        let seerrStatus = null;
        try {
          const sr = await seerrApi.checkMediaStatus(id, mediaType, [], getSeerrUrl(), getSeerrApiKey());
          seerrStatus = sr?.status ?? null;
        } catch (err) {
          logger.debug("[similar] Seerr status check failed for %s: %s", id, err.message);
        }

        return { id, title, year, rating, overview, available, jellyfinItemId, seerrStatus };
      })
    );

    const emoji = mediaType === "movie" ? "\uD83C\uDFAC" : "\uD83D\uDCFA";
    const embed = new EmbedBuilder()
      .setColor(process.env.EMBED_COLOR_SEARCH || "#f0a05a")
      .setAuthor({ name: t("similar_title") })
      .setTitle(`${emoji} ${t("similar_based_on").replace("{{title}}", sourceTitle)}`)
      .setTimestamp();

    if (sourceDetails.poster_path) {
      embed.setThumbnail(`https://image.tmdb.org/t/p/w500${sourceDetails.poster_path}`);
    }

    const footerText = process.env.EMBED_FOOTER_TEXT;
    if (footerText) embed.setFooter({ text: footerText });

    const lines = items.map((item, i) => {
      let status = "";
      if (item.seerrStatus === 5 || item.available) status = "\u2705";
      else if (item.seerrStatus === 4) status = "\uD83D\uDCE5";
      else if (item.seerrStatus === 2 || item.seerrStatus === 3) status = "\u23F3";
      const ratingStr = item.rating ? ` \u2B50 ${item.rating}` : "";
      const yearStr = item.year ? ` (${item.year})` : "";
      let line = `**${i + 1}. ${item.title}${yearStr}**${ratingStr} ${status}`;
      if (item.overview) line += `\n> ${item.overview}`;
      return line;
    });

    embed.setDescription(`${t("recommend_legend")}\n\n${lines.join("\n\n")}`);

    // Per-item buttons: Watch (if available) OR Request (if missing & not pending)
    const watchButtons = [];
    const requestButtons = [];
    const _show = parseButtonConfig("NOTIF_BUTTONS_RANDOM");
    for (const item of items) {
      if (item.available && item.jellyfinItemId && _show("watch")) {
        const watchUrl = buildJellyfinUrl(item.jellyfinItemId);
        if (watchUrl && isValidUrl(watchUrl)) {
          watchButtons.push(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel(`\u25B6 ${item.title.substring(0, 60)}`)
              .setURL(watchUrl)
          );
        }
      } else if (!item.available && (item.seerrStatus === null || item.seerrStatus === 1)) {
        // Not in library AND not yet requested \u2192 offer a Request button
        requestButtons.push(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`request_random_${item.id}_${mediaType}`)
            .setLabel(`\uD83D\uDCE5 ${item.title.substring(0, 60)}`)
        );
      }
    }

    const replyOpts = { embeds: [embed] };
    const rows = [];
    if (watchButtons.length > 0) {
      rows.push(new ActionRowBuilder().addComponents(watchButtons.slice(0, 5)));
    }
    if (requestButtons.length > 0) {
      rows.push(new ActionRowBuilder().addComponents(requestButtons.slice(0, 5)));
    }
    if (rows.length > 0) replyOpts.components = rows;

    return interaction.editReply(replyOpts);
  } catch (err) {
    logger.error("Similar command error:", err);
    return interaction.editReply({ content: t("similar_error") });
  }
}
