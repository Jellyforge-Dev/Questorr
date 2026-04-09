import { t } from "../../utils/botStrings.js";
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import * as tmdbApi from "../../api/tmdb.js";
import { fetchRandomJellyfinItem } from "../../api/jellyfin.js";
import { buildJellyfinUrl, getTmdbApiKey } from "../helpers.js";
import { isValidUrl } from "../../utils/url.js";
import logger from "../../utils/logger.js";

export async function handleRandomCommand(interaction) {
  if (process.env.SHOW_RANDOM_COMMAND === "false") {
    return interaction.reply({ content: "⚠️ The /random command is currently disabled.", flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });

  const type = interaction.options.getString("type") || "movie";
  const itemType = type === "movie" ? "Movie" : "Series";
  const emoji = type === "movie" ? "🎬" : "📺";
  const apiKey = process.env.JELLYFIN_API_KEY;
  const baseUrl = process.env.JELLYFIN_BASE_URL;

  if (!apiKey || !baseUrl) {
    return interaction.editReply({ content: "❌ Jellyfin is not configured." });
  }

  try {
    const item = await fetchRandomJellyfinItem(apiKey, baseUrl, itemType);
    if (!item) {
      return interaction.editReply({ content: `❌ No ${type} found in your Jellyfin library.` });
    }

    const year = item.ProductionYear ? ` (${item.ProductionYear})` : "";
    const genres = item.Genres?.slice(0, 3).join(", ") || "";
    const ageRating = item.OfficialRating || "";
    const communityRating = item.CommunityRating ? `${item.CommunityRating.toFixed(1)}/10` : null;
    const runtimeMin = item.RunTimeTicks ? Math.round(item.RunTimeTicks / 600000000) : null;
    const runtime = runtimeMin ? `${Math.floor(runtimeMin / 60)}h ${runtimeMin % 60}m` : null;
    const overview = item.Overview
      ? (item.Overview.length > 300 ? item.Overview.substring(0, 297) + "..." : item.Overview)
      : "";

    const meta = [];
    if (genres) meta.push(`**Genre:** ${genres}`);
    if (runtime) meta.push(`**Runtime:** ${runtime}`);
    if (communityRating) meta.push(`**Rating:** ⭐ ${communityRating}`);
    if (ageRating) meta.push(`**Age Rating:** ${ageRating}`);

    let description = meta.join(" · ");
    if (overview) description += `\n\n${overview}`;

    const embed = new EmbedBuilder()
      .setColor(process.env.EMBED_COLOR_SEARCH || "#f0a05a")
      .setAuthor({ name: itemType === "Movie" ? t("random_movie") : t("random_series") })
      .setTitle(`${emoji} ${item.Name}${year}`)
      .setDescription(description || "No description available.")
      .setTimestamp();

    const tmdbIdFromJf = item.ProviderIds?.Tmdb || item.ProviderIds?.tmdb || item.ProviderIds?.TMDB;
    let tmdbDataR = null;
    if (tmdbIdFromJf && getTmdbApiKey()) {
      try {
        const tmdbType = itemType === "Movie" ? "movie" : "tv";
        tmdbDataR = await tmdbApi.tmdbGetDetails(tmdbIdFromJf, tmdbType, getTmdbApiKey());
        if (tmdbDataR?.poster_path) {
          embed.setThumbnail("https://image.tmdb.org/t/p/w500" + tmdbDataR.poster_path);
        }
      } catch (_) {}
    }

    const watchUrl = buildJellyfinUrl(item.Id);
    const components = [];
    const _rawRandom = process.env.NOTIF_BUTTONS_RANDOM || "";
    const _onRandom = _rawRandom ? _rawRandom.toLowerCase().split(",").map(s => s.trim()).filter(p => !p.startsWith("-")) : null;
    const _offRandom = _rawRandom ? _rawRandom.toLowerCase().split(",").map(s => s.trim()).filter(p => p.startsWith("-")).map(p => p.slice(1)) : null;
    function _showRandom(btn) {
      if (!_rawRandom) return process.env["EMBED_SHOW_BUTTON_" + btn.toUpperCase()] !== "false";
      if (_onRandom.includes(btn)) return true;
      if (_offRandom.includes(btn)) return false;
      return process.env["EMBED_SHOW_BUTTON_" + btn.toUpperCase()] !== "false";
    }
    if (_showRandom("watch") && watchUrl && isValidUrl(watchUrl)) {
      components.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t("btn_watch_now")).setURL(watchUrl));
    }
    const seerrBaseR = (process.env.SEERR_URL || "").replace(/\/$/, "");
    const tmdbIdForSeerr = item.ProviderIds?.Tmdb || item.ProviderIds?.tmdb;
    if (_showRandom("seerr") && seerrBaseR && tmdbIdForSeerr) {
      const seerrTypeR = item.Type === "Series" ? "tv" : "movie";
      const seerrUrlR = seerrBaseR + "/" + seerrTypeR + "/" + tmdbIdForSeerr;
      if (isValidUrl(seerrUrlR)) components.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t("btn_view_seerr")).setURL(seerrUrlR));
    }
    const _pids = item.ProviderIds || {};
    const imdbIdR = _pids.Imdb || _pids.imdb || _pids.IMDb ||
                    Object.entries(_pids).find(([k]) => k.toLowerCase() === "imdb")?.[1] || null;
    const imdbIdRFinal = imdbIdR || (tmdbDataR?.external_ids?.imdb_id) || null;

    if (_showRandom("letterboxd") && imdbIdRFinal && item.Type !== "Series") {
      const lboxdUrlR = "https://letterboxd.com/imdb/" + imdbIdRFinal + "/";
      if (isValidUrl(lboxdUrlR)) components.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t("btn_letterboxd")).setURL(lboxdUrlR));
    }
    if (_showRandom("imdb") && imdbIdRFinal) {
      const imdbUrlR = "https://www.imdb.com/title/" + imdbIdRFinal + "/";
      if (isValidUrl(imdbUrlR)) components.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t("btn_imdb")).setURL(imdbUrlR));
    }
    const replyOptsR = { embeds: [embed] };
    if (components.length > 0) replyOptsR.components = [new ActionRowBuilder().addComponents(components)];
    return interaction.editReply(replyOptsR);
  } catch (err) {
    logger.error("Random command error:", err);
    return interaction.editReply({ content: "❌ Could not fetch a random title. Please try again." });
  }
}
