import { t } from "../../utils/botStrings.js";
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import * as tmdbApi from "../../api/tmdb.js";
import { findJellyfinItemByTmdbId } from "../../api/jellyfin.js";
import { buildJellyfinUrl, getTmdbApiKey, parseButtonConfig } from "../helpers.js";
import { isValidUrl } from "../../utils/url.js";
import logger from "../../utils/logger.js";

export async function handleCastCommand(interaction) {
  await interaction.deferReply({ flags: 64 });

  const apiKey = getTmdbApiKey();
  if (!apiKey) {
    return interaction.editReply({ content: t("command_config_missing") });
  }

  const raw = interaction.options.getString("name");
  if (!raw) {
    return interaction.editReply({ content: t("cast_name_required") });
  }

  try {
    // Parse from autocomplete (format: "personId") or search
    let personId;
    if (/^\d+$/.test(raw)) {
      personId = raw;
    } else {
      const results = await tmdbApi.tmdbSearchPerson(raw, apiKey);
      if (!results || results.length === 0) {
        return interaction.editReply({ content: t("cast_not_found") });
      }
      personId = results[0].id;
    }

    const person = await tmdbApi.tmdbGetPerson(personId, apiKey);
    if (!person) {
      return interaction.editReply({ content: t("cast_not_found") });
    }

    // Get combined credits (cast roles), sort by popularity
    const credits = person.combined_credits?.cast || [];
    const uniqueCredits = [];
    const seenIds = new Set();

    // Deduplicate and sort by popularity
    const sorted = [...credits]
      .filter(c => c.media_type === "movie" || c.media_type === "tv")
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

    for (const credit of sorted) {
      if (!seenIds.has(credit.id)) {
        seenIds.add(credit.id);
        uniqueCredits.push(credit);
      }
      if (uniqueCredits.length >= 15) break;
    }

    if (uniqueCredits.length === 0) {
      return interaction.editReply({ content: t("cast_no_credits") });
    }

    // Check Jellyfin availability
    const jellyfinApiKey = process.env.JELLYFIN_API_KEY;
    const jellyfinBaseUrl = process.env.JELLYFIN_BASE_URL;

    const items = await Promise.all(
      uniqueCredits.map(async (credit) => {
        const title = credit.title || credit.name || "Unknown";
        const year = (credit.release_date || credit.first_air_date || "").substring(0, 4);
        const rating = credit.vote_average ? credit.vote_average.toFixed(1) : null;
        const character = credit.character || null;
        const mediaType = credit.media_type;

        let available = false;
        let jellyfinItemId = null;
        if (jellyfinApiKey && jellyfinBaseUrl) {
          try {
            jellyfinItemId = await findJellyfinItemByTmdbId(
              String(credit.id), mediaType, title, jellyfinApiKey, jellyfinBaseUrl
            );
            available = !!jellyfinItemId;
          } catch (_) {}
        }

        return { id: credit.id, title, year, rating, character, mediaType, available, jellyfinItemId };
      })
    );

    const availableCount = items.filter(i => i.available).length;

    const embed = new EmbedBuilder()
      .setColor(process.env.EMBED_COLOR_SEARCH || "#f0a05a")
      .setAuthor({ name: t("cast_title") })
      .setTitle(`\uD83C\uDFAD ${person.name}`)
      .setTimestamp();

    if (person.profile_path) {
      embed.setThumbnail(`https://image.tmdb.org/t/p/w500${person.profile_path}`);
    }

    const footerText = process.env.EMBED_FOOTER_TEXT;
    const footerParts = [`${availableCount}/${items.length} ${t("collection_available")}`];
    if (footerText) footerParts.push(footerText);
    embed.setFooter({ text: footerParts.join(" \u00B7 ") });

    const lines = items.map((item, i) => {
      const emoji = item.mediaType === "movie" ? "\uD83C\uDFAC" : "\uD83D\uDCFA";
      const status = item.available ? "\u2705" : "\u274C";
      const ratingStr = item.rating ? ` \u2B50 ${item.rating}` : "";
      const yearPart = item.year ? ` (${item.year})` : "";
      const charPart = item.character ? ` \u2014 _${item.character}_` : "";
      return `**${i + 1}.** ${emoji} **${item.title}${yearPart}**${ratingStr}${charPart} ${status}`;
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
    logger.error("Cast command error:", err);
    return interaction.editReply({ content: t("cast_error") });
  }
}
