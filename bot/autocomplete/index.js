import * as tmdbApi from "../../api/tmdb.js";
import * as seerrApi from "../../api/seerr.js";
import { getSeerrUrl, getSeerrApiKey, getTmdbApiKey } from "../helpers.js";
import logger from "../../utils/logger.js";

// ─── Shared: build rich autocomplete choices from TMDB items ──────────────────
async function buildDetailedChoices(items) {
  return Promise.all(
    items.map(async (item) => {
      try {
        const details = await tmdbApi.tmdbGetDetails(
          item.id,
          item.media_type,
          getTmdbApiKey()
        );

        const emoji = item.media_type === "movie" ? "🎬" : "📺";
        const date = item.release_date || item.first_air_date || "";
        const year = date ? ` (${date.slice(0, 4)})` : "";

        let extraInfo = "";
        if (item.media_type === "movie") {
          const director = details.credits?.crew?.find(
            (c) => c.job === "Director"
          );
          const directorName = director ? director.name : null;
          const runtime = details.runtime;
          const hours = runtime ? Math.floor(runtime / 60) : 0;
          const minutes = runtime ? runtime % 60 : 0;
          const runtimeStr = runtime ? `${hours}h ${minutes}m` : null;

          if (directorName && runtimeStr) {
            extraInfo = ` — directed by ${directorName} — runtime: ${runtimeStr}`;
          } else if (directorName) {
            extraInfo = ` — directed by ${directorName}`;
          } else if (runtimeStr) {
            extraInfo = ` — runtime: ${runtimeStr}`;
          }
        } else {
          const creator = details.created_by?.[0]?.name;
          const seasonCount = details.number_of_seasons;
          const seasonStr = seasonCount
            ? `${seasonCount} season${seasonCount > 1 ? "s" : ""}`
            : null;

          if (creator && seasonStr) {
            extraInfo = ` — created by ${creator} — ${seasonStr}`;
          } else if (creator) {
            extraInfo = ` — created by ${creator}`;
          } else if (seasonStr) {
            extraInfo = ` — ${seasonStr}`;
          }
        }

        let fullName = `${emoji} ${item.title || item.name}${year}${extraInfo}`;
        if (fullName.length > 98) {
          fullName = fullName.substring(0, 95) + "...";
        }

        return { name: fullName, value: `${item.id}|${item.media_type}` };
      } catch (err) {
        const emoji = item.media_type === "movie" ? "🎬" : "📺";
        const date = item.release_date || item.first_air_date || "";
        const year = date ? ` (${date.slice(0, 4)})` : "";
        let basicName = `${emoji} ${item.title || item.name}${year}`;
        if (basicName.length > 98) {
          basicName = basicName.substring(0, 95) + "...";
        }
        return { name: basicName, value: `${item.id}|${item.media_type}` };
      }
    })
  );
}

// ─── Tag Autocomplete ─────────────────────────────────────────────────────────
async function handleTagAutocomplete(interaction, focusedValue) {
  try {
    const allTags = await seerrApi.fetchTags(getSeerrUrl(), getSeerrApiKey());

    const filteredTags = Array.isArray(allTags)
      ? allTags.filter((tag) => {
        const label = tag.label || tag.name || "";
        return label.toLowerCase().includes(focusedValue.toLowerCase());
      })
      : [];

    const uniqueTags = [];
    const seenLabels = new Set();

    for (const tag of filteredTags) {
      const label = tag.label || tag.name;
      if (label && !seenLabels.has(label)) {
        seenLabels.add(label);
        uniqueTags.push({ name: label, value: label });
      }
    }

    return await interaction.respond(uniqueTags.slice(0, 25));
  } catch (e) {
    logger.error("Tag autocomplete error:", e);
    return await interaction.respond([]);
  }
}

