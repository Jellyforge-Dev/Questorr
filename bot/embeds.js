import { t } from "../utils/botStrings.js";
import {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import * as tmdbApi from "../api/tmdb.js";
import { minutesToHhMm } from "../utils/time.js";
import { COLORS } from "../lib/constants.js";
import { getSeerrApiUrl, normalizeSeerrUrl } from "../utils/seerrUrl.js";
import { isValidUrl } from "../utils/url.js";
import { parseButtonConfig } from "./helpers.js";
import logger from "../utils/logger.js";

export function buildNotificationEmbed(
  details,
  mediaType,
  imdbId,
  status = "search",
  omdb = null,
  tmdbId = null
) {
  const titleName = details.title || details.name || "Unknown";
  const releaseDate = details.release_date || details.first_air_date || "";
  const year = releaseDate ? releaseDate.slice(0, 4) : "";
  const titleWithYear = year ? `${titleName} (${year})` : titleName;

  const authorName =
    status === "success"
      ? t("successfully_requested")
      : mediaType === "movie"
        ? t("movie_found")
        : t("tv_found");

  let seerrMediaUrl;
  const currentSeerrUrl = normalizeSeerrUrl(process.env.SEERR_URL || "");
  if (tmdbId && currentSeerrUrl) {
    const baseUrl = `${currentSeerrUrl}/${mediaType}/${tmdbId}`;
    seerrMediaUrl = status === "success" ? `${baseUrl}?manage=1` : baseUrl;
  }

  const genres =
    (details.genres || []).map((g) => g.name).join(", ") || "Unknown";

  let runtime = "Unknown";
  if (omdb?.Runtime && omdb.Runtime !== "N/A") {
    const match = String(omdb.Runtime).match(/(\d+)/);
    if (match) runtime = minutesToHhMm(parseInt(match[1], 10));
  } else if (mediaType === "movie" && details.runtime > 0) {
    runtime = minutesToHhMm(details.runtime);
  } else if (
    mediaType === "tv" &&
    Array.isArray(details.episode_run_time) &&
    details.episode_run_time.length > 0
  ) {
    runtime = minutesToHhMm(details.episode_run_time[0]);
  }

  const rating = omdb?.imdbRating
    ? `${omdb.imdbRating}/10`
    : typeof details.vote_average === "number" && details.vote_average > 0
      ? `${details.vote_average.toFixed(1)}/10`
      : "N/A";

  let overview =
    (details.overview && details.overview.trim() !== ""
      ? details.overview
      : null) ||
    (omdb?.Plot && omdb.Plot !== "N/A"
      ? omdb.Plot
      : t("no_description"));

  let headerLine = t("label_summary");
  if (omdb) {
    if (mediaType === "movie" && omdb.Director && omdb.Director !== "N/A") {
      headerLine = t("label_directed_by").replace("{{name}}", omdb.Director);
    } else if (mediaType === "tv" && omdb.Writer && omdb.Writer !== "N/A") {
      const creator = omdb.Writer.split(",")[0].trim();
      headerLine = t("label_created_by").replace("{{name}}", creator);
    }
  }

  const embed = new EmbedBuilder()
    .setAuthor({
      name: authorName,
      url: isValidUrl(seerrMediaUrl) ? seerrMediaUrl : undefined,
    })
    .setTitle(titleWithYear)
    .setURL(imdbId ? `https://www.imdb.com/title/${imdbId}/` : undefined)
    .setColor(
      status === "success"
        ? COLORS.SUCCESS
        : status === "search"
          ? COLORS.SEARCH
          : COLORS.DEFAULT
    );

  const backdropPath = tmdbApi.findBestBackdrop(details);
  const backdrop = backdropPath
    ? `https://image.tmdb.org/t/p/w1280${backdropPath}`
    : null;
  const poster = details.poster_path
    ? `https://image.tmdb.org/t/p/w342${details.poster_path}`
    : null;

  if (backdrop && isValidUrl(backdrop)) {
    embed.setImage(backdrop);
  } else if (poster && isValidUrl(poster)) {
    embed.setThumbnail(poster);
  }

  embed.addFields(
    {
      name: headerLine,
      value: overview.length ? overview : t("no_description"),
    },
    { name: t("label_genre"), value: genres, inline: true },
    { name: t("label_runtime"), value: runtime, inline: true },
    { name: t("label_rating"), value: rating, inline: true }
  );

  return embed;
}

export function buildButtons(
  tmdbId,
  imdbId,
  requested = false,
  mediaType = "movie",
  details = null,
  requestedSeasons = [],
  requestedTags = [],
  selectedSeasons = [],
  selectedTags = []
) {
  const rows = [];
  const buttons = [];

  const _show = parseButtonConfig(requested ? "NOTIF_BUTTONS_MEDIA_PENDING" : "NOTIF_BUTTONS_MEDIA_PENDING");

  if (imdbId) {
    const letterboxdUrl = `https://letterboxd.com/imdb/${imdbId}`;
    const imdbUrl = `https://www.imdb.com/title/${imdbId}/`;

    if (_show("letterboxd") && mediaType === "movie" && isValidUrl(letterboxdUrl)) {
      buttons.push(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel(t("btn_letterboxd"))
          .setURL(letterboxdUrl)
      );
    }

    if (_show("imdb") && isValidUrl(imdbUrl)) {
      buttons.push(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel(t("btn_imdb"))
          .setURL(imdbUrl)
      );
    }
  }

  if (requested) {
    let successLabel = t("requested_label");

    if (mediaType === "tv" && requestedSeasons.length > 0) {
      if (requestedSeasons.includes("all")) {
        successLabel = t("requested_all_seasons");
      } else if (requestedSeasons.length === 1) {
        successLabel = t("requested_season") + " " + requestedSeasons[0];
      } else {
        const seasons = [...requestedSeasons];
        const lastSeason = seasons.pop();
        successLabel = t("requested_seasons") + " " + seasons.join(", ") + " " + t("and_connector") + " " + lastSeason;
      }
    }
    if (requestedTags.length > 0) {
      const tagLabel =
        requestedTags.length === 1
          ? requestedTags[0]
          : requestedTags.join(", ");
      const tagKey = requestedTags.length === 1 ? "with_tag" : "with_tags";
      successLabel += " " + t(tagKey).replace("{{tags}}", tagLabel);
    }

    successLabel += ", " + t("stay_tuned");

    buttons.push(
      new ButtonBuilder()
        .setCustomId(`requested|${tmdbId}|${mediaType}`)
        .setLabel(successLabel)
        .setStyle(ButtonStyle.Success)
        .setDisabled(true)
    );
  } else {
    let requestLabel = t("btn_request").replace("📥 ", "");

    if (mediaType === "tv" && selectedSeasons.length > 0) {
      if (selectedSeasons.includes("all")) {
        requestLabel = t("request_all_seasons");
      } else if (selectedSeasons.length === 1) {
        requestLabel = t("request_season") + " " + selectedSeasons[0];
      } else {
        const seasons = [...selectedSeasons];
        const lastSeason = seasons.pop();
        requestLabel = t("request_seasons") + " " + seasons.join(", ") + " " + t("and_connector") + " " + lastSeason;
      }
    }

    if (selectedTags.length > 0) {
      const tagLabel =
        selectedTags.length === 1 ? selectedTags[0] : selectedTags.join(", ");
      const tagKey = selectedTags.length === 1 ? "with_tag" : "with_tags";
      requestLabel += " " + t(tagKey).replace("{{tags}}", tagLabel);
    }

    const seasonsParam =
      selectedSeasons.length > 0 ? selectedSeasons.join(",") : "";
    const tagsParam = selectedTags.length > 0 ? selectedTags.join(",") : "";

    buttons.push(
      new ButtonBuilder()
        .setCustomId(
          `request_btn|${tmdbId}|${mediaType}|${seasonsParam}|${tagsParam}`
        )
        .setLabel(requestLabel)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(mediaType === "tv" && selectedSeasons.length === 0)
    );
  }

  if (buttons.length > 0) {
    rows.push(new ActionRowBuilder().addComponents(...buttons.slice(0, 5)));
  }

  if (
    mediaType === "tv" &&
    details?.seasons?.length > 0 &&
    !requested &&
    selectedSeasons.length === 0
  ) {
    const seenSeasons = new Set();
    const uniqueSeasons = details.seasons.filter((s) => {
      if (s.season_number <= 0) return false;
      if (seenSeasons.has(s.season_number)) return false;
      seenSeasons.add(s.season_number);
      return true;
    });

    const tagsParam = selectedTags.length > 0 ? selectedTags.join(",") : "";

    if (uniqueSeasons.length <= 24) {
      const seasonOptions = [
        { label: t("all_seasons"), value: "all" },
        ...uniqueSeasons.map((s) => ({
          label: t("season_label") + " " + s.season_number + " (" + s.episode_count + " " + t("episodes_label") + ")",
          value: String(s.season_number),
        })),
      ];

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`select_seasons|${tmdbId}|${tagsParam}`)
        .setPlaceholder(t("select_seasons_placeholder"))
        .setMinValues(1)
        .setMaxValues(Math.min(25, seasonOptions.length))
        .addOptions(seasonOptions);

      rows.push(new ActionRowBuilder().addComponents(selectMenu));
    } else {
      const SEASONS_PER_MENU = 24;
      const MAX_SEASON_MENUS = 4;

      const firstBatchSeasons = uniqueSeasons.slice(0, SEASONS_PER_MENU);
      const firstMenuOptions = [
        { label: t("all_seasons"), value: "all" },
        ...firstBatchSeasons.map((s) => ({
          label: t("season_label") + " " + s.season_number + " (" + s.episode_count + " " + t("episodes_label") + ")",
          value: String(s.season_number),
        })),
      ];

      const firstMenu = new StringSelectMenuBuilder()
        .setCustomId(`select_seasons|${tmdbId}|${tagsParam}|0`)
        .setPlaceholder(
          `Seasons 1-${firstBatchSeasons[firstBatchSeasons.length - 1].season_number}`
        )
        .setMinValues(0)
        .setMaxValues(firstMenuOptions.length)
        .addOptions(firstMenuOptions);

      rows.push(new ActionRowBuilder().addComponents(firstMenu));

      let menuIndex = 1;
      let offset = SEASONS_PER_MENU;

      while (offset < uniqueSeasons.length && menuIndex < MAX_SEASON_MENUS) {
        const batchSeasons = uniqueSeasons.slice(offset, offset + SEASONS_PER_MENU);

        if (batchSeasons.length > 0) {
          const batchOptions = batchSeasons.map((s) => ({
            label: t("season_label") + " " + s.season_number + " (" + s.episode_count + " " + t("episodes_label") + ")",
            value: String(s.season_number),
          }));

          const batchMenu = new StringSelectMenuBuilder()
            .setCustomId(`select_seasons|${tmdbId}|${tagsParam}|${menuIndex}`)
            .setPlaceholder(
              `Seasons ${batchSeasons[0].season_number}-${batchSeasons[batchSeasons.length - 1].season_number}`
            )
            .setMinValues(0)
            .setMaxValues(batchOptions.length)
            .addOptions(batchOptions);

          rows.push(new ActionRowBuilder().addComponents(batchMenu));
        }

        offset += SEASONS_PER_MENU;
        menuIndex++;
      }

      if (offset < uniqueSeasons.length) {
        logger.warn(
          `[SEASON SELECTOR] Show has ${uniqueSeasons.length} seasons, but Discord limit allows only ${offset} to be shown in ${MAX_SEASON_MENUS} menus`
        );
      }
    }
  }

  return rows;
}
