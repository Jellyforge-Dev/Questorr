/**
 * Preflight diagnostics — runs a set of independent readiness checks and
 * collects a per-check {ok, detail} result. The checks themselves are injected
 * (so the runner stays pure/testable); the route wires the real implementations.
 */

/**
 * @param {Record<string, () => Promise<{ok: boolean, detail?: string}>>} checks
 * @returns {Promise<Array<{name: string, ok: boolean, detail: string}>>}
 */
export async function runPreflight(checks) {
  const entries = Object.entries(checks || {});
  return Promise.all(
    entries.map(async ([name, fn]) => {
      try {
        const r = await fn();
        return { name, ok: !!r?.ok, detail: r?.detail ?? "" };
      } catch (err) {
        return { name, ok: false, detail: err?.message || "error" };
      }
    })
  );
}

/**
 * Validate USER_MAPPINGS shape/consistency from its raw env value.
 * @param {string|undefined} raw
 * @returns {{ok: boolean, detail: string}}
 */
export function checkUserMappings(raw) {
  if (!raw) return { ok: true, detail: "Keine Mappings konfiguriert" };
  let mappings;
  try {
    mappings = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { ok: false, detail: "USER_MAPPINGS ist kein gültiges JSON" };
  }
  if (!Array.isArray(mappings)) {
    return { ok: false, detail: "USER_MAPPINGS ist kein Array" };
  }
  const bad = mappings.filter((m) => !m || !m.discordUserId || !m.seerrUserId);
  if (bad.length > 0) {
    return { ok: false, detail: `${bad.length} Mapping(s) ohne discordUserId/seerrUserId` };
  }
  return { ok: true, detail: `${mappings.length} Mapping(s) konsistent` };
}
