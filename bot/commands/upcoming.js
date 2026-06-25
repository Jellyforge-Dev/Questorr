import { t } from "../../utils/botStrings.js";
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { tmdbGetUpcoming } from "../../api/tmdb.js";
import * as seerrApi from "../../api/seerr.js";
import { getTmdbApiKey, getSeerrUrl, getSeerrApiKey } from "../helpers.js";
import { formatDate } from "../../utils/dateFormat.js";
import logger from "../../utils/logger.js";

const PAGE_SIZE = 10;

/**
 * Fetch upcoming items with Seerr status enriched. Cached per-type so
 * pagination doesn't re-hit TMDB each click.
 */
const _cache = new Map(); // key: type, value: { ts, items }
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getUpcomingItems(type) {
  const cached = _cache.get(type);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.items;

  const apiKey = getTmdbApiKey();
  const results = await tmdbGetUpcoming(apiKey, type);
  if (!results || results.length === 0) return [];

  const seerrUrl = getSeerrUrl();
  const seerrKey = getSeerrApiKey();
  const items = await Promise.all(
    results.map(async (r) => {
      let seerrStatus = null;
      try {
        const sr = await seerrApi.checkMediaStatus(r.id, r.media_type, [], seerrUrl, seerrKey);
        seerrStatus = sr?.status ?? null;
      } catch (err) {
        logger.debug("[upcoming] Seerr status check failed for %s: %s", r.id, err.message);
      }
      return { ...r, seerrStatus };
    })
  );
  _cache.set(type, { ts: Date.now(), items });
  return items;
}

function buildUpcomingEmbed(items, page, type) {
  const start = page * PAGE_SIZE;
  const shown = items.slice(start, start + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

  const lines = shown.map((r, i) => {
    const title = r.title || r.name || "Unknown";
    const date = r.release_date || r.first_air_date;
    const dateStr = date ? formatDate(date) : "TBA";
    const emoji = r.media_type === "movie" ? "🎬" : "📺";
    const rating = r.vote_average ? `⭐ ${r.vote_average.toFixed(1)}` : "";
    let statusIcon = "";
    if (r.seerrStatus === 5) statusIcon = " ✅";
    else if (r.seerrStatus === 4) statusIcon = " 📥";
    else if (r.seerrStatus === 2 || r.seerrStatus === 3) statusIcon = " ⏳";
    return `${start + i + 1}. ${emoji} **${title}** — ${dateStr}${rating ? ` · ${rating}` : ""}${statusIcon}`;
  });

  const embed = new EmbedBuilder()
    .setColor("#89b4fa")
    .setAuthor({ name: t("upcoming_title") })
    .setDescription(lines.join("\n"))
    .setTimestamp();

  const footerParts = [];
  footerParts.push(
    t("upcoming_page_of")
      .replace("{{current}}", String(page + 1))
      .replace("{{total}}", String(totalPages))
  );
  const customFooter = process.env.EMBED_FOOTER_TEXT;
  if (customFooter) footerParts.push(customFooter);
  embed.setFooter({ text: footerParts.join(" · ") });

  return embed;
}

function buildPaginationRow(page, totalPages, type) {
  const row = new ActionRowBuilder();
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`upcoming_prev|${page}|${type}`)
      .setLabel("◀")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`upcoming_next|${page}|${type}`)
      .setLabel("▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );
  return row;
}

/**
 * Build request-button rows for items on the current page that are not yet
 * available (status null or 1 = Unknown). Reuses existing
 * `request_random_*` handler. Up to 4 rows × 5 buttons = 20 max.
 */
function buildRequestRows(itemsOnPage) {
  const buttons = [];
  for (const r of itemsOnPage) {
    if (r.seerrStatus !== null && r.seerrStatus !== 1) continue;
    const title = r.title || r.name || "Unknown";
    buttons.push(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Primary)
        .setLabel(`+ ${title.substring(0, 60)}`)
        .setCustomId(`request_random_${r.id}_${r.media_type}`)
    );
    if (buttons.length >= 20) break;
  }
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }
  return rows;
}

function buildReply(items, page, type) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const shown = items.slice(start, start + PAGE_SIZE);

  const components = [];
  if (totalPages > 1) components.push(buildPaginationRow(page, totalPages, type));
  // Request buttons take up to 4 rows; pagination + 4 = 5 (Discord max)
  components.push(...buildRequestRows(shown));

  return { embeds: [buildUpcomingEmbed(items, page, type)], components };
}

export async function handleUpcomingCommand(interaction) {
  await interaction.deferReply({ flags: 64 });

  const apiKey = getTmdbApiKey();
  if (!apiKey) {
    return interaction.editReply({ content: t("command_config_missing") });
  }

  const type = interaction.options.getString("type") || "all";

  try {
    const items = await getUpcomingItems(type);
    if (items.length === 0) {
      return interaction.editReply({ content: t("upcoming_empty") });
    }
    return interaction.editReply(buildReply(items, 0, type));
  } catch (err) {
    logger.error("Upcoming command error:", err);
    return interaction.editReply({ content: t("upcoming_error") });
  }
}

/**
 * Handler for upcoming pagination button clicks.
 * Custom-ID format: upcoming_prev|{page}|{type} or upcoming_next|{page}|{type}
 */
export async function handleUpcomingPagination(interaction) {
  await interaction.deferUpdate();
  const [action, pageStr, type] = interaction.customId.split("|");
  const currentPage = parseInt(pageStr, 10);
  const newPage = action === "upcoming_next" ? currentPage + 1 : currentPage - 1;

  try {
    const items = await getUpcomingItems(type);
    if (items.length === 0) return;
    return interaction.editReply(buildReply(items, newPage, type));
  } catch (err) {
    logger.error("Upcoming pagination error:", err);
  }
}
