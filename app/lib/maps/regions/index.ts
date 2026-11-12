import type { Locale } from "~/lib/localized";

/**
 * Region maps per country (ISO2). Built from Natural Earth by scripts/maps/build-region-maps.py
 * (Italy from openpolis). Add a country: run the script, drop <iso>.json here — it is picked up automatically.
 * Maps are loaded on demand, so only the configured country is sent to the browser.
 */
export type RegionShape = { id: string; name: string; names: Partial<Record<Locale, string>>; aliases: string[]; cx: number; cy: number; d: string };
export type RegionMapData = { iso: string; viewBox: string; regions: RegionShape[] };

const files = import.meta.glob<RegionMapData>("./*.json", { import: "default" });
const byIso = Object.fromEntries(Object.entries(files).map(([path, load]) => [path.slice(2, 4).toUpperCase(), load]));

/** Countries with a region map, e.g. ["AR", "AT", "AU", "CH", …]. */
export const REGION_MAP_COUNTRIES = Object.keys(byIso).sort();
export const hasRegionMap = (iso: string | null | undefined) => !!iso && iso.toUpperCase() in byIso;
export const loadRegionMap = async (iso: string): Promise<RegionMapData | null> => (byIso[iso.toUpperCase()] ? await byIso[iso.toUpperCase()]() : null);

export const regionLabel = (r: Pick<RegionShape, "name" | "names">, locale: Locale) => r.names[locale] ?? r.name;
