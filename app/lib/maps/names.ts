import names from "./names.json";
import type { Locale } from "~/lib/localized";

/** Localised country names for the origin maps (small; safe to import anywhere). Region names live in the region maps. */
export function countryName(iso: string, locale: Locale) {
  const c = (names.countries as Record<string, Record<string, string>>)[iso];
  return c ? c[locale] ?? c.en : iso;
}
