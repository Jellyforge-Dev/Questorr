/**
 * /foryou — personalized recommendations.
 *
 * Seed priority:
 *   1. Seerr request history for the mapped user (Discord → USER_MAPPINGS → Seerr ID).
 *      Requires only a Seerr mapping — no Jellyfin user ID needed.
 *   2. Jellyfin watch history (requires USER_MAPPINGS → Seerr → jellyfinUserId chain).
 *   3. Server-wide recently-added Jellyfin items (no mapping required).
 *
 * For each seed TMDB /recommendations is called in parallel. Results are aggregated by
 * frequency × vote_average, deduplicated, checked for Jellyfin/Seerr availability and
 * presented as an ephemeral embed with Watch/Request buttons.
 */

import { t } from "../../utils/botStrings.js";
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import * as tmdbApi from "../../api/tmdb.js";
import * as seerrApi from "../../api/seerr.js";
import {
  fetchUserRecentlyPlayed,
  fetchServerTopPlayed,
  resolveJellyfinUserId,
  findJellyfinItemByTmdbId,
} from "../../api/jellyfin.js";
import { buildJellyfinUrl, getTmdbApiKey, getSeerrUrl, getSeerrApiKey } from "../helpers.js";
import { isValidUrl } from "../../utils/url.js";
import logger from "../../utils/logger.js";

const TYPE_FROM_JF = { Movie: "movie", Series: "tv" };

