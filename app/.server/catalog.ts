import { customerTiers } from "./price-sources";
import { factsFor, rulesFor } from "./conditions";
import { applyConditions } from "~/lib/conditions";
import { originConditions } from "./origins";
import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { priceFor, stockLevel, withConditions, type PriceInfo, type StockLevel, type Tier } from "~/lib/pricing";
import { tl } from "~/lib/localized";
import type { ShopContext } from "./context";
import type { ErpDetails } from "~/lib/erp-details";
import { catalogScope } from "./storefronts";
import { getDb, schema } from "./db";

const { products: p, variants: v, producers: pr, categories: c, prices } = schema;

export type CardVariant = {
  id: number;
  sku: string;
  vintage: string | null;
  size: string | null;
  packSize: number;
  stock: StockLevel;
  stockQty: number | null;
  price: PriceInfo | null;
};
export type ProductCard = {
  id: number;
  slug: string;
  name: string;
  kind: string;
  color: string | null;
  image: string | null;
  organic: boolean;
  promo: boolean;
  isNew: boolean;
  tradeOnly: boolean;
  producer: { name: string; slug: string } | null;
  category: { name: string; slug: string } | null;
  country: string | null;
  region: string | null;
  variants: CardVariant[];
};

export function taxRate(ctx: ShopContext, taxClass: "standard" | "reduced") {
  return taxClass === "reduced" ? ctx.shop.tax.reduced : ctx.shop.tax.standard;
}

async function tiersFor(variantIds: number[], groupId: number | undefined) {
  const map = new Map<number, Tier[]>();
  if (!groupId || !variantIds.length) return map;
  const db = await getDb();
  const rows = await db
    .select({ variantId: prices.variantId, minQty: prices.minQty, netCents: prices.netCents })
    .from(prices)
    .where(and(eq(prices.groupId, groupId), inArray(prices.variantId, variantIds)));
  for (const r of rows) map.set(r.variantId, [...(map.get(r.variantId) ?? []), { minQty: r.minQty, netCents: r.netCents }]);
  return map;
}

/** Turn DB rows into localized cards with group pricing + stock levels. */
export async function toCards(ctx: ShopContext, ids: number[]): Promise<ProductCard[]> {
  if (!ids.length) return [];
  const db = await getDb();
  const rows = await db.query.products.findMany({
    where: inArray(p.id, ids),
    with: undefined,
  });
  const vrows = await db.select().from(v).where(and(inArray(v.productId, ids), eq(v.active, true))).orderBy(asc(v.sort), desc(v.vintage));
  const prodIds = [...new Set(rows.map((r) => r.producerId).filter((x): x is number => !!x))];
  const catIds = [...new Set(rows.map((r) => r.categoryId).filter((x): x is number => !!x))];
  const [prods, cats, tiers] = await Promise.all([
    prodIds.length ? db.select().from(pr).where(inArray(pr.id, prodIds)) : [],
    catIds.length ? db.select().from(c).where(inArray(c.id, catIds)) : [],
    tiersFor(vrows.map((x) => x.id), ctx.group?.id),
  ]);
  const custom = ctx.showPrices ? await customerTiers(ctx, vrows) : null;
  const rules = ctx.showPrices ? await rulesFor(ctx) : [];
  const facts = rules.length ? await factsFor(vrows.map((x) => { const prod = rows.find((r) => r.id === x.productId); return { productId: x.productId, variantId: x.id, categoryId: prod?.categoryId ?? null, producerId: prod?.producerId ?? null, discountGroup: x.discountGroup }; })) : null;
  const priced = (x: (typeof vrows)[number], taxClass: "standard" | "reduced") => {
    const base = priceFor({ listGross: x.priceCents, taxRate: taxRate(ctx, taxClass), group: ctx.group, tiers: custom?.get(x.id) ?? tiers.get(x.id) ?? [] });
    // live ERP prices already include the customer's conditions
    if (!facts || custom?.has(x.id)) return base;
    return withConditions(base, applyConditions({ listNet: base.net, qty: 1, facts: facts.get(x.id)!, rules, mode: ctx.shop.priceFinding }));
  };
  const byId = new Map(rows.map((r) => [r.id, r]));
  const { stockDisplay, stockLow, stockHigh } = ctx.shop;

  return ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => {
      const producer = prods.find((x) => x.id === r.producerId);
      const cat = cats.find((x) => x.id === r.categoryId);
      return {
        id: r.id,
        slug: r.slug,
        name: tl(r.name, ctx.locale),
        kind: r.kind,
        color: r.color,
        image: r.image,
        organic: r.organic,
        promo: r.promo,
        isNew: r.isNew,
        tradeOnly: r.tradeOnly,
        producer: producer ? { name: producer.name, slug: producer.slug } : null,
        category: cat ? { name: tl(cat.name, ctx.locale), slug: cat.slug } : null,
        country: r.country,
        region: r.region,
        variants: vrows
          .filter((x) => x.productId === r.id)
          .map((x) => ({
            id: x.id,
            sku: x.sku,
            vintage: x.vintage,
            size: x.size,
            packSize: x.packSize,
            stock: stockLevel(x.stock, stockLow, stockHigh),
            stockQty: stockDisplay === "exact" ? x.stock : null,
            price: ctx.showPrices ? priced(x, r.taxClass) : null,
          })),
      };
    });
}

