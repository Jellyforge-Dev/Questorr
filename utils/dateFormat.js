/**
 * Centralised date formatter for all bot embeds.
 *
 * Reads DATE_FORMAT from env. Supported values:
 *   - "auto"        → toLocaleDateString based on BOT_LANGUAGE (default)
 *   - "dd.mm.yyyy"  → 07.05.2026
 *   - "yyyy-mm-dd"  → 2026-05-07
 *   - "mm/dd/yyyy"  → 05/07/2026
 *
 * Accepts Date instance, ISO string, or epoch ms. Returns "" for empty
 * input, the original string for unparseable input.
 */
export function formatDate(input) {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return String(input);

  const fmt = (process.env.DATE_FORMAT || "auto").toLowerCase();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();

  switch (fmt) {
    case "dd.mm.yyyy": return `${dd}.${mm}.${yyyy}`;
    case "yyyy-mm-dd": return `${yyyy}-${mm}-${dd}`;
    case "mm/dd/yyyy": return `${mm}/${dd}/${yyyy}`;
    default: {
      const locale = process.env.BOT_LANGUAGE === "de" ? "de-DE" : "en-US";
      return d.toLocaleDateString(locale);
    }
  }
}
