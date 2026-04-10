import { t } from "../../utils/botStrings.js";
import { EmbedBuilder } from "discord.js";
import { fetchRequests } from "../../api/seerr.js";
import { getSeerrUrl, getSeerrApiKey } from "../helpers.js";
import logger from "../../utils/logger.js";

const STATUS_MAP = {
  1: { emoji: "❓", label: "Unknown" },
  2: { emoji: "⏳", label: "Pending" },
  3: { emoji: "⬇️", label: "Processing" },
  4: { emoji: "🟡", label: "Partial" },
  5: { emoji: "✅", label: "Available" },
};

export async function handleWatchlistCommand(interaction) {
  await interaction.deferReply({ flags: 64 });

  const seerrUrl = getSeerrUrl();
  const apiKey = getSeerrApiKey();

  if (!seerrUrl || !apiKey) {
    return interaction.editReply({ content: t("command_config_missing") });
  }

  const filter = interaction.options.getString("filter") || "all";

  try {
    const data = await fetchRequests(seerrUrl, apiKey, 25, filter === "mine" ? "all" : filter);
    let requests = data?.results || [];

    // If "mine" filter, find user's Seerr ID from mappings and filter
    if (filter === "mine") {
      const discordId = interaction.user.id;
      let seerrUserId = null;
      try {
        const raw = process.env.USER_MAPPINGS;
        const mappings = typeof raw === "string" ? JSON.parse(raw) : (raw || []);
        if (Array.isArray(mappings)) {
          const match = mappings.find(m => String(m.discordUserId) === String(discordId));
          if (match) seerrUserId = String(match.seerrUserId);
        }
      } catch (_) {}

      if (seerrUserId) {
        requests = requests.filter(r => String(r.requestedBy?.id) === seerrUserId);
      } else {
        return interaction.editReply({ content: t("watchlist_no_mapping") });
      }
    }

    if (requests.length === 0) {
      return interaction.editReply({ content: t("watchlist_empty") });
    }

    // Build embed with up to 10 requests
    const shown = requests.slice(0, 10);
    const lines = shown.map((r, i) => {
      const title = r.media?.title || r.media?.name || r.media?.originalTitle || "Unknown";
      const mediaType = r.media?.mediaType === "movie" ? "🎬" : "📺";
      const status = STATUS_MAP[r.media?.status] || STATUS_MAP[1];
      const user = r.requestedBy?.displayName || r.requestedBy?.username || "?";
      const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "";
      return `${i + 1}. ${mediaType} **${title}** — ${status.emoji} ${status.label}\n   ↳ ${user} · ${date}`;
    });

    const embed = new EmbedBuilder()
      .setColor("#1ec8a0")
      .setAuthor({ name: t("watchlist_title") })
      .setDescription(lines.join("\n\n"))
      .setTimestamp();

    if (requests.length > 10) {
      embed.setFooter({ text: t("watchlist_showing").replace("{{shown}}", "10").replace("{{total}}", String(requests.length)) });
    }

    const footerText = process.env.EMBED_FOOTER_TEXT;
    if (footerText && requests.length <= 10) embed.setFooter({ text: footerText });

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error("Watchlist command error:", err);
    return interaction.editReply({ content: t("watchlist_error") });
  }
}
