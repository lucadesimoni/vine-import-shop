import type { ErpDetails } from "~/lib/erp-details";
import type { Settings } from "~/lib/settings";
import type { Raw } from "./client";

type Mapping = Settings["vinx"]["mapping"];

export function pick(row: Raw, path: string | undefined): unknown {
  if (!path) return undefined;
  if (path.includes("|")) {
    for (const p of path.split("|")) {
      const v = pick(row, p.trim());
      if (v != null && v !== "") return v;
    }
    return undefined;
  }
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
  variant: { vintage?: string; size?: string; volumeMl?: number; priceCents?: number; packSize?: number; stock?: number; active?: boolean; erpId?: string; discountGroup?: string; weightG?: number };
  /** ERP-owned details (REST: BaseData/Wine, WineRating, Brand, Article) */
  details?: ErpDetails;
  /** Article description from the ERP — used only while the shop has no own text */
  text?: string;
  /** Producer portrait / website from the ERP — used only while the shop has none */
  producerInfo?: { description?: string; website?: string };
};

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) || Number(v) === 0 ? undefined : Number(v));
const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
export function erpDetailsOf(row: Raw): ErpDetails | undefined {
  const w = (row.wine ?? {}) as Raw;
  const temp = w.minimalDrinkingTemperature != null && w.maximalDrinkingTemperature != null ? `${w.minimalDrinkingTemperature}–${w.maximalDrinkingTemperature} °C` : w.drinkingTemperature != null ? `${w.drinkingTemperature} °C` : undefined;
  const storage = w.storagePeriod != null || w.maximalStoragePeriod != null ? [w.storagePeriod, w.maximalStoragePeriod].filter((x) => x != null).join("–") : undefined;
  const ratings = (Array.isArray(w.ratings) ? (w.ratings as Raw[]) : []).map((r) => ({
    source: String(r.source ?? "Bewertung"), points: r.points != null ? Number(r.points) : null, max: r.max != null ? Number(r.max) : null,
    unit: txt(r.unit) ?? null, text: txt(r.ratingText) ?? null, vintage: txt(r.vintage != null ? String(r.vintage) : undefined) ?? null,
  }));
  const d: ErpDetails = {
    characteristic: txt(w.characteristic), vinification: txt(w.vinification), terroir: txt(w.terroir), advice: txt(w.consumptionAdvice), history: txt(w.history),
    drinkTemp: temp, storage: storage || undefined, ratings: ratings.length ? ratings : undefined,
    ean: txt(row.ean1 != null ? String(row.ean1) : undefined), rarity: row.isRarity === true ? true : undefined, brand: txt((row.brand as Raw | undefined)?.designation),
    classification: txt((w.classification as Raw | undefined)?.designation),
    cycle: txt((row.productCycle as Raw | undefined)?.designation),
    acidity: num(w.acidity), residualSugar: num(w.residualSugar),
    ingredients: txt((row.ingredients as Raw | undefined)?.contentInfo), nutrition: txt((row.ingredients as Raw | undefined)?.nutritionInfo), allergens: txt((row.ingredients as Raw | undefined)?.allergenInfo),
    set: Array.isArray(row.setItems) && row.setItems.length ? (row.setItems as Raw[]).map((x) => ({ articleId: String(x.articleId), amount: Number(x.amount ?? 1) })) : undefined,
    substitute: row.substituteArticleId != null || txt(row.substituteArticleText) ? { articleId: row.substituteArticleId != null ? String(row.substituteArticleId) : undefined, text: txt(row.substituteArticleText) } : undefined,
  };
  const clean = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) as ErpDetails;
  return Object.keys(clean).length ? clean : undefined;
}

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
  const taxRate = decimal(pick(row, a.taxRate));
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
      // vinX delivers vatPercentage (8.1 / 2.6); CSV may deliver a code (N / R)
      taxClass: taxRate != null ? (taxRate < 5 ? "reduced" : "standard") : tax ? (m.taxCodes[tax] === "reduced" ? "reduced" : "standard") : undefined,
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
      discountGroup: s("discountGroup"),
      // Article.weight (kg in vinX; values above 50 are taken as grams)
      weightG: (() => { const w = decimal(pick(row, a.weight)); return w && w > 0 ? Math.round(w <= 50 ? w * 1000 : w) : undefined; })(),
    },
    details: erpDetailsOf(row),
    text: txt(row.description),
    producerInfo: row.producer && typeof row.producer === "object" ? { description: txt((row.producer as Raw).history) ?? txt((row.producer as Raw).description), website: txt((row.producer as Raw).website) } : undefined,
  };
}

/** `ref` is matched against variant erpId (vinX articleId) first, then SKU (article number). */
export function mapStock(row: Raw, m: Mapping) {
  return { ref: String(pick(row, m.stock.sku) ?? ""), stock: Math.max(0, Math.floor(decimal(pick(row, m.stock.stock)) ?? 0)) };
}

export function mapPrice(row: Raw, m: Mapping) {
  const now = Date.now();
  const promoFrom = row.promotionValidFrom ? Date.parse(String(row.promotionValidFrom)) : null;
  const promoTo = row.promotionValidUntil ? Date.parse(String(row.promotionValidUntil)) : null;
  return {
    promoValidFrom: promoFrom ? new Date(promoFrom) : null,
    promoValidTo: promoTo ? new Date(promoTo) : null,
    // SellingPrices: a price row only counts while valid
    current: (!row.priceValidFrom || Date.parse(String(row.priceValidFrom)) <= now) && (!row.priceValidUntil || Date.parse(String(row.priceValidUntil)) >= now),
    ref: String(pick(row, m.price.sku) ?? ""),
    list: String(pick(row, m.price.list) ?? ""),
    minQty: Math.max(1, Math.floor(decimal(pick(row, m.price.minQty)) ?? 1)),
    netCents: Math.round((decimal(pick(row, m.price.net)) ?? 0) * 100),
    promoCents: decimal(pick(row, m.price.promo)) != null ? Math.round(decimal(pick(row, m.price.promo))! * 100) : null,
  };
}
