import { t } from "../../utils/botStrings.js";
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { fetchRequests } from "../../api/seerr.js";
import { getSeerrUrl, getSeerrApiKey } from "../helpers.js";
import logger from "../../utils/logger.js";
import axios from "axios";
import { getSeerrApiUrl } from "../../utils/seerrUrl.js";
import { TIMEOUTS } from "../../lib/constants.js";

const STATUS_MAP = {
  1: { emoji: "❓", label: "Unknown" },
  2: { emoji: "⏳", label: "Pending" },
  3: { emoji: "⬇️", label: "Processing" },
  4: { emoji: "🟡", label: "Partial" },
  5: { emoji: "✅", label: "Available" },
};

const PAGE_SIZE = 10;

/**
 * Resolve media title from Seerr by TMDB ID
 */
async function resolveTitle(tmdbId, mediaType, seerrUrl, apiKey) {
  try {
    const apiUrl = getSeerrApiUrl(seerrUrl);
    const endpoint = mediaType === "movie"
      ? `${apiUrl}/movie/${tmdbId}`
      : `${apiUrl}/tv/${tmdbId}`;
    const res = await axios.get(endpoint, {
      headers: { "X-Api-Key": apiKey },
      timeout: TIMEOUTS.SEERR_API,
    });
    return res.data?.title || res.data?.name || res.data?.originalTitle || res.data?.originalName || null;
  } catch {
    return null;
  }
}

/**
 * Resolve the current user's Seerr ID from Discord ID via user mappings
 */
function getSeerrUserIdFromDiscord(discordId) {
  try {
    const raw = process.env.USER_MAPPINGS;
    const mappings = typeof raw === "string" ? JSON.parse(raw) : (raw || []);
    if (Array.isArray(mappings)) {
      const match = mappings.find(m => String(m.discordUserId) === String(discordId));
      if (match) return String(match.seerrUserId);
    }
  } catch (_) {}
  return null;
}

/**
 * Build the watchlist embed for a given page
 * @param {string|null} currentSeerrUserId - The requesting user's Seerr ID (to censor other users' names)
 */
function buildWatchlistEmbed(requests, page, totalCount, currentSeerrUserId) {
  const start = page * PAGE_SIZE;
  const shown = requests.slice(start, start + PAGE_SIZE);
  const totalPages = Math.ceil(requests.length / PAGE_SIZE);

  const lines = shown.map((r, i) => {
    const title = r._resolvedTitle || "Unknown";
    const mediaType = r.type === "movie" ? "🎬" : "📺";
    const status = STATUS_MAP[r.media?.status] || STATUS_MAP[1];
    const isOwnRequest = currentSeerrUserId && String(r.requestedBy?.id) === currentSeerrUserId;
    const user = isOwnRequest
      ? (r.requestedBy?.displayName || r.requestedBy?.username || "?")
      : "A User";
    const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "";
    return `${start + i + 1}. ${mediaType} **${title}** — ${status.emoji} ${status.label}\n   ↳ ${user} · ${date}`;
  });

  const embed = new EmbedBuilder()
    .setColor("#1ec8a0")
    .setAuthor({ name: t("watchlist_title") })
    .setDescription(lines.join("\n\n"))
    .setTimestamp();

  const footerParts = [];
  footerParts.push(t("watchlist_showing").replace("{{shown}}", String(shown.length)).replace("{{total}}", String(totalCount)));
  if (totalPages > 1) footerParts.push(`${page + 1}/${totalPages}`);
  const customFooter = process.env.EMBED_FOOTER_TEXT;
  if (customFooter) footerParts.push(customFooter);
  embed.setFooter({ text: footerParts.join(" · ") });

  return embed;
}

/**
 * Build pagination buttons
 */
function buildPaginationRow(page, totalPages, filter) {
  const row = new ActionRowBuilder();
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`watchlist_prev|${page}|${filter}`)
      .setLabel("◀")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`watchlist_next|${page}|${filter}`)
      .setLabel("▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );
  return row;
}

