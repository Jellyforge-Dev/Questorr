import { t, tNotif } from "../utils/botStrings.js";
import {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import * as tmdbApi from "../api/tmdb.js";
import { isValidUrl } from "../utils/url.js";
import { parseButtonConfig } from "./helpers.js";
import logger from "../utils/logger.js";

let dailyRandomPickTimer = null;

export function scheduleDailyRandomPick(client) {
  if (dailyRandomPickTimer) {
    clearInterval(dailyRandomPickTimer);
  }

  const enabled = process.env.DAILY_RANDOM_PICK_ENABLED === "true";
  if (!enabled) return;

  const channelId = process.env.DAILY_RANDOM_PICK_CHANNEL_ID;
  const intervalMinutes = parseInt(process.env.DAILY_RANDOM_PICK_INTERVAL || "1440");

  if (!channelId) {
    logger.warn("Daily Random Pick is enabled but no channel is configured. Skipping.");
    return;
  }

  if (intervalMinutes < 1) {
    logger.warn("Daily Random Pick interval must be at least 1 minute. Skipping.");
    return;
  }

  const intervalMs = intervalMinutes * 60 * 1000;

  logger.info(
    `📅 Daily Random Pick scheduled every ${intervalMinutes} minute${intervalMinutes !== 1 ? "s" : ""}`
  );

  sendDailyRandomPick(client).catch((err) =>
    logger.error("Error sending initial random pick:", err)
  );

  dailyRandomPickTimer = setInterval(async () => {
    await sendDailyRandomPick(client);
  }, intervalMs);
}

export async function sendDailyRandomPick(client) {
  try {
    const TMDB_API_KEY = process.env.TMDB_API_KEY;
    const channelId = process.env.DAILY_RANDOM_PICK_CHANNEL_ID;

    if (!TMDB_API_KEY || !channelId) return;

    const randomMedia = await tmdbApi.tmdbGetRandomMedia(TMDB_API_KEY);
    if (!randomMedia) {
      logger.warn("Could not fetch random media for daily pick");
      return;
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      logger.warn(`Daily Random Pick channel not found: ${channelId}`);
      return;
    }

    const mediaType = randomMedia.media_type;
    const isMovie = mediaType === "movie";
    const title = isMovie ? randomMedia.title : randomMedia.name;
    const year = isMovie
      ? randomMedia.release_date?.slice(0, 4)
      : randomMedia.first_air_date?.slice(0, 4);
    const details = randomMedia.details || randomMedia;

    const emoji = isMovie ? "🎬" : "📺";
    const backdrop = randomMedia.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${randomMedia.backdrop_path}`
      : null;

    let overview = randomMedia.overview || t("no_description");
    if (overview.length > 300) {
      overview = overview.substring(0, 297) + "...";
    }

    const embed = new EmbedBuilder()
      .setAuthor({ name: tNotif("daily_random_pick", "NOTIF_TITLE_DAILY_RANDOM") })
      .setTitle(`${title}${year ? ` (${year})` : ""}`)
      .setDescription(overview)
      .setColor("#f5a962")
      .addFields({
        name: t("field_rating"),
        value: randomMedia.vote_average
          ? `⭐ ${randomMedia.vote_average.toFixed(1)}/10`
          : "N/A",
        inline: true,
      });

    if (details.genres && Array.isArray(details.genres)) {
      const genreNames = details.genres.map((g) => g.name).join(", ");
      if (genreNames) {
        embed.addFields({ name: t("label_genre"), value: genreNames, inline: true });
      }
    }

    if (backdrop && isValidUrl(backdrop)) {
      embed.setImage(backdrop);
    }

    const buttonComponents = [];
    const _showDR = parseButtonConfig("NOTIF_BUTTONS_DAILY_RANDOM");

    let imdbId = null;
    if (details.external_ids?.imdb_id) {
      imdbId = details.external_ids.imdb_id;
    }

    if (_showDR("letterboxd") && isMovie && imdbId) {
      const letterboxdUrl = `https://letterboxd.com/imdb/${imdbId}/`;
      if (isValidUrl(letterboxdUrl)) {
        buttonComponents.push(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel(t("btn_letterboxd"))
            .setURL(letterboxdUrl)
        );
      }
    }

    if (_showDR("imdb") && imdbId) {
      const imdbUrl = `https://www.imdb.com/title/${imdbId}/`;
      if (isValidUrl(imdbUrl)) {
        buttonComponents.push(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel(t("btn_imdb"))
            .setURL(imdbUrl)
        );
      }
    }

    buttonComponents.push(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Primary)
        .setLabel(t("btn_request"))
        .setCustomId(`request_random_${randomMedia.id}_${mediaType}`)
    );

    const button = new ActionRowBuilder().addComponents(buttonComponents);

    await channel.send({ embeds: [embed], components: [button] });

    logger.info(`Sent daily random pick: ${title} (${randomMedia.id} - ${mediaType})`);
  } catch (error) {
    logger.error(`Failed to send daily random pick: ${error.message}`);
  }
}

