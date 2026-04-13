import { t } from "../../utils/botStrings.js";
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import * as tmdbApi from "../../api/tmdb.js";
import * as seerrApi from "../../api/seerr.js";
import { findJellyfinItemByTmdbId } from "../../api/jellyfin.js";
import { buildSeerrUrl, buildJellyfinUrl, getTmdbApiKey, parseButtonConfig } from "../helpers.js";
import { isValidUrl } from "../../utils/url.js";
import logger from "../../utils/logger.js";

export async function handleDiscoverCommand(interaction) {
  await interaction.deferReply({ flags: 64 });

  const apiKey = getTmdbApiKey();
  if (!apiKey) {
    return interaction.editReply({ content: t("command_config_missing") });
  }

  const mediaType = interaction.options.getString("type") || "movie";
  const genreId = interaction.options.getString("genre") || null;
  const year = interaction.options.getInteger("year") || null;
  const minRating = interaction.options.getNumber("rating") || null;

  try {
    const results = await tmdbApi.tmdbDiscover(apiKey, {
      mediaType,
      genreId,
      year,
      minRating,
      page: Math.floor(Math.random() * 3) + 1, // Randomize page for variety
    });

    if (!results || results.length === 0) {
      return interaction.editReply({ content: t("discover_empty") });
    }

    // Take top 10
    const top = results.slice(0, 10);
    const jellyfinApiKey = process.env.JELLYFIN_API_KEY;
    const jellyfinBaseUrl = process.env.JELLYFIN_BASE_URL;

    const items = await Promise.all(
      top.map(async (item) => {
        const id = item.id;
        const title = item.title || item.name || "Unknown";
        const yearStr = (item.release_date || item.first_air_date || "").substring(0, 4);
        const rating = item.vote_average ? item.vote_average.toFixed(1) : null;
        const overview = item.overview
          ? item.overview.length > 120
            ? item.overview.substring(0, 117) + "..."
            : item.overview
          : "";

        let available = false;
        let jellyfinItemId = null;
        if (jellyfinApiKey && jellyfinBaseUrl) {
          try {
            jellyfinItemId = await findJellyfinItemByTmdbId(
              String(id), mediaType, title, jellyfinApiKey, jellyfinBaseUrl
            );
            available = !!jellyfinItemId;
          } catch (err) {
            logger.error("[discover] Jellyfin availability check failed:", err.message);
          }
        }

        // Seerr request status
        let seerrStatus = null;
        try {
          const sr = await seerrApi.getSeerrStatus(id, mediaType);
          seerrStatus = sr?.status ?? null;
        } catch (_) {}

        return { id, title, yearStr, rating, overview, available, jellyfinItemId, seerrStatus };
      })
    );

    // Build genre name for title
    let genreName = "";
    if (genreId) {
      const genres = await tmdbApi.tmdbGetGenres(apiKey, mediaType);
      const genre = genres.find(g => String(g.id) === String(genreId));
      if (genre) genreName = genre.name;
    }

    const emoji = mediaType === "movie" ? "\uD83C\uDFAC" : "\uD83D\uDCFA";
    const filterParts = [];
    if (genreName) filterParts.push(genreName);
    if (year) filterParts.push(String(year));
    if (minRating) filterParts.push(`\u2B50 ${minRating}+`);
    const filterStr = filterParts.length > 0 ? filterParts.join(" \u00B7 ") : t("discover_all");

    const embed = new EmbedBuilder()
      .setColor(process.env.EMBED_COLOR_SEARCH || "#f0a05a")
      .setAuthor({ name: t("discover_title") })
      .setTitle(`${emoji} ${filterStr}`)
      .setTimestamp();

    const footerText = process.env.EMBED_FOOTER_TEXT;
    if (footerText) embed.setFooter({ text: footerText });

    const lines = items.map((item, i) => {
      let status = "";
      if (item.seerrStatus === 5 || item.available) status = "\u2705";
      else if (item.seerrStatus === 4) status = "\uD83D\uDCE5";
      else if (item.seerrStatus === 2 || item.seerrStatus === 3) status = "\u23F3";
      else status = "";
      const ratingStr = item.rating ? ` \u2B50 ${item.rating}` : "";
      const yearPart = item.yearStr ? ` (${item.yearStr})` : "";
      let line = `**${i + 1}. ${item.title}${yearPart}**${ratingStr} ${status}`;
      if (item.overview) line += `\n> ${item.overview}`;
      return line;
    });

    embed.setDescription(
      `${t("recommend_legend")}\n\n${lines.join("\n\n")}`
    );

    // Build watch buttons for available items
    const buttons = [];
    const _show = parseButtonConfig("NOTIF_BUTTONS_RANDOM");

    for (const item of items) {
      if (item.available && item.jellyfinItemId && _show("watch")) {
        const watchUrl = buildJellyfinUrl(item.jellyfinItemId);
        if (watchUrl && isValidUrl(watchUrl)) {
          const label = `\u25B6 ${item.title.substring(0, 70)}`;
          buttons.push(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel(label)
              .setURL(watchUrl)
          );
        }
      }
    }

    const replyOpts = { embeds: [embed] };
    if (buttons.length > 0) {
      replyOpts.components = [new ActionRowBuilder().addComponents(buttons.slice(0, 5))];
    }

    return interaction.editReply(replyOpts);
  } catch (err) {
    logger.error("Discover command error:", err);
    return interaction.editReply({ content: t("discover_error") });
  }
}
