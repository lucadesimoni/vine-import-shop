import { blocksSchema, blockDef, safeHref, type Block, type BlockDef, type Field } from "~/lib/blocks";
import { LOCALES, tl, type Localized } from "~/lib/localized";
import { renderMarkdown } from "~/lib/markdown";
import { hasRegionMap, loadRegionMap } from "~/lib/maps/regions";
import type { Settings } from "~/lib/settings";
import { CUSTOM_BLOCKS } from "~/components/blocks";
import { categoryTree, homeCollections, productDetail, producersList, searchProducts } from "./catalog";
import type { ShopContext } from "./context";
import { originFacets } from "./origins";

/* ── Save: validate + sanitise every field by its definition ───────────── */

const str = (v: unknown, max = 400) => (typeof v === "string" ? v.slice(0, max) : "");
const locVal = (v: unknown, max: number): Localized =>
  v && typeof v === "object" ? Object.fromEntries(LOCALES.map((l) => [l, str((v as Record<string, unknown>)[l], max)]).filter(([, s]) => s)) : {};
const imageUrl = (v: unknown) => {
  const s = str(v, 500).trim();
  return /^(\/uploads\/|\/demo\/|https:\/\/)/.test(s) ? s : "";
};

function cleanField(f: Field, v: unknown): unknown {
  switch (f.type) {
    case "loc": return locVal(v, 300);
    case "locText": return locVal(v, 2000);
    case "markdown": return locVal(v, 20000);
    case "text": return str(v, 300);
    case "url": return safeHref(v);
    case "image": return imageUrl(v);
    case "product": case "category": case "producer": return /^[a-z0-9-]{0,120}$/.test(str(v)) ? str(v) : "";
    case "number": return Math.max(1, Math.min(48, Math.round(Number(v) || 8)));
    case "bool": return v === true || v === "true";
    case "select": return f.options?.some(([o]) => o === v) ? v : f.options?.[0]?.[0];
    case "list":
      return (Array.isArray(v) ? v : []).slice(0, f.max ?? 20).map((item) =>
        Object.fromEntries((f.fields ?? []).map((sf) => [sf.key, cleanField(sf, (item as Record<string, unknown>)?.[sf.key])])),
      );
  }
}

/** Parse + sanitise blocks coming from the editor. Unknown block types are dropped. */
export function sanitizeBlocks(raw: unknown): Block[] {
  const parsed = blocksSchema.parse(typeof raw === "string" ? JSON.parse(raw || "[]") : raw);
  const out: Block[] = [];
  const seen = new Set<string>();
  for (const b of parsed) {
    const def = blockDef(b.type, CUSTOM_BLOCKS);
    if (!def || seen.has(b.id)) continue;
    seen.add(b.id);
    out.push({ id: b.id, type: b.type, enabled: b.enabled, data: Object.fromEntries(def.fields.map((f) => [f.key, cleanField(f, b.data[f.key])])) });
  }
  return out;
}

/* ── Home: blocks, or the classic sections converted once ─────────────── */

export function homeBlocks(home: Settings["home"]): Block[] {
  if (home.blocks) return home.blocks;
  const b = (id: string, type: string, enabled: boolean, data: Record<string, unknown>): Block => ({ id, type, enabled, data });
  return [
    b("hero", "hero", true, {
      eyebrow: home.hero.eyebrow, title: home.hero.title, text: home.hero.text, image: home.hero.imageUrl,
      primaryLabel: home.hero.primary.label, primaryHref: home.hero.primary.href, secondaryLabel: home.hero.secondary?.label ?? {}, secondaryHref: home.hero.secondary?.href ?? "",
      height: "tall", stats: home.stats,
    }),
    b("categories", "categories", home.categories.show, { title: home.categories.title }),
    b("promo", "products", home.promo.show, { eyebrow: home.promo.eyebrow, title: home.promo.title, text: home.promo.text, source: "promo", layout: "carousel", limit: 12, category: "", producer: "" }),
    b("spotlight", "spotlight", home.spotlight.show && !!home.spotlight.productSlug, { product: home.spotlight.productSlug, eyebrow: home.spotlight.eyebrow, bullets: home.spotlight.bullets.map((text) => ({ text })), note: home.spotlight.note }),
    b("story", "imageText", home.story.show, { eyebrow: home.story.eyebrow, title: home.story.title, text: home.story.text, image: home.story.imageUrl, imageSide: "left", linkLabel: home.story.link?.label ?? {}, linkHref: home.story.link?.href ?? "", tone: "surface" }),
    b("brands", "brands", home.brands.show, { title: home.brands.title }),
    b("values", "values", home.values.items.length > 0, { title: home.values.title, items: home.values.items }),
  ];
}

