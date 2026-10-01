/**
 * Secret redaction for log output.
 *
 * Logs are written to disk and surfaced via the dashboard (/api/logs). axios
 * errors, request dumps and config echoes can carry API keys, bearer tokens and
 * passwords. This scrubs the common secret-bearing patterns from a log string
 * before it is persisted or shown. Pattern-based and best-effort — it reduces
 * accidental leakage, it is not a guarantee against every possible format.
 */

const REDACTED = "<redacted>";

// Each entry: [pattern, replacement]. The capture group ($1) keeps the
// key/prefix so the log stays readable; the secret value is replaced.
const PATTERNS = [
  // key: value  /  key="value"  /  key=value  — for api key/token/secret/password style keys
  [
    /((?:x-api-key|x-api-user|api[_-]?key|apikey|access[_-]?token|token|secret|password|client[_-]?secret|webhook[_-]?secret)["']?\s*[:=]\s*["']?)([^\s"',}&]{4,})/gi,
    `$1${REDACTED}`,
  ],
  // Bearer tokens
  [/(Bearer\s+)([A-Za-z0-9._~+/-]{8,}=*)/gi, `$1${REDACTED}`],
  // URL query params: ?api_key=... or &token=...
  [/([?&](?:api_key|apikey|token|secret|key)=)([^&\s"']+)/gi, `$1${REDACTED}`],
];

/**
 * Redact secrets from a log value. Non-string input is returned unchanged.
 * @param {*} value
 * @returns {*}
 */
export function redactSecrets(value) {
  if (typeof value !== "string") return value;
  let out = value;
  for (const [pattern, replacement] of PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
