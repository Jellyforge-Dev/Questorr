/**
 * /foryou — personalized recommendations from your Jellyfin watch history.
 *
 * Approach:
 *   1. Read the user's recently played Jellyfin items (Movies + Series).
 *   2. For each item with a TMDB ID, fetch TMDB /recommendations.
 *   3. Aggregate by frequency × rating — a title surfaced by multiple seeds
 *      with high TMDB score wins. This is what makes the result actually
 *      personalised: different watch histories yield different aggregations.
 *   4. Filter out items already in the user's history.
 *   5. Check Jellyfin availability + Seerr request status for each survivor.
 *   6. Show top 5 with Watch buttons (in library) or Request buttons (missing).
 *
 * User identity chain:
 *   Discord ID → USER_MAPPINGS → Seerr user ID → Seerr API → Jellyfin user ID
 *
 * Why not Jellyfin's native /Movies/Recommendations: tested with two users
 * having totally different watch histories — both got the same 5 titles
 * (just different "BaselineItemName"). The engine sorts alphabetically
 * within sparse categories and isn't actually using similarity in practice.
 *
 * Why not Streamystats: its recommendations endpoint requires Jellyfin user
 * session credentials that Streamystats then forwards to Jellyfin; in our
 * setup Jellyfin returns HTTP 400 to Streamystats' auth call regardless of
 * verified-correct credentials. Outside our control.
 */

import { t } from "../../utils/botStrings.js";
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import * as tmdbApi from "../../api/tmdb.js";
import * as seerrApi from "../../api/seerr.js";
import {
  fetchUserRecentlyPlayed,
  resolveJellyfinUserId,
  findJellyfinItemByTmdbId,
} from "../../api/jellyfin.js";
import { buildJellyfinUrl, getTmdbApiKey, getSeerrUrl, getSeerrApiKey } from "../helpers.js";
import { isValidUrl } from "../../utils/url.js";
import logger from "../../utils/logger.js";

const TYPE_FROM_JF = { Movie: "movie", Series: "tv" };

function getUserMappings() {
  try {
    const raw = process.env.USER_MAPPINGS;
    const mappings = typeof raw === "string" ? JSON.parse(raw) : (raw || []);
    return Array.isArray(mappings) ? mappings : [];
  } catch {
    return [];
  }
}

/** Extract TMDB ID + media type + title from a Jellyfin item's ProviderIds. */
function jfToSeed(item) {
  const tmdbId =
    item.ProviderIds?.Tmdb ||
    item.ProviderIds?.tmdb ||
    item.ProviderIds?.TheMovieDb ||
    item.ProviderIds?.themoviedb;
  if (!tmdbId) return null;
  const type = TYPE_FROM_JF[item.Type] || "movie";
  return { tmdbId: String(tmdbId), type, title: item.Name };
}

