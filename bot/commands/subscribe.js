import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import {
  addSeries,
  removeSeries,
  getSeriesByUser,
  toggleWeekly,
  isWeeklyEnabled,
} from "../../utils/subscriptionStore.js";
import { countSeriesSeasonsInJellyfin } from "../../api/jellyfin.js";
import { tmdbGetDetails, tmdbSearch } from "../../api/tmdb.js";
import { getTmdbApiKey } from "../helpers.js";
import { t } from "../../utils/botStrings.js";
import logger from "../../utils/logger.js";

/** Shared: subscribe a user to a series by tmdbId, using the current Jellyfin
 *  season count as the baseline. Returns the resolved title. */
async function subscribeToSeries(discordUserId, tmdbId, fallbackTitle) {
  let title = fallbackTitle || null;
  try {
    const details = await tmdbGetDetails(tmdbId, "tv", getTmdbApiKey());
    title = details?.name || details?.title || title;
  } catch (err) {
    logger.debug(`[/subscribe] tmdb details failed: ${err.message}`);
  }
  title = title || `TMDB ${tmdbId}`;
  const seasonCount =
    (await countSeriesSeasonsInJellyfin(tmdbId, process.env.JELLYFIN_API_KEY, process.env.JELLYFIN_BASE_URL)) || 0;
  const added = addSeries({ discordUserId, tmdbId, title, seasonCount });
  return { added, title };
}

export async function handleSubscribeCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "series") return subscribeSeries(interaction);
  if (sub === "remove") return subscribeRemove(interaction);
  if (sub === "weekly") return subscribeWeekly(interaction);
  if (sub === "list") return subscribeList(interaction);
}

async function subscribeRemove(interaction) {
  // Autocomplete value is "tmdbId|mediaType|title" — same shape as subscribe.
  const raw = interaction.options.getString("title") || "";
  const tmdbId = parseInt(raw.split("|")[0], 10);
  if (!tmdbId) {
    return interaction.reply({ content: t("subscribe_invalid"), flags: 64 });
  }
  const removed = removeSeries(interaction.user.id, tmdbId);
  return interaction.reply({
    content: removed ? t("subscribe_removed") : t("subscribe_not_subscribed"),
    flags: 64,
  });
}

async function subscribeSeries(interaction) {
  // Autocomplete value is "tmdbId|mediaType|title" (same shape as /status etc.)
  const raw = interaction.options.getString("title") || "";
  const parts = raw.split("|");
  const tmdbId = parseInt(parts[0], 10);
  if (!tmdbId) {
    return interaction.reply({ content: t("subscribe_invalid"), flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });
  const { added, title } = await subscribeToSeries(interaction.user.id, tmdbId, parts.slice(2).join("|") || null);
  return interaction.editReply({
    content: (added ? t("subscribe_added") : t("subscribe_already")).split("{{title}}").join(title),
  });
}

// ── Wizard button → modal flow (free-text series title) ─────────────────────

export async function showSubscribeModal(interaction) {
  const modal = new ModalBuilder().setCustomId("subscribe_modal_submit").setTitle(t("subscribe_modal_title"));
  const input = new TextInputBuilder()
    .setCustomId("subscribe_title_input")
    .setLabel(t("subscribe_modal_label"))
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(200)
    .setPlaceholder(t("subscribe_modal_ph"));
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

export async function handleSubscribeModalSubmit(interaction) {
  const value = interaction.fields.getTextInputValue("subscribe_title_input")?.trim();
  if (!value) return;
  await interaction.deferReply({ flags: 64 });
  try {
    const results = (await tmdbSearch(value, getTmdbApiKey())).filter((r) => r.media_type === "tv");
    if (results.length === 0) {
      return interaction.editReply({ content: t("subscribe_not_found") });
    }
    const hit = results[0];
    const { added, title } = await subscribeToSeries(interaction.user.id, hit.id, hit.name || hit.title);
    return interaction.editReply({
      content: (added ? t("subscribe_added") : t("subscribe_already")).split("{{title}}").join(title),
    });
  } catch (err) {
    logger.warn(`[/subscribe modal] failed: ${err.message}`);
    return interaction.editReply({ content: t("subscribe_invalid") });
  }
}

async function subscribeWeekly(interaction) {
  const on = toggleWeekly(interaction.user.id);
  return interaction.reply({ content: on ? t("subscribe_weekly_on") : t("subscribe_weekly_off"), flags: 64 });
}

async function subscribeList(interaction) {
  const subs = getSeriesByUser(interaction.user.id);
  const weekly = isWeeklyEnabled(interaction.user.id);
  const lines = subs.length
    ? subs.map((s) => `• ${s.title} (${s.seasonCount} ${t("subscribe_seasons")})`).join("\n")
    : t("subscribe_list_empty");
  const weeklyLine = weekly ? t("subscribe_weekly_status_on") : t("subscribe_weekly_status_off");
  return interaction.reply({ content: `**${t("subscribe_list_title")}**\n${lines}\n\n${weeklyLine}`, flags: 64 });
}
