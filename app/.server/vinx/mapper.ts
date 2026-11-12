import type { Settings } from "~/lib/settings";
import type { Raw } from "./client";

type Mapping = Settings["vinx"]["mapping"];

export function pick(row: Raw, path: string | undefined): unknown {
  if (!path) return undefined;
  let v: unknown = row;
  for (const seg of path.split(".")) {
    if (v == null || typeof v !== "object") return undefined;
    v = (v as Record<string, unknown>)[seg];
  }
  return typeof v === "string" ? v.trim() : v;
}

/** Accepts 1'234.50 · 1’234,50 · 1234,5 · "CHF 12.00" · numbers */
export function decimal(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  let s = String(v).replace(/CHF|['’\s]/g, "");
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const truthy = (v: unknown) => ["1", "true", "ja", "yes", "j", "x", "y"].includes(String(v ?? "").toLowerCase());

export type MappedArticle = {
  sku: string;
  productCode: string;
  names: Record<string, string>;
  producer: string | null;
  category: string | null;
  kind: "wine" | "food" | "spirit" | "beverage" | null;
  product: { country?: string; region?: string; appellation?: string; grapes?: string; alcohol?: number; color?: string; taxClass?: "standard" | "reduced" };
  variant: { vintage?: string; size?: string; volumeMl?: number; priceCents?: number; packSize?: number; stock?: number; active?: boolean; erpId?: string };
};

export function mapArticle(row: Raw, m: Mapping): MappedArticle {
  const a = m.article;
  const s = (k: string) => {
    const v = pick(row, a[k]);
    return v == null || v === "" ? undefined : String(v);
  };
  const names: Record<string, string> = {};
  for (const [key, loc] of [["name", "de"], ["name_it", "it"], ["name_fr", "fr"], ["name_en", "en"]] as const) {
    const v = s(key);
    if (v) names[loc] = v;
  }
  const volumeCl = decimal(pick(row, a.volumeCl));
  const price = decimal(pick(row, a.price));
  const stock = decimal(pick(row, a.stock));
  const pack = decimal(pick(row, a.packSize));
  const alcohol = decimal(pick(row, a.alcohol));
  const color = s("color");
  const tax = s("taxCode");
  const sku = s("sku") ?? "";
  const type = s("articleType");
  const kind = (type ? m.articleTypes[type] : undefined) as MappedArticle["kind"] | undefined;
  return {
    sku,
    kind: kind ?? null,
    productCode: s("product") ?? sku,
    names,
    producer: s("producer") ?? null,
    category: s("category") ?? null,
    product: {
      country: s("country"), region: s("region"), appellation: s("appellation"), grapes: s("grapes"),
      alcohol: alcohol ?? undefined, color: color ? m.colors[color] : undefined,
      taxClass: tax ? (m.taxCodes[tax] === "reduced" ? "reduced" : "standard") : undefined,
    },
    variant: {
      vintage: s("vintage"),
      size: s("size") ?? (volumeCl ? `${volumeCl} cl` : undefined),
      volumeMl: volumeCl ? Math.round(volumeCl * 10) : undefined,
      priceCents: price != null ? Math.round(price * 100) : undefined,
      packSize: pack && pack > 0 ? pack : undefined,
      stock: stock != null ? Math.max(0, Math.floor(stock)) : undefined,
      active: a.active && pick(row, a.active) !== undefined ? truthy(pick(row, a.active)) : undefined,
      erpId: s("erpId") ?? sku,
    },
  };
}

/** `ref` is matched against variant erpId (vinX articleId) first, then SKU (article number). */
export function mapStock(row: Raw, m: Mapping) {
  return { ref: String(pick(row, m.stock.sku) ?? ""), stock: Math.max(0, Math.floor(decimal(pick(row, m.stock.stock)) ?? 0)) };
}

export function mapPrice(row: Raw, m: Mapping) {
  return {
    ref: String(pick(row, m.price.sku) ?? ""),
    list: String(pick(row, m.price.list) ?? ""),
    minQty: Math.max(1, Math.floor(decimal(pick(row, m.price.minQty)) ?? 1)),
    netCents: Math.round((decimal(pick(row, m.price.net)) ?? 0) * 100),
    promoCents: decimal(pick(row, m.price.promo)) != null ? Math.round(decimal(pick(row, m.price.promo))! * 100) : null,
  };
}
