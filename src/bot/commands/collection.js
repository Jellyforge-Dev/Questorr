import { t } from "../../utils/botStrings.js";
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import * as tmdbApi from "../../api/tmdb.js";
import * as seerrApi from "../../api/seerr.js";
import { findJellyfinItemByTmdbId } from "../../api/jellyfin.js";
import { buildJellyfinUrl, getTmdbApiKey, getSeerrUrl, getSeerrApiKey, parseButtonConfig } from "../helpers.js";
import { isValidUrl } from "../../utils/url.js";
import { setEmbedThumbnail } from "../../utils/embedImages.js";
import logger from "../../utils/logger.js";

/**
 * Build the reply payload (embed + components) for a movie's TMDB collection.
 * Returns either:
 *   - { embeds, components? }  — render the collection
 *   - { content }              — error/edge case (not found / no collection / movies-only)
 *
 * Shared between the /collection slash command and the "Sammlung anzeigen"
 * button on Seerr-webhook embeds. Either tmdbId+mediaType OR a freeform query
 * may be passed; the function resolves a TMDB ID itself when needed.
 */
export async function buildCollectionReply({ tmdbId, mediaType, query } = {}) {
  const apiKey = getTmdbApiKey();
  if (!apiKey) return { content: t("command_config_missing") };

  try {
    let resolvedTmdbId = tmdbId;
    let resolvedMediaType = mediaType || "movie";
    if (!resolvedTmdbId) {
      if (!query) return { content: t("title_invalid") };
      if (query.includes("|")) {
        const parts = query.split("|");
        resolvedTmdbId = parts[0];
        resolvedMediaType = parts[1] || "movie";
      } else {
        const results = await tmdbApi.tmdbSearch(query, apiKey);
        if (!results || results.length === 0) {
          return { content: t("collection_not_found") };
        }
        const best = results.find(r => r.media_type === "movie") || results[0];
        resolvedTmdbId = best.id;
        resolvedMediaType = best.media_type || "movie";
      }
    }

    if (resolvedMediaType !== "movie") {
      return { content: t("collection_movies_only") };
    }

    const details = await tmdbApi.tmdbGetDetails(resolvedTmdbId, "movie", apiKey);
    if (!details || !details.belongs_to_collection) {
      return { content: t("collection_none") };
    }

    const collectionId = details.belongs_to_collection.id;
    const collection = await tmdbApi.tmdbGetCollection(collectionId, apiKey);
    if (!collection || !collection.parts || collection.parts.length === 0) {
      return { content: t("collection_none") };
    }

    const parts = collection.parts.sort((a, b) => {
      const dateA = a.release_date || "";
      const dateB = b.release_date || "";
      return dateA.localeCompare(dateB);
    });

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

        let seerrStatus = null;
        try {
          const sr = await seerrApi.checkMediaStatus(part.id, "movie", [], getSeerrUrl(), getSeerrApiKey());
          seerrStatus = sr?.status ?? null;
        } catch (err) {
          logger.debug("[collection] Seerr status check failed for %s: %s", part.id, err.message);
        }

        // seerrStatus=5 means AVAILABLE in Seerr — treat it as available even when
        // findJellyfinItemByTmdbId couldn't resolve the item (TMDB-ID lookup quirk).
        const seerrConfirmedAvailable = seerrStatus === 5;
        return { id: part.id, title, year, rating, available: !!jellyfinItemId || seerrConfirmedAvailable, jellyfinItemId, seerrStatus };
      })
    );

    const availableCount = items.filter(i => i.available).length;

    const embed = new EmbedBuilder()
      .setColor(process.env.EMBED_COLOR_SEARCH || "#f0a05a")
      .setAuthor({ name: t("collection_title") })
      .setTitle(`🎬 ${collection.name}`)
      .setTimestamp();

    if (collection.poster_path) {
      setEmbedThumbnail(embed, `https://image.tmdb.org/t/p/w500${collection.poster_path}`);
    }

    const footerText = process.env.EMBED_FOOTER_TEXT;
    const footerParts = [`${availableCount}/${items.length} ${t("collection_available")}`];
    if (footerText) footerParts.push(footerText);
    embed.setFooter({ text: footerParts.join(" · ") });

    const lines = items.map((item, i) => {
      let status;
      if (item.available) status = "✅";
      else if (item.seerrStatus === 2 || item.seerrStatus === 3) status = "⏳";
      else if (item.seerrStatus === 4) status = "📥";
      else status = "❌";
      const ratingStr = item.rating ? ` ⭐ ${item.rating}` : "";
      const yearPart = item.year ? ` (${item.year})` : "";
      return `**${i + 1}. ${item.title}${yearPart}**${ratingStr} ${status}`;
    });

    embed.setDescription(
      `${t("recommend_legend")}\n\n${lines.join("\n")}`
    );

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
              .setLabel(`▶ ${item.title.substring(0, 60)}`)
              .setURL(watchUrl)
          );
        }
      } else if (!item.available && (item.seerrStatus === null || item.seerrStatus === 1)) {
        requestButtons.push(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`request_random_${item.id}_movie`)
            .setLabel(`📥 ${item.title.substring(0, 60)}`)
        );
      }
    }

    const reply = { embeds: [embed] };
    const rows = [];
    if (watchButtons.length > 0) {
      rows.push(new ActionRowBuilder().addComponents(watchButtons.slice(0, 5)));
    }
    if (requestButtons.length > 0) {
      rows.push(new ActionRowBuilder().addComponents(requestButtons.slice(0, 5)));
    }
    if (rows.length > 0) reply.components = rows;
    return reply;
  } catch (err) {
    logger.error("Collection build error:", err);
    return { content: t("collection_error") };
  }
}

export async function handleCollectionCommand(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: 64 });
  }
  const raw = interaction.options.getString("title");
  const reply = await buildCollectionReply({ query: raw });
  return interaction.editReply(reply);
}
