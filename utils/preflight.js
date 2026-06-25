/**
 * Preflight diagnostics — runs a set of independent readiness checks and
 * collects a per-check result. The checks themselves are injected (so the runner
 * stays pure/testable); the route wires the real implementations.
 *
 * Checks return language-neutral results: { ok, detailKey, params } — the
 * frontend resolves detailKey (+ params) against the active locale, so the panel
 * is fully translatable.
 */

/**
 * @param {Record<string, () => Promise<{ok: boolean, detailKey?: string, params?: object}>>} checks
 * @returns {Promise<Array<{name: string, ok: boolean, detailKey: string, params: object}>>}
 */
export async function runPreflight(checks) {
  const entries = Object.entries(checks || {});
  return Promise.all(
    entries.map(async ([name, fn]) => {
      try {
        const r = await fn();
        return { name, ok: !!r?.ok, detailKey: r?.detailKey ?? "", params: r?.params ?? {} };
      } catch (err) {
        return { name, ok: false, detailKey: "preflight_error_detail", params: { message: err?.message || "error" } };
      }
    })
  );
}

/**
 * Validate USER_MAPPINGS shape/consistency from its raw env value.
 * @param {string|undefined} raw
 * @returns {{ok: boolean, detailKey: string, params?: object}}
 */
export function checkUserMappings(raw) {
  if (!raw) return { ok: true, detailKey: "preflight_mappings_none" };
  let mappings;
  try {
    mappings = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { ok: false, detailKey: "preflight_mappings_not_json" };
  }
  if (!Array.isArray(mappings)) {
    return { ok: false, detailKey: "preflight_mappings_not_array" };
  }
  const bad = mappings.filter((m) => !m || !m.discordUserId || !m.seerrUserId);
  if (bad.length > 0) {
    return { ok: false, detailKey: "preflight_mappings_incomplete", params: { count: bad.length } };
  }
  return { ok: true, detailKey: "preflight_mappings_ok", params: { count: mappings.length } };
}