export type SearchParams = {
  q?: string;
  category?: string;
  producer?: string;
  kind?: string;
  sort?: string;
  page?: number;
  perPage?: number;
  promo?: boolean;
  region?: string;
  origin?: string;
};

export async function categoryAndDescendants(slug: string): Promise<number[]> {
  const db = await getDb();
  const all = await db.select({ id: c.id, parentId: c.parentId, slug: c.slug }).from(c);
  const root = all.find((x) => x.slug === slug);
  if (!root) return [];
  const out = [root.id];
  for (let i = 0; i < out.length; i++) for (const x of all) if (x.parentId === out[i]) out.push(x.id);
  return out;
}

/** Products this request may see: active, trade-only only for trade customers, within the storefront's assortment. */
export function visibleProducts(ctx: Pick<ShopContext, "isTrade" | "storefront"> & { assortment?: string[] | null }): SQL {
  return and(
    eq(p.active, true),
    ctx.isTrade ? undefined : eq(p.tradeOnly, false),
    catalogScope(ctx.storefront),
    // the customer's own assortment from vinX (ArticleSelectionCode)
    ctx.assortment?.length ? sql`exists (select 1 from ${schema.variants} where ${schema.variants.productId} = ${p.id} and ${inArray(schema.variants.erpId, ctx.assortment)})` : undefined,
  )!;
}

export async function searchProducts(ctx: ShopContext, params: SearchParams) {
  const db = await getDb();
  const where: SQL[] = [visibleProducts(ctx)];
  if (params.kind) where.push(eq(p.kind, params.kind as "wine"));
  if (params.promo) where.push(eq(p.promo, true));
  if (params.category) {
    const ids = await categoryAndDescendants(params.category);
    where.push(ids.length ? inArray(p.categoryId, ids) : sql`false`);
  }
  if (params.producer) {
    const prod = await db.query.producers.findFirst({ where: eq(pr.slug, params.producer) });
    where.push(prod ? eq(p.producerId, prod.id) : sql`false`);
  }
  where.push(...(await originConditions(params)));
  if (params.q?.trim()) {
    const q = `%${params.q.trim().toLowerCase()}%`;
    where.push(
      or(
        sql`lower(${p.name}::text) like ${q}`,
        sql`lower(coalesce(products.grapes, '') || ' ' || coalesce(products.region, '') || ' ' || coalesce(products.appellation, '')) like ${q}`,
        sql`exists (select 1 from producers pq where pq.id = products.producer_id and lower(pq.name) like ${q})`,
        sql`exists (select 1 from variants vq where vq.product_id = products.id and lower(vq.sku) like ${q})`,
      )!,
    );
  }
  const nameExpr = sql`coalesce(${p.name}->>${ctx.locale}, ${p.name}->>'de')`;
  // Correlated subqueries use explicit aliases (drizzle renders bare column names inside sql``).
  const minPrice = sql.raw(`(select min(vm.price_cents) from variants vm where vm.product_id = products.id)`);
  const order =
    params.sort === "name" ? [asc(nameExpr)]
    : params.sort === "producer" ? [asc(sql.raw(`(select ps.name from producers ps where ps.id = products.producer_id)`)), asc(nameExpr)]
    : params.sort === "price_asc" ? [asc(minPrice)]
    : params.sort === "price_desc" ? [desc(minPrice)]
    : params.sort === "new" ? [desc(p.createdAt)]
    : [desc(p.featured), desc(p.promo), asc(p.categoryId), asc(nameExpr)];

  const perPage = params.perPage ?? 24;
  const page = Math.max(1, params.page ?? 1);
  const cond = and(...where);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(p).where(cond);
  const ids = await db.select({ id: p.id }).from(p).where(cond).orderBy(...order).limit(perPage).offset((page - 1) * perPage);
  return { items: await toCards(ctx, ids.map((x) => x.id)), total: count, page, pages: Math.max(1, Math.ceil(count / perPage)) };
}

export async function categoryTree(ctx: ShopContext) {
  const db = await getDb();
  const rows = await db
    .select({
      id: c.id, slug: c.slug, parentId: c.parentId, name: c.name, image: c.image, sort: c.sort, showOnHome: c.showOnHome,
      count: sql<number>`count(${p.id})::int`,
    })
    .from(c)
    .leftJoin(p, and(eq(p.categoryId, c.id), visibleProducts(ctx)))
    .groupBy(c.id)
    .orderBy(asc(c.sort));
  const nodes = rows.map((r) => ({ ...r, name: tl(r.name, ctx.locale), total: r.count }));
  // roll counts up to parents
  for (const n of [...nodes].reverse()) if (n.parentId) {
    const parent = nodes.find((x) => x.id === n.parentId);
    if (parent) parent.total += n.total;
  }
  // a storefront shows only the categories of its assortment
  return ctx.storefront ? nodes.filter((n) => n.total > 0) : nodes;
}

