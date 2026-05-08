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

/**
 * Time-of-day formatter. Reads TIME_FORMAT from env.
 *   - "auto" (default) → 24h for de/sv, 12h (AM/PM) for en
 *   - "24h"            → 20:30
 *   - "12h"            → 8:30 PM
 *
 * Accepts Date / ISO string / epoch ms / "HH:MM" string.
 */
export function formatTime(input) {
  if (!input) return "";

  let d;
  if (typeof input === "string" && /^\d{1,2}:\d{2}$/.test(input)) {
    // bare HH:MM — anchor to today so we can run it through Date logic
    const [h, m] = input.split(":").map(Number);
    d = new Date();
    d.setHours(h, m, 0, 0);
  } else {
    d = input instanceof Date ? input : new Date(input);
  }
  if (isNaN(d.getTime())) return String(input);

  const fmt = (process.env.TIME_FORMAT || "auto").toLowerCase();
  const resolved = fmt === "auto"
    ? (["de", "sv"].includes(process.env.BOT_LANGUAGE) ? "24h" : "12h")
    : fmt;

  if (resolved === "24h") {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  // 12h
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${suffix}`;
}

/**
 * Combined date + time formatter — convenience wrapper.
 */
export function formatDateTime(input) {
  if (!input) return "";
  const date = formatDate(input);
  const time = formatTime(input);
  if (!date) return time;
  if (!time) return date;
  return `${date} ${time}`;
}