/* ── Render: resolve catalog data for enabled blocks (current locale only) ── */

export type ResolvedBlock = Block & { res?: Record<string, unknown> };

export async function resolveBlocks(ctx: ShopContext, blocks: Block[]): Promise<ResolvedBlock[]> {
  const md = (v: unknown) => renderMarkdown(tl(v as Localized, ctx.locale));
  return Promise.all(
    blocks.filter((b) => b.enabled && blockDef(b.type, CUSTOM_BLOCKS)).map(async (b): Promise<ResolvedBlock> => {
      const d = b.data;
      switch (b.type) {
        case "categories":
          return { ...b, res: { categories: (await categoryTree(ctx)).filter((c) => c.showOnHome) } };
        case "products": {
          const limit = Number(d.limit) || 8;
          const src = String(d.source);
          let items: Awaited<ReturnType<typeof homeCollections>>["promo"];
          if (src === "promo" || src === "featured") items = (await homeCollections(ctx))[src].slice(0, limit);
          else if (src === "new") items = (await searchProducts(ctx, { sort: "new", perPage: limit })).items;
          else if (src === "category" && d.category) items = (await searchProducts(ctx, { category: String(d.category), perPage: limit })).items;
          else if (src === "producer" && d.producer) items = (await searchProducts(ctx, { producer: String(d.producer), perPage: limit })).items;
          else items = [];
          const more = src === "promo" ? "/shop?promo=1" : src === "new" ? "/shop?sort=new" : src === "category" ? `/shop?category=${d.category}` : src === "producer" ? `/producers/${d.producer}` : "/shop";
          return { ...b, res: { items, more } };
        }
        case "spotlight": {
          const p = d.product ? await productDetail(ctx, String(d.product)).catch(() => null) : null;
          return { ...b, res: p ? { card: p.card } : {} };
        }
        case "brands":
          return { ...b, res: { brands: (await producersList()).filter((p) => p.featured && p.count > 0).slice(0, 12).map((p) => ({ slug: p.slug, name: p.name, logo: p.logo })) } };
        case "origin": {
          if (ctx.shop.originMap.mode === "off" || !ctx.shop.modules.producers) return { ...b, enabled: false };
          const f = await originFacets(ctx);
          const iso = ctx.shop.originMap.country;
          const regions = f.regions.filter((r) => r.country === iso);
          const map = hasRegionMap(iso) && regions.length && ctx.shop.originMap.mode !== "world" ? await loadRegionMap(iso) : null;
          return { ...b, res: { map, regions: regions.map((r) => ({ id: r.id, name: r.name, count: r.count })), countries: f.countries.map((c) => ({ id: c.iso, count: c.count })), producers: new Set(f.countries.flatMap((c) => c.producers.map((p) => p.slug))).size } };
        }
        case "text": return { ...b, res: { html: md(d.body) } };
        case "imageText": return { ...b, res: { html: md(d.text) } };
        case "faq": return { ...b, res: { answers: ((d.items as { a?: Localized }[]) ?? []).map((i) => md(i.a)) } };
        default: return b;
      }
    }),
  ).then((list) => list.filter((b) => b.enabled));
}

export type { Block, BlockDef };
