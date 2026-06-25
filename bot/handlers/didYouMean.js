/**
 * "Meintest du?" / "Did You Mean?" handler.
 *
 * When a wizard-modal user's input differs significantly from the TMDB
 * top hit, an ephemeral prompt lets them confirm or browse alternatives.
 *
 * Button custom-ID schema:
 *   dym_yes|{command}|{tmdbId}|{mediaType}
 *   dym_no|{command}
 *   dym_pick|{command}|{tmdbId}|{mediaType}
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { t } from "../../utils/botStrings.js";
import logger from "../../utils/logger.js";

// ── Similarity check ─────────────────────────────────────────────────────────

function normalizeStr(s) {
  return s
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9äöüß\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Levenshtein edit distance — number of single-character edits between a and b.
 * Used as fallback so that letter-swaps like "Pulb Fictoin" → "Pulp Fiction"
 * are recognised even when no whole words match.
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Returns true when the TMDB top result looks different enough from the
 * user's raw input to warrant a "Did you mean X?" prompt.
 *
 * Hybrid logic:
 *   1. Exact / substring match  → no prompt
 *   2. Word-overlap ≥ 70 %      → no prompt (e.g. "dark knight" vs "The Dark Knight")
 *   3. Levenshtein-sim ≥ 85 %   → no prompt (close letter-level match)
 *   Otherwise                  → show prompt (typo or genuine ambiguity)
 */
export function shouldShowDYM(userInput, topTitle) {
  if (!userInput || !topTitle) return false;
  const a = normalizeStr(userInput);
  const b = normalizeStr(topTitle);
  if (!a || !b) return false;

  // Exact match after normalization → no prompt needed
  if (a === b) return false;

  // Input is contained in result ("dark knight" ⊂ "the dark knight")
  if (b.includes(a)) return false;

  // Word-overlap ratio: count how many of the user's words appear in the result
  const wordsA = a.split(" ").filter(w => w.length > 1);
  const setB   = new Set(b.split(" ").filter(w => w.length > 1));
  const overlap = wordsA.length
    ? wordsA.filter(w => setB.has(w)).length / wordsA.length
    : 0;

  // Levenshtein similarity 0..1
  const sim = 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);

  // Show DYM only when BOTH heuristics say "different"
  //   "Pulb Fictoin"  vs "Pulp Fiction"   → overlap 0,    sim ~0.83 → DYM
  //   "Inception 10"  vs "Inception"      → overlap 0.5,  sim ~0.78 → DYM
  //   "Inception"     vs "Inception 2010" → overlap 1.0             → no
  //   "dark knight"   vs "The Dark Knight"→ substring                → no
  return overlap < 0.7 && sim < 0.85;
}

// ── Ephemeral session store ───────────────────────────────────────────────────

const _sessions = new Map(); // userId → { command, alternatives[], expires }
const TTL = 5 * 60 * 1000; // 5 min

function putSession(userId, data) {
  // Evict expired entries first
  const now = Date.now();
  for (const [k, v] of _sessions) {
    if (now > v.expires) _sessions.delete(k);
  }
  _sessions.set(userId, { ...data, expires: now + TTL });
}

function getSession(userId) {
  const s = _sessions.get(userId);
  if (!s || Date.now() > s.expires) return null;
  return s;
}

function clearSession(userId) {
  _sessions.delete(userId);
}

// ── Show initial DYM prompt ───────────────────────────────────────────────────

/**
 * Called from wizardSearchModal after a mismatch is detected.
 * The interaction must already be deferred (ephemeral).
 */
export async function showDYMPrompt(interaction, command, results) {
  const top       = results[0];
  const topTitle  = top.title || top.name || "?";
  const topYear   = (top.release_date || top.first_air_date || "").slice(0, 4);
  const yearStr   = topYear ? ` (${topYear})` : "";

  // Persist alternatives so the "No" button can show them
  putSession(interaction.user.id, {
    command,
    alternatives: results.slice(1, 5).map(r => ({
      id:    r.id,
      type:  r.media_type,
      title: r.title || r.name || "?",
      year:  (r.release_date || r.first_air_date || "").slice(0, 4),
    })),
  });

  const confirmLabel = `${topTitle}${yearStr}`.slice(0, 80);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dym_yes|${command}|${top.id}|${top.media_type}`)
      .setLabel(confirmLabel)
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId(`dym_no|${command}`)
      .setLabel(t("dym_btn_no"))
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔍"),
  );

  const questionText = t("dym_question").replace(
    "{{title}}",
    `**${topTitle}${yearStr}**`,
  );

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor("#f9e2af")
        .setDescription(`🤔 ${questionText}`),
    ],
    components: [row],
  });
}

// ── Button: ✅ Yes ────────────────────────────────────────────────────────────

export async function handleDymYes(interaction) {
  const [, command, tmdbId, mediaType] = interaction.customId.split("|");
  clearSession(interaction.user.id);
  logger.info(`[dym] YES: /${command} → tmdb:${tmdbId} (${mediaType})`);

  await interaction.deferUpdate();
  await _dispatch(interaction, command, `${tmdbId}|${mediaType}`);
}

// ── Button: 🔍 No — show alternatives ────────────────────────────────────────

export async function handleDymNo(interaction) {
  const [, command] = interaction.customId.split("|");
  const session = getSession(interaction.user.id);

  if (!session?.alternatives?.length) {
    return interaction.update({
      content: t("dym_no_alternatives"),
      embeds: [],
      components: [],
    });
  }

  const buttons = session.alternatives.map(alt => {
    const label = `${alt.title}${alt.year ? ` (${alt.year})` : ""}`.slice(0, 80);
    return new ButtonBuilder()
      .setCustomId(`dym_pick|${command}|${alt.id}|${alt.type}`)
      .setLabel(label)
      .setStyle(ButtonStyle.Primary);
  });

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor("#89b4fa")
        .setDescription(`📋 ${t("dym_alternatives")}`),
    ],
    components: [new ActionRowBuilder().addComponents(...buttons)],
  });
}

// ── Button: pick an alternative ───────────────────────────────────────────────

export async function handleDymPick(interaction) {
  const [, command, tmdbId, mediaType] = interaction.customId.split("|");
  clearSession(interaction.user.id);
  logger.info(`[dym] PICK: /${command} → tmdb:${tmdbId} (${mediaType})`);

  await interaction.deferUpdate();
  await _dispatch(interaction, command, `${tmdbId}|${mediaType}`);
}

// ── Internal dispatch ─────────────────────────────────────────────────────────

async function _dispatch(interaction, command, resolvedInput) {
  const { handleSearchOrRequest } = await import("../commands/search.js");

  // Patch options so the handler's getString("title") returns the pre-resolved ID
  interaction.options = {
    getString:  (name) => (name === "title" ? resolvedInput : null),
    getInteger: () => null,
    getNumber:  () => null,
    getBoolean: () => null,
  };

  // The interaction is already deferred (via deferUpdate) and always ephemeral
  switch (command) {
    case "search":
      return handleSearchOrRequest(interaction, resolvedInput, "search",  [], { ephemeral: true });
    case "request":
      return handleSearchOrRequest(interaction, resolvedInput, "request", [], { ephemeral: true });
    default:
      logger.warn(`[dym] _dispatch: unsupported command "${command}"`);
  }
}
