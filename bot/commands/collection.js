import { t } from "../../utils/botStrings.js";
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import * as tmdbApi from "../../api/tmdb.js";
import * as seerrApi from "../../api/seerr.js";
import { findJellyfinItemByTmdbId } from "../../api/jellyfin.js";
import { buildJellyfinUrl, getTmdbApiKey, getSeerrUrl, getSeerrApiKey, parseButtonConfig } from "../helpers.js";
import { isValidUrl } from "../../utils/url.js";
import logger from "../../utils/logger.js";

export async function handleCollectionCommand(interaction) {
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
    // Parse from autocomplete (format: "tmdbId|mediaType") or search
    let tmdbId, mediaType;
    if (raw.includes("|")) {
      const parts = raw.split("|");
      tmdbId = parts[0];
      mediaType = parts[1] || "movie";
    } else {
      const results = await tmdbApi.tmdbSearch(raw, apiKey);
      if (!results || results.length === 0) {
        return interaction.editReply({ content: t("collection_not_found") });
      }
      const best = results.find(r => r.media_type === "movie") || results[0];
      tmdbId = best.id;
      mediaType = best.media_type || "movie";
    }

    // Only movies have collections
    if (mediaType !== "movie") {
      return interaction.editReply({ content: t("collection_movies_only") });
    }

    // Get movie details to find collection ID
    const details = await tmdbApi.tmdbGetDetails(tmdbId, "movie", apiKey);
    if (!details || !details.belongs_to_collection) {
      return interaction.editReply({ content: t("collection_none") });
    }

    const collectionId = details.belongs_to_collection.id;
    const collection = await tmdbApi.tmdbGetCollection(collectionId, apiKey);
    if (!collection || !collection.parts || collection.parts.length === 0) {
      return interaction.editReply({ content: t("collection_none") });
    }

    // Sort by release date
    const parts = collection.parts.sort((a, b) => {
      const dateA = a.release_date || "";
      const dateB = b.release_date || "";
      return dateA.localeCompare(dateB);
    });

    // Check Jellyfin availability for each part
    const jellyfinApiKey = process.env.JELLYFIN_API_KEY;
    const jellyfinBaseUrl = process.env.JELLYFIN_BASE_URL;

    const items = await Promise.all(
      parts.map(async (part) => {
        const title = part.title || "Unknown";
        const year = (part.release_date || "").substring(0, 4);
        const rating = part.vote_average ? part.vote_average.toFixed(1) : null;

        let available = false;
        let jellyfinItemId = null;
        if (jellyfinApiKey && jellyfinBaseUrl) {
          try {
            jellyfinItemId = await findJellyfinItemByTmdbId(
              String(part.id), "movie", title, jellyfinApiKey, jellyfinBaseUrl
            );
            available = !!jellyfinItemId;
          } catch (err) {
            logger.error("[collection] Jellyfin availability check failed:", err.message);
          }
        }

        // Seerr request status — used to suppress request-button on already-requested items
        let seerrStatus = null;
        try {
          const sr = await seerrApi.checkMediaStatus(part.id, "movie", [], getSeerrUrl(), getSeerrApiKey());
          seerrStatus = sr?.status ?? null;
        } catch (err) {
          logger.debug("[collection] Seerr status check failed for %s: %s", part.id, err.message);
        }

        return { id: part.id, title, year, rating, available, jellyfinItemId, seerrStatus };
      })
    );

    const availableCount = items.filter(i => i.available).length;

    const embed = new EmbedBuilder()
      .setColor(process.env.EMBED_COLOR_SEARCH || "#f0a05a")
      .setAuthor({ name: t("collection_title") })
      .setTitle(`\uD83C\uDFAC ${collection.name}`)
      .setTimestamp();

    if (collection.poster_path) {
      embed.setThumbnail(`https://image.tmdb.org/t/p/w500${collection.poster_path}`);
    }

    const footerText = process.env.EMBED_FOOTER_TEXT;
    const footerParts = [`${availableCount}/${items.length} ${t("collection_available")}`];
    if (footerText) footerParts.push(footerText);
    embed.setFooter({ text: footerParts.join(" \u00B7 ") });

    const lines = items.map((item, i) => {
      let status;
      if (item.available) status = "\u2705";
      else if (item.seerrStatus === 2 || item.seerrStatus === 3) status = "\u23F3"; // pending / processing
      else if (item.seerrStatus === 4) status = "\uD83D\uDCE5"; // partial
      else status = "\u274C";
      const ratingStr = item.rating ? ` \u2B50 ${item.rating}` : "";
      const yearPart = item.year ? ` (${item.year})` : "";
      return `**${i + 1}. ${item.title}${yearPart}**${ratingStr} ${status}`;
    });

    embed.setDescription(
      `${t("recommend_legend")}\n\n${lines.join("\n")}`
    );

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
        requestButtons.push(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`request_random_${item.id}_movie`)
            .setLabel(`\uD83D\uDCE5 ${item.title.substring(0, 60)}`)
        );
      }
    }

    // Discord limit: 5 ActionRows \u00D7 5 buttons each. We use 2 rows max to keep it tidy.
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
    logger.error("Collection command error:", err);
    return interaction.editReply({ content: t("collection_error") });
  }
}
