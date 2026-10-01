import fs from "fs";
import path from "path";
import logger from "./logger.js";

const LOCALES_DIR = path.join(process.cwd(), "src", "locales");
const FALLBACK = [
  { code: "en", name: "English" },
  { code: "de", name: "Deutsch" },
];

/**
 * Scans locales/ for real translation files (excludes template.json) and
 * returns their {code, name} pairs, sorted by name. Single source of truth
 * for "which languages exist" — used by both the dashboard's language
 * dropdowns and the registration-screen BOT_LANGUAGE seeding, so adding a
 * new locales/<code>.json file is enough; nothing needs to be duplicated
 * or hardcoded elsewhere.
 */
export function getAvailableLanguages() {
  let files;
  try {
    files = fs.readdirSync(LOCALES_DIR);
  } catch (error) {
    logger.warn(`Failed to read locales directory: ${error.message}`);
    return FALLBACK;
  }

  const languages = [];
  for (const file of files) {
    if (!file.endsWith(".json") || file === "template.json") continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), "utf8"));
      if (data._meta?.language_code && data._meta?.language_name) {
        languages.push({ code: data._meta.language_code, name: data._meta.language_name });
      }
    } catch (error) {
      logger.warn(`Failed to parse language file ${file}: ${error.message}`);
    }
  }

  languages.sort((a, b) => a.name.localeCompare(b.name));
  return languages.length > 0 ? languages : FALLBACK;
}

export function getAvailableLanguageCodes() {
  return getAvailableLanguages().map((lang) => lang.code);
}