// ─── Daily Recommendation (from Jellyfin library) ─────────────────────────────

let dailyRecommendationTimer = null;

export function scheduleDailyRecommendation(client) {
  if (dailyRecommendationTimer) {
    clearInterval(dailyRecommendationTimer);
    dailyRecommendationTimer = null;
  }

  const enabled = process.env.DAILY_RECOMMENDATION_ENABLED === "true";
  if (!enabled) return;

  const channelId = process.env.DAILY_RECOMMENDATION_CHANNEL_ID;
  if (!channelId) {
    logger.warn("[Daily Recommendation] Enabled but no channel configured. Skipping.");
    return;
  }

  const intervalMinutes = parseInt(process.env.DAILY_RECOMMENDATION_INTERVAL || "1440");
  const intervalMs = intervalMinutes * 60 * 1000;

  logger.info(`📅 Daily Recommendation scheduled every ${intervalMinutes} minute(s)`);

  // Send immediately on start
  sendDailyRecommendation(client).catch((err) =>
    logger.error("[Daily Recommendation] Error on initial send:", err)
  );

  dailyRecommendationTimer = setInterval(async () => {
    await sendDailyRecommendation(client);
  }, intervalMs);
}

export async function sendDailyRecommendation(client) {
  try {
    const apiKey = process.env.JELLYFIN_API_KEY;
    const baseUrl = process.env.JELLYFIN_BASE_URL;
    const serverId = process.env.JELLYFIN_SERVER_ID;
    const channelId = process.env.DAILY_RECOMMENDATION_CHANNEL_ID;
    const tmdbApiKey = process.env.TMDB_API_KEY;

    if (!apiKey || !baseUrl || !channelId) {
      logger.warn("[Daily Recommendation] Missing Jellyfin config or channel ID");
      return;
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      logger.warn(`[Daily Recommendation] Channel not found: ${channelId}`);
      return;
    }

    // Fetch random items from Jellyfin library
    const { default: axios } = await import("axios");
    const base = baseUrl.replace(/\/$/, "");

    // Get total count first
    const countRes = await axios.get(`${base}/Items`, {
      headers: { "X-MediaBrowser-Token": apiKey },
      params: {
        Recursive: true,
        IncludeItemTypes: "Movie,Series",
        Limit: 1,
      },
      timeout: 8000,
    });

    const total = countRes.data?.TotalRecordCount || 0;
    if (total === 0) {
      logger.warn("[Daily Recommendation] No items found in Jellyfin library");
      return;
    }

    // Pick a random starting index
    const startIndex = Math.floor(Math.random() * Math.max(1, total - 1));

    const itemsRes = await axios.get(`${base}/Items`, {
      headers: { "X-MediaBrowser-Token": apiKey },
      params: {
        Recursive: true,
        IncludeItemTypes: "Movie,Series",
        Fields: "Overview,Genres,ProviderIds,ProductionYear,CommunityRating",
        StartIndex: startIndex,
        Limit: 1,
      },
      timeout: 8000,
    });

    const item = itemsRes.data?.Items?.[0];
    if (!item) {
      logger.warn("[Daily Recommendation] Could not fetch random item from Jellyfin");
      return;
    }

    logger.info(`[Daily Recommendation] Picked: "${item.Name}" (${item.Type})`);

    const isMovie = item.Type === "Movie";
    const emoji = isMovie ? "🎬" : "📺";
    const year = item.ProductionYear;
    const tmdbId = item.ProviderIds?.Tmdb;
    const imdbId = item.ProviderIds?.Imdb;

    // Try to get backdrop from TMDB for better quality
    let backdropUrl = null;
    let posterUrl = null;

    let tmdbOverview = null;
    if (tmdbId && tmdbApiKey) {
      try {
        const tmdbType = isMovie ? "movie" : "tv";
        const tmdb = await tmdbApi.tmdbGetDetails(tmdbId, tmdbType, tmdbApiKey);
        if (tmdb.backdrop_path) backdropUrl = `https://image.tmdb.org/t/p/w1280${tmdb.backdrop_path}`;
        if (tmdb.poster_path) posterUrl = `https://image.tmdb.org/t/p/w500${tmdb.poster_path}`;
        if (tmdb.overview) tmdbOverview = tmdb.overview;
      } catch (e) {
        logger.debug("[Daily Recommendation] TMDB fetch failed:", e.message);
      }
    }

    // Fallback to Jellyfin backdrop
    if (!backdropUrl) {
      backdropUrl = `${base}/Items/${item.Id}/Images/Backdrop`;
    }

    // Prefer TMDB overview (respects BOT_LANGUAGE) over Jellyfin text
    let overview = tmdbOverview || item.Overview || t("no_description");
    if (overview.length > 300) overview = overview.substring(0, 297) + "...";

    const genres = Array.isArray(item.Genres) ? item.Genres.join(", ") : "";
    const rating = item.CommunityRating ? `⭐ ${item.CommunityRating.toFixed(1)}/10` : "N/A";

    // Build Jellyfin Watch URL
    const watchUrl = serverId
      ? `${base}/web/index.html#!/details?id=${item.Id}&serverId=${serverId}`
      : null;

    const embed = new EmbedBuilder()
      .setAuthor({ name: tNotif("daily_recommendation", "NOTIF_TITLE_DAILY_RECOMMENDATION") })
      .setTitle(`${item.Name}${year ? ` (${year})` : ""}`)
      .setDescription(overview)
      .setColor("#1ec8a0")
      .setTimestamp();

    if (posterUrl) embed.setThumbnail(posterUrl);
    if (backdropUrl && isValidUrl(backdropUrl)) embed.setImage(backdropUrl);

    const fields = [];
    if (genres) fields.push({ name: t("label_genre"), value: genres, inline: true });
    fields.push({ name: t("label_rating"), value: rating, inline: true });
    if (fields.length > 0) embed.addFields(...fields);

    // Buttons
    const buttonComponents = [];
    const _showRec = parseButtonConfig("NOTIF_BUTTONS_DAILY_RECOMMENDATION");

    if (_showRec("watch") && watchUrl && isValidUrl(watchUrl)) {
      buttonComponents.push(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel(t("btn_watch_now_short"))
          .setURL(watchUrl)
      );
    }

    if (_showRec("imdb") && imdbId) {
      const imdbUrl = `https://www.imdb.com/title/${imdbId}/`;
      if (isValidUrl(imdbUrl)) {
        buttonComponents.push(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel(t("btn_imdb"))
            .setURL(imdbUrl)
        );
      }
    }

    if (_showRec("letterboxd") && isMovie && imdbId) {
      const letterboxdUrl = `https://letterboxd.com/imdb/${imdbId}`;
      if (isValidUrl(letterboxdUrl)) {
        buttonComponents.push(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel(t("btn_letterboxd"))
            .setURL(letterboxdUrl)
        );
      }
    }

    const components = buttonComponents.length > 0
      ? [new ActionRowBuilder().addComponents(buttonComponents)]
      : [];

    await channel.send({ embeds: [embed], components });
    logger.info(`[Daily Recommendation] ✅ Sent recommendation: "${item.Name}"`);
  } catch (err) {
    logger.error("[Daily Recommendation] Failed:", err.message);
  }
}
