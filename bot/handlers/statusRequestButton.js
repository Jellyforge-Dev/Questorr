import { handleSearchOrRequest } from "../commands/search.js";

export async function handleStatusRequestButton(interaction) {
  const parts = interaction.customId.split("|");
  const tmdbId = parseInt(parts[1], 10);
  const mediaType = parts[2] || "movie";
  const title = parts.slice(3).join("|");
  if (!tmdbId) return interaction.reply({ content: "⚠️ Invalid request.", flags: 64 });
  return handleSearchOrRequest(interaction, `${tmdbId}|${mediaType}|${title}`, "request", [], { ephemeral: true });
}
