import { t } from "../../utils/botStrings.js";
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { fetchRequests } from "../../api/seerr.js";
import { findJellyfinItemByTmdbId } from "../../api/jellyfin.js";
import { getSeerrUrl, getSeerrApiKey, buildJellyfinUrl } from "../helpers.js";
import { isValidUrl } from "../../utils/url.js";
import { formatDate } from "../../utils/dateFormat.js";
import logger from "../../utils/logger.js";
import axios from "axios";
import { getSeerrApiUrl } from "../../utils/seerrUrl.js";
import { TIMEOUTS } from "../../lib/constants.js";

/**
 * Translatable status map. Function instead of const so the labels reflect the
 * current bot language at call time (BOT_LANGUAGE may switch via dashboard).
 */
function getStatusMap() {
  return {
    1: { emoji: "❓", label: t("watchlist_status_unknown") },
    2: { emoji: "⏳", label: t("watchlist_status_pending") },
    3: { emoji: "⬇️", label: t("watchlist_status_processing") },
    4: { emoji: "🟡", label: t("watchlist_status_partial") },
    5: { emoji: "✅", label: t("watchlist_status_available") },
  };
}

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
  } catch (err) {
    logger.error("[watchlist] Failed to parse USER_MAPPINGS:", err.message);
  }
  return null;
}

/**
 * For all status===5 items on the current page, look up the Jellyfin item ID
 * and stash it on r._jellyfinItemId so the embed-builder can emit Watch links.
 * Mutates the requests array in place.
 */
async function enrichWatchableWithJellyfinIds(requestsOnPage) {
  const jfBase = process.env.JELLYFIN_BASE_URL;
  const jfKey = process.env.JELLYFIN_API_KEY;
  if (!jfBase || !jfKey) return;
  await Promise.all(requestsOnPage.map(async (r) => {
    if (r.media?.status !== 5) return;
    const tmdbId = r.media?.tmdbId;
    const mediaType = r.media?.mediaType || r.type;
    if (!tmdbId || !r._resolvedTitle) return;
    try {
      r._jellyfinItemId = await findJellyfinItemByTmdbId(tmdbId, mediaType, r._resolvedTitle, jfKey, jfBase);
    } catch {
      r._jellyfinItemId = null;
    }
  }));
}

/**
 * Build the watchlist embed for a given page
 */
function buildWatchlistEmbed(requests, page, totalCount, currentSeerrUserId) {
  const start = page * PAGE_SIZE;
  const shown = requests.slice(start, start + PAGE_SIZE);
  const totalPages = Math.ceil(requests.length / PAGE_SIZE);
  const statusMap = getStatusMap();

  const lines = shown.map((r, i) => {
    const title = r._resolvedTitle || "Unknown";
    const mediaType = r.type === "movie" ? "🎬" : "📺";
    const status = statusMap[r.media?.status] || statusMap[1];
    const isOwnRequest = currentSeerrUserId && String(r.requestedBy?.id) === currentSeerrUserId;
    const user = isOwnRequest
      ? (r.requestedBy?.displayName || r.requestedBy?.username || "?")
      : "A User";
    const date = r.createdAt ? formatDate(r.createdAt) : "";
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

/**
 * Build link-button rows for available items on the current page.
 * Returns up to 4 ActionRows (Discord limit: 5 total minus 1 for pagination).
 */
function buildWatchRows(requestsOnPage) {
  const buttons = [];
  for (const r of requestsOnPage) {
    if (r.media?.status !== 5) continue;
    if (!r._jellyfinItemId) continue;
    const url = buildJellyfinUrl(r._jellyfinItemId);
    if (!url || !isValidUrl(url)) continue;
    const title = r._resolvedTitle || "Unknown";
    buttons.push(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel(`▶ ${title.substring(0, 60)}`)
        .setURL(url)
    );
    if (buttons.length >= 20) break; // 4 rows × 5 buttons
  }
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
    rows.push(row);
  }
  return rows;
}

async function buildReply(requests, page, totalCount, currentSeerrUserId, filter) {
  const start = page * PAGE_SIZE;
  const shown = requests.slice(start, start + PAGE_SIZE);
  await enrichWatchableWithJellyfinIds(shown);

  const embed = buildWatchlistEmbed(requests, page, totalCount, currentSeerrUserId);
  const totalPages = Math.ceil(requests.length / PAGE_SIZE);

  const components = [];
  if (totalPages > 1) components.push(buildPaginationRow(page, totalPages, filter));
  components.push(...buildWatchRows(shown));

  return { embeds: [embed], components };
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
    const reply = await buildReply(requests, 0, totalCount, currentSeerrUserId, filter);
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

    const titlePromises = requests.map(r => {
      const tmdbId = r.media?.tmdbId;
      const mediaType = r.media?.mediaType || r.type;
      if (tmdbId && mediaType) return resolveTitle(tmdbId, mediaType, seerrUrl, apiKey);
      return Promise.resolve(null);
    });
    const titles = await Promise.all(titlePromises);
    requests.forEach((r, i) => { r._resolvedTitle = titles[i]; });

    const totalCount = data?.pageInfo?.results || requests.length;
    const reply = await buildReply(requests, newPage, totalCount, currentSeerrUserId, filter);
    return interaction.editReply(reply);
  } catch (err) {
    logger.error("Watchlist pagination error:", err);
  }
}
