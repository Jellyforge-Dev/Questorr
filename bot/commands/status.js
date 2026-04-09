import { t } from "../../utils/botStrings.js";
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import * as tmdbApi from "../../api/tmdb.js";
import * as seerrApi from "../../api/seerr.js";
import { findJellyfinItemByTmdbId } from "../../api/jellyfin.js";
import { buildSeerrUrl, buildJellyfinUrl, getSeerrUrl, getSeerrApiKey, getTmdbApiKey, parseButtonConfig } from "../helpers.js";
import { isValidUrl } from "../../utils/url.js";
import logger from "../../utils/logger.js";

function buildStatusDescription(tmdbDetails, statusLine) {
  const parts = [statusLine];
  if (tmdbDetails) {
    const overview = tmdbDetails.overview;
    const genres = (tmdbDetails.genres || []).slice(0, 3).map(g => g.name).join(", ");
    const runtime = tmdbDetails.runtime
      ? `${Math.floor(tmdbDetails.runtime / 60)}h ${tmdbDetails.runtime % 60}m`
      : (tmdbDetails.episode_run_time?.[0]
        ? `~${tmdbDetails.episode_run_time[0]}m / ep`
        : null);
    const rating = tmdbDetails.vote_average ? `${tmdbDetails.vote_average.toFixed(1)}/10` : null;
    const ageRating = tmdbDetails.content_ratings?.results?.find(r => r.iso_3166_1 === "US")?.rating
      || tmdbDetails.release_dates?.results?.find(r => r.iso_3166_1 === "US")
         ?.release_dates?.find(d => d.certification)?.certification
      || null;

    const meta = [];
    if (genres) meta.push(`**${t("label_genre")}:** ${genres}`);
    if (runtime) meta.push(`**${t("label_runtime")}:** ${runtime}`);
    if (rating) meta.push(`**${t("label_rating")}:** ⭐ ${rating}`);
    if (ageRating) meta.push(`**${t("label_age_rating")}:** ${ageRating}`);
    if (meta.length > 0) parts.push(meta.join(" · "));
    if (overview) {
      const trimmed = overview.length > 300 ? overview.substring(0, 297) + "..." : overview;
      parts.push("\n" + trimmed);
    }
  }
  return parts.join("\n");
}