export async function producerFacets(ctx: ShopContext, limit = 8) {
  const db = await getDb();
  return db
    .select({ slug: pr.slug, name: pr.name, count: sql<number>`count(${p.id})::int` })
    .from(pr)
    .innerJoin(p, and(eq(p.producerId, pr.id), visibleProducts(ctx)))
    .groupBy(pr.id)
    .orderBy(desc(sql`count(${p.id})`), asc(pr.name))
    .limit(limit);
}

export async function productDetail(ctx: ShopContext, slug: string) {
  const db = await getDb();
  const row = await db.query.products.findFirst({ where: and(eq(p.slug, slug), visibleProducts(ctx)) });
  if (!row) return null;
  const [card] = await toCards(ctx, [row.id]);
  const producer = row.producerId ? await db.query.producers.findFirst({ where: eq(pr.id, row.producerId) }) : null;
  const sameProducer = producer
    ? await db.select({ id: p.id }).from(p).where(and(eq(p.producerId, producer.id), visibleProducts(ctx), sql`${p.id} <> ${row.id}`)).limit(4)
    : [];
  const sameCategory = row.categoryId
    ? await db.select({ id: p.id }).from(p).where(and(eq(p.categoryId, row.categoryId), visibleProducts(ctx), sql`${p.id} <> ${row.id}`)).orderBy(desc(p.featured)).limit(4)
    : [];
  return {
    card,
    description: tl(row.description, ctx.locale),
    short: tl(row.short, ctx.locale),
    pairing: tl(row.pairing, ctx.locale),
    appellation: row.appellation,
    grapes: row.grapes,
    alcohol: row.alcohol,
    taxClass: row.taxClass,
    erp: row.erpDetails ?? null,
    erpLinks: await erpLinks(ctx, row.erpDetails),
    producer: producer ? { name: producer.name, slug: producer.slug, logo: producer.logo, region: producer.region, country: producer.country, description: tl(producer.description, ctx.locale) } : null,
    moreFromProducer: await toCards(ctx, sameProducer.map((x) => x.id)),
    related: await toCards(ctx, sameCategory.map((x) => x.id)),
  };
}

/** All producers with the number of products visible in this shop (ctx omitted: all active products). */
/** vinX set contents and substitute article → shop products (name + link), only those visible in this shop. */
async function erpLinks(ctx: ShopContext, d: ErpDetails | null) {
  const ids = [...(d?.set ?? []).map((x) => x.articleId), ...(d?.substitute?.articleId ? [d.substitute.articleId] : [])];
  if (!ids.length) return { set: [], substitute: null };
  const db = await getDb();
  const rows = await db.select({ erpId: schema.variants.erpId, slug: p.slug, name: p.name, size: schema.variants.size }).from(schema.variants)
    .innerJoin(p, eq(p.id, schema.variants.productId)).where(and(inArray(schema.variants.erpId, ids), visibleProducts(ctx)));
  const find = (id: string) => rows.find((r) => r.erpId === id);
  return {
    set: (d?.set ?? []).map((x) => ({ amount: x.amount, item: find(x.articleId) })).filter((x) => x.item).map((x) => ({ amount: x.amount, slug: x.item!.slug, name: tl(x.item!.name, ctx.locale), size: x.item!.size })),
    substitute: d?.substitute ? { text: d.substitute.text ?? null, product: d.substitute.articleId && find(d.substitute.articleId) ? { slug: find(d.substitute.articleId)!.slug, name: tl(find(d.substitute.articleId)!.name, ctx.locale) } : null } : null,
  };
}

export async function producersList(ctx?: Pick<ShopContext, "isTrade" | "storefront">) {
  const db = await getDb();
  return db
    .select({
      id: pr.id, slug: pr.slug, name: pr.name, region: pr.region, country: pr.country, logo: pr.logo, featured: pr.featured, description: pr.description,
      count: sql<number>`count(${p.id})::int`,
    })
    .from(pr)
    .leftJoin(p, and(eq(p.producerId, pr.id), ctx ? visibleProducts(ctx) : eq(p.active, true)))
    .groupBy(pr.id)
    .orderBy(desc(pr.featured), asc(pr.name));
}

export async function homeCollections(ctx: ShopContext) {
  const db = await getDb();
  const base = visibleProducts(ctx);
  const promo = await db.select({ id: p.id }).from(p).where(and(base, eq(p.promo, true))).orderBy(desc(p.updatedAt)).limit(12);
  const featured = await db.select({ id: p.id }).from(p).where(and(base, eq(p.featured, true))).orderBy(desc(p.updatedAt)).limit(8);
  return {
    promo: await toCards(ctx, promo.map((x) => x.id)),
    featured: await toCards(ctx, featured.map((x) => x.id)),
  };
}