export async function handleWatchlistCommand(interaction) {
  await interaction.deferReply({ flags: 64 });

  const seerrUrl = getSeerrUrl();
  const apiKey = getSeerrApiKey();

  if (!seerrUrl || !apiKey) {
    return interaction.editReply({ content: t("command_config_missing") });
  }

  const filter = interaction.options.getString("filter") || "all";

  try {
    const discordId = interaction.user.id;
    const currentSeerrUserId = getSeerrUserIdFromDiscord(discordId);

    const data = await fetchRequests(seerrUrl, apiKey, 50, filter === "mine" ? "all" : filter);
    let requests = data?.results || [];

    // If "mine" filter, show only own requests
    if (filter === "mine") {
      if (currentSeerrUserId) {
        requests = requests.filter(r => String(r.requestedBy?.id) === currentSeerrUserId);
      } else {
        return interaction.editReply({ content: t("watchlist_no_mapping") });
      }
    }

    if (requests.length === 0) {
      return interaction.editReply({ content: t("watchlist_empty") });
    }

    // Resolve titles for all requests in parallel
    const titlePromises = requests.map(r => {
      const tmdbId = r.media?.tmdbId;
      const mediaType = r.media?.mediaType || r.type;
      if (tmdbId && mediaType) {
        return resolveTitle(tmdbId, mediaType, seerrUrl, apiKey);
      }
      return Promise.resolve(null);
    });
    const titles = await Promise.all(titlePromises);
    requests.forEach((r, i) => { r._resolvedTitle = titles[i]; });

    const totalCount = data?.pageInfo?.results || requests.length;
    const totalPages = Math.ceil(requests.length / PAGE_SIZE);
    const embed = buildWatchlistEmbed(requests, 0, totalCount, currentSeerrUserId);

    const reply = { embeds: [embed] };
    if (totalPages > 1) {
      reply.components = [buildPaginationRow(0, totalPages, filter)];
    }

    return interaction.editReply(reply);
  } catch (err) {
    logger.error("Watchlist command error:", err);
    return interaction.editReply({ content: t("watchlist_error") });
  }
}

/**
 * Handle watchlist pagination button clicks
 */
export async function handleWatchlistPagination(interaction) {
  await interaction.deferUpdate();

  const [action, pageStr, filter] = interaction.customId.split("|");
  const currentPage = parseInt(pageStr, 10);
  const newPage = action === "watchlist_next" ? currentPage + 1 : currentPage - 1;

  const seerrUrl = getSeerrUrl();
  const apiKey = getSeerrApiKey();

  try {
    const discordId = interaction.user.id;
    const currentSeerrUserId = getSeerrUserIdFromDiscord(discordId);

    const data = await fetchRequests(seerrUrl, apiKey, 50, filter === "mine" ? "all" : filter);
    let requests = data?.results || [];

    if (filter === "mine" && currentSeerrUserId) {
      requests = requests.filter(r => String(r.requestedBy?.id) === currentSeerrUserId);
    }

    // Resolve titles
    const titlePromises = requests.map(r => {
      const tmdbId = r.media?.tmdbId;
      const mediaType = r.media?.mediaType || r.type;
      if (tmdbId && mediaType) return resolveTitle(tmdbId, mediaType, seerrUrl, apiKey);
      return Promise.resolve(null);
    });
    const titles = await Promise.all(titlePromises);
    requests.forEach((r, i) => { r._resolvedTitle = titles[i]; });

    const totalCount = data?.pageInfo?.results || requests.length;
    const totalPages = Math.ceil(requests.length / PAGE_SIZE);
    const embed = buildWatchlistEmbed(requests, newPage, totalCount, currentSeerrUserId);

    return interaction.editReply({
      embeds: [embed],
      components: totalPages > 1 ? [buildPaginationRow(newPage, totalPages, filter)] : [],
    });
  } catch (err) {
    logger.error("Watchlist pagination error:", err);
  }
}