/** Extract Seerr user ID from USER_MAPPINGS for a given Discord ID. */
function getSeerrUserId(discordId) {
  try {
    const raw = process.env.USER_MAPPINGS;
    let mappings = typeof raw === "string" ? JSON.parse(raw) : (raw || []);
    if (Array.isArray(mappings)) {
      const entry = mappings.find(
        (m) => String(m.discordId || m.discord_id) === String(discordId)
      );
      return entry?.seerrId || entry?.seerr_id || entry?.userId || null;
    }
    if (mappings && typeof mappings === "object") {
      return mappings[discordId] || mappings[String(discordId)] || null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function handleForYouCommand(interaction) {
  await interaction.deferReply({ flags: 64 });

  const tmdbKey = getTmdbApiKey();
  const jfKey = process.env.JELLYFIN_API_KEY;
  const jfBase = process.env.JELLYFIN_BASE_URL;

  if (!tmdbKey || !jfKey || !jfBase) {
    return interaction.editReply({ content: t("command_config_missing") });
  }

  try {
    const discordId = interaction.user.id;
    const seerrUrl = getSeerrUrl();
    const seerrApiKey = getSeerrApiKey();

    // ── Step 1: resolve user identity ─────────────────────────────────────
    const seerrUserId = getSeerrUserId(discordId);

    // Try to resolve Jellyfin user ID too (for watch history, if Seerr has it)
    let userMappings = [];
    try {
      const raw = process.env.USER_MAPPINGS;
      userMappings = typeof raw === "string" ? JSON.parse(raw) : (raw || []);
    } catch { userMappings = []; }

    const jellyfinUserId = (seerrUrl && seerrApiKey)
      ? await resolveJellyfinUserId(discordId, userMappings, seerrUrl, seerrApiKey)
      : null;

    logger.info(`[foryou] Discord ${discordId} → seerrUserId=${seerrUserId ?? "none"} jellyfinUserId=${jellyfinUserId ?? "none"}`);

    // ── Step 2: collect seeds ──────────────────────────────────────────────
    // Priority: Seerr requests → Jellyfin history → recently-added fallback
    let seeds = [];
    let usedFallback = false;

    const pickSeedsFromJF = (items) => items
      .map((item) => {
        const tmdbId = item.ProviderIds?.Tmdb || item.ProviderIds?.tmdb
          || item.ProviderIds?.TheMovieDb || item.ProviderIds?.themoviedb;
        const type = TYPE_FROM_JF[item.Type] || "movie";
        return tmdbId ? { tmdbId: String(tmdbId), type, title: item.Name } : null;
      })
      .filter(Boolean)
      .slice(0, 5);

    // 2a. Seerr request history — works with any Seerr mapping, no Jellyfin ID needed
    if (seerrUserId && seerrUrl && seerrApiKey) {
      const seerrRequests = await seerrApi.fetchSeerrUserRequests(seerrUserId, seerrUrl, seerrApiKey, 20);
      logger.info(`[foryou] Seerr requests for user ${seerrUserId}: ${seerrRequests.length} items`);
      // Shuffle so we don't always pick the 3 most-recent; pick up to 5 random seeds
      const shuffled = seerrRequests.sort(() => Math.random() - 0.5);
      seeds = shuffled.slice(0, 5);
    }

    // 2b. Jellyfin watch history (if jellyfinUserId resolved)
    if (seeds.length === 0 && jellyfinUserId) {
      const jfItems = await fetchUserRecentlyPlayed(jellyfinUserId, jfKey, jfBase, 10);
      logger.info(`[foryou] Jellyfin history for ${jellyfinUserId}: ${jfItems.length} items`);
      seeds = pickSeedsFromJF(jfItems);
    }

    // 2c. Recently-added fallback (no user mapping at all)
    if (seeds.length === 0) {
      usedFallback = true;
      logger.info(`[foryou] No user seeds — falling back to recently-added library items`);
      const recent = await fetchServerTopPlayed(jfKey, jfBase, 20);
      logger.info(`[foryou] Recently-added: ${recent.length} items`);
      seeds = pickSeedsFromJF(recent);
    }

    if (seeds.length === 0) {
      logger.warn(`[foryou] All sources exhausted for ${discordId}`);
      return interaction.editReply({ content: t("foryou_no_recommendations") });
    }

    logger.info(`[foryou] Using ${seeds.length} seed(s): ${seeds.map(s => `${s.title}(${s.tmdbId})`).join(", ")}`);

    // Step 3: fetch recommendations in parallel
    // tmdbGetSimilar internally calls TMDB's /recommendations endpoint
    const recArrays = await Promise.all(
      seeds.map((s) => tmdbApi.tmdbGetSimilar(s.tmdbId, s.type, tmdbKey).catch(() => []))
    );
    logger.info(`[foryou] TMDB rec counts per seed: [${recArrays.map(a => a.length).join(", ")}]`);

    // Step 4: aggregate by id, scoring by frequency (number of seeds suggesting it) × vote_average
    const aggregated = new Map(); // tmdbId → { item, score, type }
    for (let i = 0; i < recArrays.length; i++) {
      const sourceType = seeds[i].type;
      for (const rec of recArrays[i]) {
        const id = String(rec.id);
        const score = (rec.vote_average || 0) + 5; // base score so frequency multiplier matters
        if (aggregated.has(id)) {
          const entry = aggregated.get(id);
          entry.score += score;
        } else {
          aggregated.set(id, { item: rec, score, type: sourceType });
        }
      }
    }

    // Filter out the seed items themselves
    for (const s of seeds) aggregated.delete(s.tmdbId);

    if (aggregated.size === 0) {
      return interaction.editReply({ content: t("foryou_no_recommendations") });
    }

    // Step 5: take top 5 by score
    const top = [...aggregated.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // Step 6: check Jellyfin + Seerr availability in parallel
    const enriched = await Promise.all(top.map(async ({ item, type }) => {
      const id = String(item.id);
      const title = item.title || item.name || "Unknown";
      const year = (item.release_date || item.first_air_date || "").substring(0, 4);
      const rating = item.vote_average ? item.vote_average.toFixed(1) : null;

      let jellyfinItemId = null;
      try {
        jellyfinItemId = await findJellyfinItemByTmdbId(id, type, title, jfKey, jfBase);
      } catch { /* ignore */ }

      let seerrStatus = null;
      try {
        const sr = await seerrApi.checkMediaStatus(id, type, [], seerrUrl, seerrApiKey);
        seerrStatus = sr?.status ?? null;
      } catch { /* ignore */ }

      return { id, type, title, year, rating, jellyfinItemId, seerrStatus, available: !!jellyfinItemId };
    }));

    // Build embed
    const embed = new EmbedBuilder()
      .setColor("#a6e3a1")
      .setAuthor({ name: t("foryou_title") })
      .setTimestamp();

    // Determine subtitle based on which seed source was actually used
    let subtitleKey;
    if (usedFallback) {
      subtitleKey = "foryou_based_on_server";
    } else if (seerrUserId) {
      subtitleKey = "foryou_based_on_requests"; // primary: Seerr request history
    } else {
      subtitleKey = "foryou_based_on"; // secondary: Jellyfin watch history
    }
    const seedTitles = seeds.map((s) => `*${s.title}*`).join(", ");

    const lines = enriched.map((rec, i) => {
      let icon = "⚪";
      if (rec.seerrStatus === 5 || rec.available) icon = "✅";
      else if (rec.seerrStatus === 4 || rec.seerrStatus === 3) icon = "⏳";
      else if (rec.seerrStatus === 2) icon = "⏳";

      const ratingStr = rec.rating ? ` ⭐ ${rec.rating}` : "";
      const yearStr = rec.year ? ` (${rec.year})` : "";
      return `${i + 1}. ${icon} **${rec.title}${yearStr}**${ratingStr}`;
    });

    let description = `${t(subtitleKey)}\n*${seedTitles}*\n\n${lines.join("\n")}\n\n${t("foryou_legend")}`;
    // Only show the "not linked" warning when there's truly no mapping at all
    if (!seerrUserId && !jellyfinUserId) {
      description = `${t("foryou_no_jellyfin_user")}\n\n${description}`;
    }
    embed.setDescription(description);

    // Buttons: Watch for available, Request for missing
    const components = [];
    for (const rec of enriched.slice(0, 5)) {
      if (rec.available && rec.jellyfinItemId) {
        const watchUrl = buildJellyfinUrl(rec.jellyfinItemId);
        if (watchUrl && isValidUrl(watchUrl)) {
          components.push(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel(`▶ ${rec.title.substring(0, 60)}`)
              .setURL(watchUrl)
          );
        }
      } else if (rec.seerrStatus === null || rec.seerrStatus === 1) {
        components.push(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Primary)
            .setLabel(`+ ${rec.title.substring(0, 60)}`)
            .setCustomId(`request_random_${rec.id}_${rec.type}`)
        );
      }
    }

    const replyOpts = { embeds: [embed] };
    if (components.length > 0) {
      replyOpts.components = [new ActionRowBuilder().addComponents(components.slice(0, 5))];
    }

    return interaction.editReply(replyOpts);
  } catch (err) {
    logger.error("[foryou] command error:", err);
    return interaction.editReply({ content: t("foryou_error") });
  }
}
