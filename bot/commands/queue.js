import { EmbedBuilder } from "discord.js";
import { t } from "../../utils/botStrings.js";
import { getByUser, updateFromSeerr, backfillFromSeerr, resolveMissingTitles, STAGES } from "../../utils/requestStore.js";
import { fetchSeerrUserRequestsFull, fetchRequests } from "../../api/seerr.js";
import { tmdbGetDetails } from "../../api/tmdb.js";
import { getSeerrUrl, getSeerrApiKey, getTmdbApiKey } from "../helpers.js";
import logger from "../../utils/logger.js";

// Render order of the user-facing pipeline (matches the spec's embed example).
const STAGE_ORDER = [
  [STAGES.PENDING, "queue_stage_pending"],
  [STAGES.PROCESSING, "queue_stage_processing"],
  [STAGES.PARTIALLY_AVAILABLE, "queue_stage_partial"],
  [STAGES.AVAILABLE, "queue_stage_available"],
  [STAGES.DECLINED, "queue_stage_declined"],
  [STAGES.FAILED, "queue_stage_failed"],
];

function typeLabel(mediaType) {
  return mediaType === "tv" ? t("queue_label_series") : t("queue_label_movie");
}

/** Build the grouped /queue embed from a user's request-store records. */
export function buildQueueEmbed(records) {
  const lines = [];

  for (const [stage, headerKey] of STAGE_ORDER) {
    const inStage = records.filter((r) => r.stage === stage);
    if (inStage.length === 0) continue;

    lines.push(`**${t(headerKey)}**`);
    for (const r of inStage) {
      const title = r.title || `TMDB ${r.tmdbId}`;
      lines.push(`• ${title} (${typeLabel(r.mediaType)})`);
    }
    lines.push("");
  }

  return new EmbedBuilder()
    .setTitle(t("queue_title"))
    .setDescription(lines.join("\n").trim());
}

// Seerr request `media` objects frequently lack a title, so backfill resolves it
// from TMDB by id. title (movie) / name (tv) with original_* as a final fallback.
async function resolveTitleFromTmdb(tmdbId, mediaType) {
  try {
    const d = await tmdbGetDetails(tmdbId, mediaType, getTmdbApiKey());
    return d?.title || d?.name || d?.original_title || d?.original_name || null;
  } catch {
    return null;
  }
}

function resolveSeerrUserId(discordId) {
  try {
    const raw = process.env.USER_MAPPINGS;
    const mappings = typeof raw === "string" ? JSON.parse(raw) : raw || [];
    if (Array.isArray(mappings)) {
      const m = mappings.find((x) => String(x.discordUserId) === String(discordId));
      return m ? m.seerrUserId : null;
    }
  } catch {
    /* fall through to null */
  }
  return null;
}

export async function handleQueueCommand(interaction) {
  await interaction.deferReply({ flags: 64 });

  const discordId = interaction.user.id;
  const seerrUrl = getSeerrUrl();
  const seerrApiKey = getSeerrApiKey();

  // On-demand reconcile so /queue works even when the poller is disabled.
  // Best-effort: on failure we still serve the store's last-known state.
  if (seerrUrl && seerrApiKey) {
    try {
      const seerrUserId = resolveSeerrUserId(discordId);
      if (seerrUserId != null) {
        // Mapped: requestedBy filter — not subject to the poller's 100-request window.
        const results = await fetchSeerrUserRequestsFull(seerrUserId, seerrUrl, seerrApiKey, 100);
        updateFromSeerr(results);
        // Backfill requests made before the store existed / via the Seerr UI.
        // Safe here because the requestedBy filter guarantees they're this user's.
        // Titles are filled in below by resolveMissingTitles.
        backfillFromSeerr(results, discordId);
      } else {
        // Unmapped: reconcile against the global recent fetch. No backfill —
        // global results mix other users' requests and aren't attributable.
        const data = await fetchRequests(seerrUrl, seerrApiKey, 100, "all");
        updateFromSeerr(data?.results || []);
      }
    } catch (err) {
      logger.warn(`[queue] reconcile failed: ${err?.message || err}`);
    }
  }

  // Resolve titles for records persisted before a title was available (e.g.
  // backfilled with null before this resolver existed) — they'd otherwise stay
  // as "TMDB <id>" since updateFromSeerr never sets title and backfill skips them.
  await resolveMissingTitles(discordId, resolveTitleFromTmdb);

  const records = getByUser(discordId);
  if (records.length === 0) {
    return interaction.editReply({ content: t("queue_empty") });
  }

  return interaction.editReply({ embeds: [buildQueueEmbed(records)] });
}
