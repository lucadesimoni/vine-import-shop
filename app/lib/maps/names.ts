import names from "./names.json";
import type { Locale } from "~/lib/localized";

/** Localised names for map areas (small; safe to import anywhere). */
const IT_NAMES: Partial<Record<Locale, Record<string, string>>> = {
  de: { lombardia: "Lombardei", piemonte: "Piemont", "trentino-alto-adige": "Trentino-Südtirol", "friuli-venezia-giulia": "Friaul", veneto: "Venetien", toscana: "Toskana", umbria: "Umbrien", lazio: "Latium", marche: "Marken", abruzzo: "Abruzzen", campania: "Kampanien", puglia: "Apulien", calabria: "Kalabrien", sicilia: "Sizilien", sardegna: "Sardinien", liguria: "Ligurien", "valle-d-aosta": "Aostatal" },
  fr: { lombardia: "Lombardie", piemonte: "Piémont", "trentino-alto-adige": "Trentin-Haut-Adige", toscana: "Toscane", sicilia: "Sicile", sardegna: "Sardaigne", puglia: "Pouilles", campania: "Campanie", calabria: "Calabre", "valle-d-aosta": "Vallée d'Aoste", liguria: "Ligurie", umbria: "Ombrie", lazio: "Latium", abruzzo: "Abruzzes", marche: "Marches", veneto: "Vénétie", "friuli-venezia-giulia": "Frioul" },
  en: { lombardia: "Lombardy", piemonte: "Piedmont", "trentino-alto-adige": "Trentino-South Tyrol", toscana: "Tuscany", sicilia: "Sicily", sardegna: "Sardinia", puglia: "Apulia", "valle-d-aosta": "Aosta Valley" },
};

export function regionName(id: string, locale: Locale) {
  return IT_NAMES[locale]?.[id] ?? (names.regions as Record<string, string>)[id] ?? id;
}
export function countryName(iso: string, locale: Locale) {
  const c = (names.countries as Record<string, Record<string, string>>)[iso];
  return c ? c[locale] ?? c.en : iso;
}