// ─── Quality Profile Autocomplete ─────────────────────────────────────────────
async function handleQualityAutocomplete(interaction, focusedValue) {
  try {
    const titleOption = interaction.options.getString("title");
    let mediaType = null;

    if (titleOption && titleOption.includes("|")) {
      const parts = titleOption.split("|");
      mediaType = parts[1];
    }

    const serverOption = interaction.options.getString("server");
    let selectedServerId = null;

    if (serverOption && serverOption.includes("|")) {
      const parts = serverOption.split("|");
      const parsedServerId = parseInt(parts[0], 10);

      if (!isNaN(parsedServerId)) {
        selectedServerId = parsedServerId;
      } else {
        logger.warn(
          `Invalid server option in autocomplete - non-numeric serverId: ${parts[0]}`
        );
      }
    }

    const allProfiles = await seerrApi.fetchQualityProfiles(
      getSeerrUrl(),
      getSeerrApiKey()
    );

    const filteredProfiles = allProfiles.filter((profile) => {
      const name = profile.name || "";
      const matchesSearch = name
        .toLowerCase()
        .includes(focusedValue.toLowerCase());

      let matchesType = true;
      if (mediaType) {
        matchesType =
          (mediaType === "movie" && profile.type === "radarr") ||
          (mediaType === "tv" && profile.type === "sonarr");
      }

      let matchesServer = true;
      if (selectedServerId !== null) {
        matchesServer = profile.serverId === selectedServerId;
      }

      return matchesSearch && matchesType && matchesServer;
    });

    const uniqueProfiles = [];
    const seenNames = new Set();

    for (const profile of filteredProfiles) {
      const displayName = `${profile.name} (${profile.serverName})`;
      const key = `${profile.id}-${profile.serverId}`;
      if (!seenNames.has(key)) {
        seenNames.add(key);
        uniqueProfiles.push({
          name:
            displayName.length > 100
              ? displayName.substring(0, 97) + "..."
              : displayName,
          value: `${profile.id}|${profile.serverId}|${profile.type}`,
        });
      }
    }

    return await interaction.respond(uniqueProfiles.slice(0, 25));
  } catch (e) {
    logger.error("Quality profile autocomplete error:", e);
    return await interaction.respond([]);
  }
}

// ─── Server Autocomplete ──────────────────────────────────────────────────────
async function handleServerAutocomplete(interaction, focusedValue) {
  try {
    const titleOption = interaction.options.getString("title");
    let mediaType = null;

    if (titleOption && titleOption.includes("|")) {
      const parts = titleOption.split("|");
      mediaType = parts[1];
    }

    const allServers = await seerrApi.fetchServers(
      getSeerrUrl(),
      getSeerrApiKey()
    );

    const filteredServers = allServers.filter((server) => {
      const name = server.name || "";
      const matchesSearch = name
        .toLowerCase()
        .includes(focusedValue.toLowerCase());

      if (mediaType) {
        const matchesType =
          (mediaType === "movie" && server.type === "radarr") ||
          (mediaType === "tv" && server.type === "sonarr");
        return matchesSearch && matchesType;
      }

      return matchesSearch;
    });

    const serverChoices = filteredServers.map((server) => {
      const typeEmoji = server.type === "radarr" ? "🎬" : "📺";
      const displayName = `${typeEmoji} ${server.name}${server.isDefault ? " (default)" : ""}`;
      return {
        name:
          displayName.length > 100
            ? displayName.substring(0, 97) + "..."
            : displayName,
        value: `${server.id}|${server.type}`,
      };
    });

    return await interaction.respond(serverChoices.slice(0, 25));
  } catch (e) {
    logger.error("Server autocomplete error:", e);
    return await interaction.respond([]);
  }
}

// ─── Trending Autocomplete ────────────────────────────────────────────────────
async function handleTrendingAutocomplete(interaction, focusedValue) {
  try {
    const trendingResults = await tmdbApi.tmdbGetTrending(getTmdbApiKey());
    const filtered = trendingResults
      .filter((r) => r.media_type === "movie" || r.media_type === "tv")
      .filter((r) => {
        const title = r.title || r.name || "";
        return title.toLowerCase().includes(focusedValue.toLowerCase());
      })
      .slice(0, 10);

    const choices = await buildDetailedChoices(filtered);
    await interaction.respond(choices);
  } catch (e) {
    logger.error("Trending autocomplete error:", e);
    return interaction.respond([]);
  }
}