export async function handleStatusCommand(interaction) {
  if (process.env.SHOW_STATUS_COMMAND === "false") {
    return interaction.reply({ content: t("status_disabled"), flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });

  const raw = interaction.options.getString("title") || "";
  const parts = raw.split("|");
  if (parts.length < 2) {
    return interaction.editReply({
      content: t("status_select_title"),
    });
  }

  const tmdbId = parseInt(parts[0], 10);
  const mediaType = parts[1];
  const titleFromOption = parts.slice(2).join("|");

  const seerrUrl = getSeerrUrl();
  const seerrApiKey = getSeerrApiKey();

  let tmdbDetails = null;
  try {
    tmdbDetails = await tmdbApi.tmdbGetDetails(tmdbId, mediaType, getTmdbApiKey());
  } catch (_) {}

  if (!seerrUrl || !seerrApiKey) {
    return interaction.editReply({ content: t("status_seerr_missing") });
  }

  try {
    const result = await seerrApi.checkMediaStatus(tmdbId, mediaType, [], seerrUrl, seerrApiKey);

    const statusMap = {
      1: { emoji: "❓", label: t("status_unknown") },
      2: { emoji: "⏳", label: t("status_pending") },
      3: { emoji: "⬇️", label: t("status_processing") },
      4: { emoji: "🟡", label: t("status_partial") },
      5: { emoji: "✅", label: t("status_available") },
      6: { emoji: "🗑️", label: t("status_deleted") },
      7: { emoji: "🔄", label: t("status_pending_short") },
    };

    const mediaTitle = result.data?.title || result.data?.name || titleFromOption;
    const mediaYear = result.data?.releaseDate?.slice(0, 4)
      || result.data?.firstAirDate?.slice(0, 4)
      || result.data?.release_date?.slice(0, 4)
      || result.data?.first_air_date?.slice(0, 4) || "";

    if (!result.exists || result.status == null) {
      const _show = parseButtonConfig("NOTIF_BUTTONS_STATUS");
      const nfDesc = buildStatusDescription(tmdbDetails, t("status_not_requested"));
      const embed = new EmbedBuilder()
        .setColor("#89b4fa")
        .setTitle(`${mediaType === "movie" ? "🎬" : "📺"} ${mediaTitle}${mediaYear ? ` (${mediaYear})` : ""}`)
        .setDescription(nfDesc)
        .setTimestamp();
      if (tmdbDetails?.poster_path) {
        embed.setThumbnail(`https://image.tmdb.org/t/p/w500${tmdbDetails.poster_path}`);
      }
      const nfButtons = [
        new ButtonBuilder()
          .setCustomId(`status_request_btn|${tmdbId}|${mediaType}|${titleFromOption}`)
          .setLabel(t("btn_request"))
          .setStyle(ButtonStyle.Primary),
      ];
      const seerrNF = buildSeerrUrl(mediaType, tmdbId);
      if (_show("seerr") && seerrNF && isValidUrl(seerrNF)) {
        nfButtons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t("btn_view_seerr")).setURL(seerrNF));
      }
      const imdbIdNF = tmdbDetails?.external_ids?.imdb_id || null;
      if (_show("letterboxd") && imdbIdNF && mediaType === "movie") {
        const lboxdNF = "https://letterboxd.com/imdb/" + imdbIdNF + "/";
        if (isValidUrl(lboxdNF)) nfButtons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t("btn_letterboxd")).setURL(lboxdNF));
      }
      if (_show("imdb") && imdbIdNF) {
        const imdbNF = "https://www.imdb.com/title/" + imdbIdNF + "/";
        if (isValidUrl(imdbNF)) nfButtons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t("btn_imdb")).setURL(imdbNF));
      }
      return interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(nfButtons)] });
    }

    const _show = parseButtonConfig("NOTIF_BUTTONS_STATUS");
    const statusInfo = statusMap[result.status] || { emoji: "❓", label: `Status ${result.status}` };

    const resultDesc = buildStatusDescription(tmdbDetails, `**Status:** ${statusInfo.emoji} ${statusInfo.label}`);
    const embed = new EmbedBuilder()
      .setColor(
        result.status === 5 ? "#1ec8a0" :
        result.status === 4 ? "#f9e2af" :
        result.status === 3 ? "#89b4fa" :
        result.status === 2 ? "#f0a05a" : "#6c7086"
      )
      .setTitle(`${mediaType === "movie" ? "🎬" : "📺"} ${mediaTitle}${mediaYear ? ` (${mediaYear})` : ""}`)
      .setDescription(resultDesc)
      .setTimestamp();

    const posterPath = tmdbDetails?.poster_path || result.data?.posterPath || result.data?.poster_path;
    if (posterPath) {
      embed.setThumbnail(`https://image.tmdb.org/t/p/w500${posterPath}`);
    }

    const statusButtons = [];
    if (_show("seerr")) {
      const seerrLink = buildSeerrUrl(mediaType, tmdbId);
      if (seerrLink && isValidUrl(seerrLink)) {
        statusButtons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t("btn_view_seerr")).setURL(seerrLink));
      }
    }
    if (_show("watch") && result.status === 5) {
      const jfKey = process.env.JELLYFIN_API_KEY;
      const jfBase = process.env.JELLYFIN_BASE_URL;
      if (jfKey && jfBase) {
        try {
          const jfId = await findJellyfinItemByTmdbId(tmdbId, mediaType, titleFromOption, jfKey, jfBase);
          if (jfId) {
            const watchUrl = buildJellyfinUrl(jfId);
            if (watchUrl && isValidUrl(watchUrl)) {
              statusButtons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t("btn_watch_now")).setURL(watchUrl));
            }
          }
        } catch (_) {}
      }
    }
    const imdbIdSt = tmdbDetails?.external_ids?.imdb_id || null;
    if (_show("letterboxd") && imdbIdSt && mediaType === "movie") {
      const lboxdSt = "https://letterboxd.com/imdb/" + imdbIdSt + "/";
      if (isValidUrl(lboxdSt)) statusButtons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t("btn_letterboxd")).setURL(lboxdSt));
    }
    if (_show("imdb") && imdbIdSt) {
      const imdbSt = "https://www.imdb.com/title/" + imdbIdSt + "/";
      if (isValidUrl(imdbSt)) statusButtons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t("btn_imdb")).setURL(imdbSt));
    }
    const replyOpts = { embeds: [embed] };
    if (statusButtons.length > 0) replyOpts.components = [new ActionRowBuilder().addComponents(statusButtons)];
    return interaction.editReply(replyOpts);

  } catch (err) {
    logger.error("Status command error:", err);
    return interaction.editReply({
      content: t("status_fetch_error"),
    });
  }
}
