import { t } from "../../utils/botStrings.js";
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import * as tmdbApi from "../../api/tmdb.js";
import { findJellyfinItemByTmdbId } from "../../api/jellyfin.js";
import { buildJellyfinUrl, getTmdbApiKey, parseButtonConfig } from "../helpers.js";
import { isValidUrl } from "../../utils/url.js";
import logger from "../../utils/logger.js";

export async function handleCollectionCommand(interaction) {
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

        return { id: part.id, title, year, rating, available, jellyfinItemId };
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
      const status = item.available ? "\u2705" : "\u274C";
      const ratingStr = item.rating ? ` \u2B50 ${item.rating}` : "";
      const yearPart = item.year ? ` (${item.year})` : "";
      return `**${i + 1}. ${item.title}${yearPart}**${ratingStr} ${status}`;
    });

    embed.setDescription(
      `${t("recommend_legend")}\n\n${lines.join("\n")}`
    );

    // Watch buttons for available items
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
    logger.error("Collection command error:", err);
    return interaction.editReply({ content: t("collection_error") });
  }
}
