/**
 * /foryou — personalized recommendations.
 *
 * Strategy:
 *   1. Resolve Discord user → Jellyfin user ID via USER_MAPPINGS → Seerr → jellyfinUserId.
 *   2. Fetch user's recently played items (top 5 movies + series).
 *      - If no mapping or no history: fall back to server-wide top-played items.
 *   3. For each, query TMDB recommendations endpoint in parallel.
 *   4. Aggregate, dedupe, sort by frequency × score.
 *   5. Check Jellyfin/Seerr availability for the top 5.
 *   6. Render embed with availability indicators + Request buttons for missing items.
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

    // Parse USER_MAPPINGS (stored as array in config)
    let userMappings = [];
    try {
      const raw = process.env.USER_MAPPINGS;
      userMappings = typeof raw === "string" ? JSON.parse(raw) : (raw || []);
    } catch { userMappings = []; }

    // Step 1: resolve Discord → Jellyfin user
    const jellyfinUserId = (seerrUrl && seerrApiKey)
      ? await resolveJellyfinUserId(discordId, userMappings, seerrUrl, seerrApiKey)
      : null;

    // Step 2: fetch watch history
    let seedItems = [];
    let usedFallback = false;

    const pickSeeds = (items) => items
      .map((item) => {
        const tmdbId = item.ProviderIds?.Tmdb || item.ProviderIds?.tmdb
          || item.ProviderIds?.TheMovieDb || item.ProviderIds?.themoviedb;
        const type = TYPE_FROM_JF[item.Type] || "movie";
        return tmdbId ? { tmdbId: String(tmdbId), type, title: item.Name } : null;
      })
      .filter(Boolean)
      .slice(0, 3);

    if (jellyfinUserId) {
      logger.info(`[foryou] Resolved Discord ${discordId} → Jellyfin ${jellyfinUserId}`);
      seedItems = await fetchUserRecentlyPlayed(jellyfinUserId, jfKey, jfBase, 10);
      logger.info(`[foryou] fetchUserRecentlyPlayed returned ${seedItems.length} items`);
    }

    let seeds = pickSeeds(seedItems);

    if (seeds.length === 0) {
      usedFallback = true;
      logger.info(`[foryou] No usable personal history for ${discordId} — trying server-wide top-played`);
      const topPlayed = await fetchServerTopPlayed(jfKey, jfBase, 20);
      logger.info(`[foryou] fetchServerTopPlayed returned ${topPlayed.length} items, tmdbIds: ${topPlayed.filter(i => i.ProviderIds?.Tmdb || i.ProviderIds?.TheMovieDb).length} with TMDB ID`);
      seeds = pickSeeds(topPlayed);
    }

    if (seeds.length === 0) {
      logger.warn(`[foryou] All fallbacks exhausted for ${discordId} — no TMDB-mapped items in Jellyfin library`);
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

    const subtitleKey = usedFallback ? "foryou_based_on_server" : "foryou_based_on";
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
    if (usedFallback && !jellyfinUserId) {
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
