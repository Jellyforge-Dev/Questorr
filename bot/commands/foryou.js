/**
 * /foryou — personalized recommendations powered by Jellyfin's native engine.
 *
 * Calls Jellyfin's `/Movies/Recommendations` endpoint, which uses the user's actual
 * watch history (recently played, liked items, directors/actors) to surface library
 * items they haven't watched yet. Pure server-side — no TMDB roundtrip, no third
 * party.
 *
 * User identity chain:
 *   Discord ID → USER_MAPPINGS → Seerr user ID → Seerr API → Jellyfin user ID
 *
 * Without a Jellyfin user ID we tell the user to set up the mapping in Step 5.
 * Movies only — Jellyfin's recommendation engine is movie-focused.
 */

import { t } from "../../utils/botStrings.js";
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { resolveJellyfinUserId, fetchJellyfinRecommendations } from "../../api/jellyfin.js";
import { buildJellyfinUrl, getSeerrUrl, getSeerrApiKey } from "../helpers.js";
import { isValidUrl } from "../../utils/url.js";
import logger from "../../utils/logger.js";

function getUserMappings() {
  try {
    const raw = process.env.USER_MAPPINGS;
    const mappings = typeof raw === "string" ? JSON.parse(raw) : (raw || []);
    return Array.isArray(mappings) ? mappings : [];
  } catch {
    return [];
  }
}

export async function handleForYouCommand(interaction) {
  await interaction.deferReply({ flags: 64 });

  const jfKey = process.env.JELLYFIN_API_KEY;
  const jfBase = process.env.JELLYFIN_BASE_URL;

  if (!jfKey || !jfBase) {
    return interaction.editReply({ content: t("command_config_missing") });
  }

  try {
    const discordId = interaction.user.id;
    const seerrUrl = getSeerrUrl();
    const seerrApiKey = getSeerrApiKey();
    const userMappings = getUserMappings();

    // Resolve Jellyfin user ID via Seerr chain
    const jellyfinUserId =
      seerrUrl && seerrApiKey
        ? await resolveJellyfinUserId(discordId, userMappings, seerrUrl, seerrApiKey)
        : null;

    logger.info(`[foryou] Discord ${discordId} → jellyfinUserId=${jellyfinUserId ?? "none"}`);

    if (!jellyfinUserId) {
      return interaction.editReply({ content: t("foryou_no_jellyfin_user") });
    }

    // Fetch personalized recommendations from Jellyfin.
    // Smaller categoryLimit/itemLimit = faster response on large libraries.
    const recs = await fetchJellyfinRecommendations(jellyfinUserId, jfKey, jfBase, {
      categoryLimit: 3,
      itemLimit: 5,
      totalLimit: 5,
    });

    logger.info(`[foryou] Jellyfin returned ${recs.length} recommendations for ${jellyfinUserId}`);

    if (recs.length === 0) {
      return interaction.editReply({ content: t("foryou_no_recommendations") });
    }

    // Build embed lines
    const lines = recs.map((rec, i) => {
      const yearStr = rec.year ? ` (${rec.year})` : "";
      const ratingStr = rec.rating ? ` ⭐ ${rec.rating.toFixed(1)}` : "";
      const reasonStr = rec.reason ? `\n   *${t("foryou_because_watched")} ${rec.reason}*` : "";
      return `${i + 1}. ✅ **${rec.name}${yearStr}**${ratingStr}${reasonStr}`;
    });

    const description = `${t("foryou_based_on_jellyfin")}\n\n${lines.join("\n")}`;

    const embed = new EmbedBuilder()
      .setColor("#a6e3a1")
      .setAuthor({ name: t("foryou_title") })
      .setDescription(description)
      .setTimestamp();

    // Watch buttons — all recs are in the Jellyfin library
    const buttons = [];
    for (const rec of recs) {
      if (!rec.id) continue;
      const watchUrl = buildJellyfinUrl(rec.id);
      if (watchUrl && isValidUrl(watchUrl)) {
        buttons.push(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel(`▶ ${rec.name.substring(0, 60)}`)
            .setURL(watchUrl)
        );
      }
    }

    const replyOpts = { embeds: [embed] };
    if (buttons.length > 0) {
      replyOpts.components = [new ActionRowBuilder().addComponents(buttons.slice(0, 5))];
    }

    return interaction.editReply(replyOpts);
  } catch (err) {
    logger.error("[foryou] command error:", err);
    return interaction.editReply({ content: t("foryou_error") });
  }
}
