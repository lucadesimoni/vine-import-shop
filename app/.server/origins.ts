import { and, eq, sql, type SQL } from "drizzle-orm";
import world from "~/lib/maps/world.json";
import italy from "~/lib/maps/italy.json";
import { slugify } from "~/lib/slug";
import type { ShopContext } from "./context";
import { getDb, schema } from "./db";

/**
 * Product origin, resolved from supplier/producer master data (producers.country/region —
 * filled by the ERP sync from the supplier address, or edited in admin) with an optional
 * per-product override (products.country/region). Works for every product kind.
 */

const ALIASES: Record<string, string> = { italien: "IT", italia: "IT", italy: "IT", italie: "IT", schweiz: "CH", svizzera: "CH", suisse: "CH", switzerland: "CH", usa: "US", "vereinigte staaten": "US", spanien: "ES", espana: "ES", "españa": "ES", frankreich: "FR", francia: "FR", deutschland: "DE", germania: "DE", oesterreich: "AT", "österreich": "AT", austria: "AT", portugal: "PT", portogallo: "PT", griechenland: "GR", grecia: "GR", argentinien: "AR", chile: "CL", cile: "CL", suedafrika: "ZA", "südafrika": "ZA", australien: "AU", neuseeland: "NZ" };
const byName = new Map<string, string>();
for (const c of world.countries) for (const n of Object.values(c.names)) byName.set(n.toLowerCase(), c.iso);
for (const [k, v] of Object.entries(ALIASES)) byName.set(k, v);

export function countryIso(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  if (/^[a-z]{2}$/.test(n)) return n.toUpperCase();
  return byName.get(n) ?? null;
}

/** Region maps available per country (ISO2) — add more by dropping a json into lib/maps. */
const REGION_MAPS: Record<string, { regions: { id: string; name: string }[] }> = { IT: italy };
const REGION_ALIASES: Record<string, string> = { "sudtirol": "trentino-alto-adige", "alto-adige": "trentino-alto-adige", "trentino": "trentino-alto-adige", "toskana": "toscana", "lombardei": "lombardia", "piemont": "piemonte", "venetien": "veneto", "friaul": "friuli-venezia-giulia", "sizilien": "sicilia", "sardinien": "sardegna", "apulien": "puglia", "kampanien": "campania", "kalabrien": "calabria", "abruzzen": "abruzzo", "aostatal": "valle-d-aosta", "ligurien": "liguria", "umbrien": "umbria", "latium": "lazio", "marken": "marche" };

export function regionId(iso: string | null, region: string | null | undefined): string | null {
  if (!region) return null;
  const s = slugify(region.split("/")[0]);
  const id = REGION_ALIASES[s] ?? s;
  const map = iso ? REGION_MAPS[iso] : undefined;
  return map ? (map.regions.some((r) => r.id === id) ? id : null) : id;
}

export type OriginFacets = {
  regions: { id: string; country: string; count: number; producers: { slug: string; name: string; count: number }[] }[];
  countries: { iso: string; count: number; producers: { slug: string; name: string; count: number }[] }[];
  total: number;
};

const ORIGIN_SQL = {
  country: sql.raw(`coalesce(nullif(products.country, ''), (select po.country from producers po where po.id = products.producer_id))`),
  region: sql.raw(`coalesce(nullif(products.region, ''), (select po.region from producers po where po.id = products.producer_id))`),
};

export async function originFacets(ctx: ShopContext, kind?: string | null): Promise<OriginFacets> {
  const db = await getDb();
  const p = schema.products;
  const rows = await db
    .select({
      country: sql<string | null>`${ORIGIN_SQL.country}`,
      region: sql<string | null>`${ORIGIN_SQL.region}`,
      slug: schema.producers.slug,
      name: schema.producers.name,
      count: sql<number>`count(*)::int`,
    })
    .from(p)
    .leftJoin(schema.producers, eq(schema.producers.id, p.producerId))
    .where(and(eq(p.active, true), ctx.isTrade ? undefined : eq(p.tradeOnly, false), kind ? eq(p.kind, kind as "wine") : undefined))
    .groupBy(sql`1`, sql`2`, schema.producers.slug, schema.producers.name);

  const regions = new Map<string, OriginFacets["regions"][number]>();
  const countries = new Map<string, OriginFacets["countries"][number]>();
  let total = 0;
  for (const r of rows) {
    total += r.count;
    const iso = countryIso(r.country);
    if (iso) {
      const c = countries.get(iso) ?? { iso, count: 0, producers: [] };
      c.count += r.count;
      if (r.slug && r.name) {
        const ex = c.producers.find((x) => x.slug === r.slug);
        if (ex) ex.count += r.count;
        else c.producers.push({ slug: r.slug, name: r.name, count: r.count });
      }
      countries.set(iso, c);
    }
    const id = regionId(iso, r.region);
    if (!id || !iso) continue;
    const reg = regions.get(id) ?? { id, country: iso, count: 0, producers: [] };
    reg.count += r.count;
    if (r.slug && r.name) reg.producers.push({ slug: r.slug, name: r.name, count: r.count });
    regions.set(id, reg);
  }
  const byCount = (a: { count: number; name: string }, b: { count: number; name: string }) => b.count - a.count || a.name.localeCompare(b.name);
  for (const r of regions.values()) r.producers.sort(byCount);
  for (const c of countries.values()) c.producers.sort(byCount);
  return {
    regions: [...regions.values()].sort((a, b) => b.count - a.count),
    countries: [...countries.values()].sort((a, b) => b.count - a.count),
    total,
  };
}

/** SQL conditions for ?region= / ?origin= filters (matched on the resolved origin names). */
export async function originConditions(params: { region?: string; origin?: string }) {
  const out: SQL[] = [];
  if (!params.region && !params.origin) return out;
  const db = await getDb();
  const names = await db.selectDistinct({ country: sql<string | null>`${ORIGIN_SQL.country}`, region: sql<string | null>`${ORIGIN_SQL.region}` }).from(schema.products);
  if (params.origin) {
    const iso = params.origin.toUpperCase();
    const list = [...new Set(names.map((n) => n.country).filter((c): c is string => !!c && countryIso(c) === iso))];
    out.push(list.length ? sql`${ORIGIN_SQL.country} in (${sql.join(list.map((x) => sql`${x}`), sql`, `)})` : sql`false`);
  }
  if (params.region) {
    const list = [...new Set(names.filter((n) => regionId(countryIso(n.country), n.region) === params.region).map((n) => n.region!))];
    out.push(list.length ? sql`${ORIGIN_SQL.region} in (${sql.join(list.map((x) => sql`${x}`), sql`, `)})` : sql`false`);
  }
  return out;
}