// ─── Status Autocomplete ──────────────────────────────────────────────────────
async function handleStatusAutocomplete(interaction, focusedValue) {
  if (!focusedValue) return interaction.respond([]);
  try {
    const results = await tmdbApi.tmdbSearch(focusedValue, getTmdbApiKey());
    const choices = results.slice(0, 10).map((r) => {
      const title = r.title || r.name || "Unknown";
      const year = r.release_date?.slice(0, 4) || r.first_air_date?.slice(0, 4) || "";
      const typeEmoji = r.media_type === "movie" ? "🎬" : "📺";
      const label = `${typeEmoji} ${title}${year ? ` (${year})` : ""}`;
      return {
        name: label.length > 100 ? label.substring(0, 97) + "..." : label,
        value: `${r.id}|${r.media_type}|${title}`,
      };
    });
    return await interaction.respond(choices);
  } catch (e) {
    logger.error("Status autocomplete error:", e);
    return interaction.respond([]);
  }
}

// ─── Default Search Autocomplete ──────────────────────────────────────────────
async function handleSearchAutocomplete(interaction, focusedValue) {
  if (!focusedValue) return interaction.respond([]);

  try {
    const results = await tmdbApi.tmdbSearch(focusedValue, getTmdbApiKey());
    const filtered = results
      .filter((r) => r.media_type === "movie" || r.media_type === "tv")
      .slice(0, 10);

    const choices = await buildDetailedChoices(filtered);
    await interaction.respond(choices);
  } catch (e) {
    logger.error("Autocomplete error:", e);
    return await interaction.respond([]);
  }
}

// ─── Genre Autocomplete ──────────────────────────────────────────────────────
async function handleGenreAutocomplete(interaction, focusedValue) {
  try {
    const mediaType = interaction.options.getString("type") || "movie";
    const genres = await tmdbApi.tmdbGetGenres(getTmdbApiKey(), mediaType);

    const filtered = genres
      .filter((g) => g.name.toLowerCase().includes(focusedValue.toLowerCase()))
      .slice(0, 25)
      .map((g) => ({
        name: g.name,
        value: String(g.id),
      }));

    return await interaction.respond(filtered);
  } catch (e) {
    logger.error("Genre autocomplete error:", e);
    return interaction.respond([]);
  }
}

// ─── Person/Cast Autocomplete ────────────────────────────────────────────────
async function handlePersonAutocomplete(interaction, focusedValue) {
  if (!focusedValue) return interaction.respond([]);
  try {
    const results = await tmdbApi.tmdbSearchPerson(focusedValue, getTmdbApiKey());
    const choices = results.slice(0, 10).map((p) => {
      const knownFor = p.known_for?.slice(0, 2).map(k => k.title || k.name).join(", ") || "";
      let label = p.name;
      if (knownFor) label += ` — ${knownFor}`;
      if (label.length > 100) label = label.substring(0, 97) + "...";
      return { name: label, value: String(p.id) };
    });
    return await interaction.respond(choices);
  } catch (e) {
    logger.error("Person autocomplete error:", e);
    return interaction.respond([]);
  }
}

// ─── Main autocomplete dispatcher ─────────────────────────────────────────────
export async function handleAutocomplete(interaction) {
  const focusedOption = interaction.options.getFocused(true);
  const focusedValue = focusedOption.value;

  // Route by option name first (shared across commands)
  if (focusedOption.name === "tag") return handleTagAutocomplete(interaction, focusedValue);
  if (focusedOption.name === "quality") return handleQualityAutocomplete(interaction, focusedValue);
  if (focusedOption.name === "server") return handleServerAutocomplete(interaction, focusedValue);
  if (focusedOption.name === "genre") return handleGenreAutocomplete(interaction, focusedValue);

  // Route by command name
  if (interaction.commandName === "trending") return handleTrendingAutocomplete(interaction, focusedValue);
  if (interaction.commandName === "status") return handleStatusAutocomplete(interaction, focusedValue);
  if (interaction.commandName === "cast") return handlePersonAutocomplete(interaction, focusedValue);

  // Default: search autocomplete (used by /search, /request, /collection)
  return handleSearchAutocomplete(interaction, focusedValue);
}
