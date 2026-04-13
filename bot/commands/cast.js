import { t } from "../../utils/botStrings.js";
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import * as tmdbApi from "../../api/tmdb.js";
import { findJellyfinItemByTmdbId } from "../../api/jellyfin.js";
import { buildJellyfinUrl, getTmdbApiKey, parseButtonConfig } from "../helpers.js";
import { isValidUrl } from "../../utils/url.js";
import logger from "../../utils/logger.js";

const PAGE_SIZE = 10;

/**
 * Fetch all unique credits for a person, sorted by popularity
 */
async function fetchPersonCredits(personId, apiKey) {
  const person = await tmdbApi.tmdbGetPerson(personId, apiKey);
  if (!person) return null;

  const credits = person.combined_credits?.cast || [];
  const uniqueCredits = [];
  const seenIds = new Set();

  const sorted = [...credits]
    .filter(c => c.media_type === "movie" || c.media_type === "tv")
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

  for (const credit of sorted) {
    if (!seenIds.has(credit.id)) {
      seenIds.add(credit.id);
      uniqueCredits.push(credit);
    }
  }

  return { person, credits: uniqueCredits };
}

/**
 * Enrich credits with Jellyfin availability
 */
async function enrichWithJellyfin(credits) {
  const jellyfinApiKey = process.env.JELLYFIN_API_KEY;
  const jellyfinBaseUrl = process.env.JELLYFIN_BASE_URL;

  return Promise.all(
    credits.map(async (credit) => {
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
}

/**
 * Build the cast embed for a given page
 */
function buildCastEmbed(person, items, page) {
  const start = page * PAGE_SIZE;
  const shown = items.slice(start, start + PAGE_SIZE);
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const availableCount = items.filter(i => i.available).length;

  const embed = new EmbedBuilder()
    .setColor(process.env.EMBED_COLOR_SEARCH || "#f0a05a")
    .setAuthor({ name: t("cast_title") })
    .setTitle(`\uD83C\uDFAD ${person.name}`)
    .setTimestamp();

  if (person.profile_path) {
    embed.setThumbnail(`https://image.tmdb.org/t/p/w500${person.profile_path}`);
  }

  const lines = shown.map((item, i) => {
    const emoji = item.mediaType === "movie" ? "\uD83C\uDFAC" : "\uD83D\uDCFA";
    const status = item.available ? "\u2705" : "\u274C";
    const ratingStr = item.rating ? ` \u2B50 ${item.rating}` : "";
    const yearPart = item.year ? ` (${item.year})` : "";
    const charPart = item.character ? ` \u2014 _${item.character}_` : "";
    return `**${start + i + 1}.** ${emoji} **${item.title}${yearPart}**${ratingStr}${charPart} ${status}`;
  });

  embed.setDescription(
    `${t("recommend_legend")}\n\n${lines.join("\n")}`
  );

  const footerParts = [`${availableCount}/${items.length} ${t("collection_available")}`];
  if (totalPages > 1) footerParts.push(`${page + 1}/${totalPages}`);
  const customFooter = process.env.EMBED_FOOTER_TEXT;
  if (customFooter) footerParts.push(customFooter);
  embed.setFooter({ text: footerParts.join(" \u00B7 ") });

  return embed;
}

/**
 * Build pagination + watch buttons for a cast page
 */
function buildCastComponents(items, page, personId) {
  const start = page * PAGE_SIZE;
  const shown = items.slice(start, start + PAGE_SIZE);
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const rows = [];

  // Watch buttons for available items on current page
  const watchButtons = [];
  const _show = parseButtonConfig("NOTIF_BUTTONS_RANDOM");

  for (const item of shown) {
    if (item.available && item.jellyfinItemId && _show("watch")) {
      const watchUrl = buildJellyfinUrl(item.jellyfinItemId);
      if (watchUrl && isValidUrl(watchUrl)) {
        const label = `\u25B6 ${item.title.substring(0, 70)}`;
        watchButtons.push(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel(label)
            .setURL(watchUrl)
        );
      }
    }
  }

  if (watchButtons.length > 0) {
    rows.push(new ActionRowBuilder().addComponents(watchButtons.slice(0, 5)));
  }

  // Pagination buttons
  if (totalPages > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`cast_prev|${page}|${personId}`)
        .setLabel("\u25C0")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`cast_next|${page}|${personId}`)
        .setLabel("\u25B6")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1)
    ));
  }

  return rows;
}

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

    const data = await fetchPersonCredits(personId, apiKey);
    if (!data || data.credits.length === 0) {
      return interaction.editReply({ content: t("cast_no_credits") });
    }

    const items = await enrichWithJellyfin(data.credits);
    const embed = buildCastEmbed(data.person, items, 0);
    const components = buildCastComponents(items, 0, personId);

    return interaction.editReply({ embeds: [embed], components });
  } catch (err) {
    logger.error("Cast command error:", err);
    return interaction.editReply({ content: t("cast_error") });
  }
}

/**
 * Handle cast pagination button clicks
 */
export async function handleCastPagination(interaction) {
  await interaction.deferUpdate();

  const [action, pageStr, personId] = interaction.customId.split("|");
  const currentPage = parseInt(pageStr, 10);
  const newPage = action === "cast_next" ? currentPage + 1 : currentPage - 1;

  const apiKey = getTmdbApiKey();

  try {
    const data = await fetchPersonCredits(personId, apiKey);
    if (!data || data.credits.length === 0) return;

    const items = await enrichWithJellyfin(data.credits);
    const embed = buildCastEmbed(data.person, items, newPage);
    const components = buildCastComponents(items, newPage, personId);

    return interaction.editReply({ embeds: [embed], components });
  } catch (err) {
    logger.error("Cast pagination error:", err);
  }
}