export async function handleForYouCommand(interaction) {
  await interaction.deferReply({ flags: 64 });

  const tmdbKey = getTmdbApiKey();
  const jfKey = process.env.JELLYFIN_API_KEY;
  const jfBase = process.env.JELLYFIN_BASE_URL;

  // Filter mode: "all" (default, includes missing items with Request button)
  // or "available" (only library items)
  const filterMode = interaction.options?.getString?.("filter") || "all";

  if (!tmdbKey || !jfKey || !jfBase) {
    return interaction.editReply({ content: t("command_config_missing") });
  }

  try {
    const discordId = interaction.user.id;
    const seerrUrl = getSeerrUrl();
    const seerrApiKey = getSeerrApiKey();
    const userMappings = getUserMappings();

    // Resolve the user's Jellyfin user ID via the Seerr chain
    const jellyfinUserId =
      seerrUrl && seerrApiKey
        ? await resolveJellyfinUserId(discordId, userMappings, seerrUrl, seerrApiKey)
        : null;

    logger.info(`[foryou] Discord ${discordId} → jellyfinUserId=${jellyfinUserId ?? "none"}`);

    if (!jellyfinUserId) {
      return interaction.editReply({ content: t("foryou_no_jellyfin_user") });
    }

    // Step 1: read watch history
    const watched = await fetchUserRecentlyPlayed(jellyfinUserId, jfKey, jfBase, 20);
    logger.info(`[foryou] Jellyfin watch history: ${watched.length} items`);

    if (watched.length === 0) {
      return interaction.editReply({ content: t("foryou_no_history") });
    }

    // Step 2: pick up to 5 random seeds with TMDB IDs (random = different
    // recommendations each call, not just the same recently-played 5)
    const watchedTmdbIds = new Set();
    const allSeeds = [];
    for (const item of watched) {
      const seed = jfToSeed(item);
      if (!seed) continue;
      watchedTmdbIds.add(seed.tmdbId);
      allSeeds.push(seed);
    }
    const seeds = [...allSeeds].sort(() => Math.random() - 0.5).slice(0, 5);

    if (seeds.length === 0) {
      logger.warn(`[foryou] None of ${watched.length} watched items have TMDB IDs`);
      return interaction.editReply({ content: t("foryou_no_recommendations") });
    }

    logger.info(`[foryou] Seeds: ${seeds.map((s) => `${s.title}(${s.type}/${s.tmdbId})`).join(", ")}`);

    // Step 3: fetch TMDB recommendations for each seed in parallel
    const recArrays = await Promise.all(
      seeds.map((s) => tmdbApi.tmdbGetSimilar(s.tmdbId, s.type, tmdbKey).catch(() => []))
    );
    logger.info(`[foryou] TMDB rec counts per seed: [${recArrays.map((a) => a.length).join(", ")}]`);

    // Step 4: aggregate by id, scoring frequency × vote_average
    const aggregated = new Map(); // tmdbId → { item, score, type, sourceTitle }
    for (let i = 0; i < recArrays.length; i++) {
      const sourceType = seeds[i].type;
      const sourceTitle = seeds[i].title;
      for (const rec of recArrays[i]) {
        const id = String(rec.id);
        if (watchedTmdbIds.has(id)) continue; // skip already watched
        const incScore = (rec.vote_average || 0) + 5; // base so frequency multiplier matters
        if (aggregated.has(id)) {
          aggregated.get(id).score += incScore;
        } else {
          aggregated.set(id, { item: rec, score: incScore, type: sourceType, sourceTitle });
        }
      }
    }

    if (aggregated.size === 0) {
      return interaction.editReply({ content: t("foryou_no_recommendations") });
    }

    // Step 5: take more candidates than needed when filtering to library-only,
    // so we can drop the unavailable ones and still surface 5 results.
    const candidateCount = filterMode === "available" ? 25 : 5;
    const candidates = [...aggregated.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, candidateCount);

    // Step 6: enrich with Jellyfin availability + Seerr status
    const allEnriched = await Promise.all(
      candidates.map(async ({ item, type, sourceTitle }) => {
        const id = String(item.id);
        const title = item.title || item.name || "Unknown";
        const year = (item.release_date || item.first_air_date || "").substring(0, 4);
        const rating = item.vote_average ? item.vote_average.toFixed(1) : null;

        let jellyfinItemId = null;
        try {
          jellyfinItemId = await findJellyfinItemByTmdbId(id, type, title, jfKey, jfBase);
        } catch { /* ignore */ }

        let seerrStatus = null;
        if (seerrUrl && seerrApiKey) {
          try {
            const sr = await seerrApi.checkMediaStatus(id, type, [], seerrUrl, seerrApiKey);
            seerrStatus = sr?.status ?? null;
          } catch { /* ignore */ }
        }

        return {
          id,
          type,
          title,
          year,
          rating,
          jellyfinItemId,
          seerrStatus,
          available: !!jellyfinItemId,
          sourceTitle,
        };
      })
    );

    // Apply filter, then take top 5
    const enriched = filterMode === "available"
      ? allEnriched.filter((r) => r.available).slice(0, 5)
      : allEnriched.slice(0, 5);

    if (enriched.length === 0) {
      return interaction.editReply({
        content: filterMode === "available"
          ? t("foryou_no_library_matches")
          : t("foryou_no_recommendations"),
      });
    }

    // Build embed
    const lines = enriched.map((rec, i) => {
      let icon = "⚪";
      if (rec.seerrStatus === 5 || rec.available) icon = "✅";
      else if (rec.seerrStatus === 4 || rec.seerrStatus === 3 || rec.seerrStatus === 2) icon = "⏳";

      const yearStr = rec.year ? ` (${rec.year})` : "";
      const ratingStr = rec.rating ? ` ⭐ ${rec.rating}` : "";
      const reasonStr = `\n   *${t("foryou_because_watched")} ${rec.sourceTitle}*`;
      return `${i + 1}. ${icon} **${rec.title}${yearStr}**${ratingStr}${reasonStr}`;
    });

    const description = `${t("foryou_based_on_jellyfin")}\n\n${lines.join("\n")}\n\n${t("foryou_legend")}`;

    const embed = new EmbedBuilder()
      .setColor("#a6e3a1")
      .setAuthor({ name: t("foryou_title") })
      .setDescription(description)
      .setTimestamp();

    // Buttons: Watch for available items, Request for missing ones
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
