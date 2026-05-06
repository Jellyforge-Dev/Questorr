/**
 * /foryou — personalized recommendations powered by Streamystats.
 *
 * Streamystats builds vector embeddings from Jellyfin watch history and finds
 * library items that are most similar to what the user has already watched.
 *
 * User identity chain:
 *   Discord ID → USER_MAPPINGS → Seerr user ID → Seerr API → Jellyfin user ID
 *
 * If the user has no mapping, server-wide recommendations are shown (admin's
 * watch history used) along with a prompt to set up user mapping.
 *
 * The command is only registered in Discord when STREAMYSTATS_URL is configured
 * (see discord/commands.js).
 */

import { t } from "../../utils/botStrings.js";
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { resolveJellyfinUserId } from "../../api/jellyfin.js";
import { fetchStreamystatsRecommendations } from "../../api/streamystats.js";
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
  const streamystatsUrl = process.env.STREAMYSTATS_URL;
  const streamystatsUser = process.env.STREAMYSTATS_USER;
  const streamystatsPass = process.env.STREAMYSTATS_PASS;

  if (!jfKey || !jfBase || !streamystatsUrl || !streamystatsUser || !streamystatsPass) {
    return interaction.editReply({ content: t("command_config_missing") });
  }

  try {
    const discordId = interaction.user.id;
    const seerrUrl = getSeerrUrl();
    const seerrApiKey = getSeerrApiKey();
    const userMappings = getUserMappings();

    // Resolve Jellyfin user ID via Seerr chain: Discord → USER_MAPPINGS → Seerr → Jellyfin
    const jellyfinUserId =
      seerrUrl && seerrApiKey
        ? await resolveJellyfinUserId(discordId, userMappings, seerrUrl, seerrApiKey)
        : null;

    logger.info(
      `[foryou] Discord ${discordId} → jellyfinUserId=${jellyfinUserId ?? "none"}`
    );

    // Fetch recommendations from Streamystats.
    // Without jellyfinUserId the Streamystats endpoint uses the authenticated user's
    // data. We still show results but add a mapping hint.
    const recs = await fetchStreamystatsRecommendations(
      jfBase,
      streamystatsUrl,
      streamystatsUser,
      streamystatsPass,
      {
        jellyfinUserId,
        limit: 5,
        type: "all",
        range: "all",
      }
    );

    logger.info(`[foryou] Streamystats returned ${recs.length} recommendations`);

    if (recs.length === 0) {
      return interaction.editReply({ content: t("foryou_no_recommendations") });
    }

    // Build embed lines
    const lines = recs.map((rec, i) => {
      const yearStr = rec.year ? ` (${rec.year})` : "";
      const ratingStr = rec.rating ? ` ⭐ ${rec.rating.toFixed(1)}` : "";

      // Show reason: "basedOn" list takes priority over the text reason
      let contextLine = "";
      if (rec.basedOn?.length) {
        contextLine = `\n   *${t("foryou_because_watched")} ${rec.basedOn.join(", ")}*`;
      } else if (rec.reason) {
        contextLine = `\n   *${rec.reason}*`;
      }

      return `${i + 1}. ✅ **${rec.name}${yearStr}**${ratingStr}${contextLine}`;
    });

    // Subtitle
    const subtitle = jellyfinUserId
      ? t("foryou_based_on_streamystats")
      : t("foryou_based_on_server");

    let description = `${subtitle}\n\n${lines.join("\n")}`;

    // Show mapping hint when there's no user-specific data
    if (!jellyfinUserId) {
      description = `${t("foryou_no_jellyfin_user")}\n\n${description}`;
    }

    const embed = new EmbedBuilder()
      .setColor("#a6e3a1")
      .setAuthor({ name: t("foryou_title") })
      .setDescription(description)
      .setTimestamp();

    // Watch buttons — all Streamystats recommendations are items in the Jellyfin library
    const buttons = [];
    for (const rec of recs) {
      if (!rec.jellyfinId) continue;
      const watchUrl = buildJellyfinUrl(rec.jellyfinId);
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
