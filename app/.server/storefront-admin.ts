import { and, count, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { StorefrontCatalog } from "./db/schema";
import { seedLegalStubs } from "./seed/legal";
import { dropStorefrontSettings, getSettings, saveSetting } from "./settings";
import { catalogScope, emptyCatalog, invalidateStorefronts, normHost } from "./storefronts";

export const parseHosts = (v: string) => [...new Set(v.split(/[\s,;]+/).map(normHost).filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)))];

/**
 * A new storefront starts as a copy of the main shop's brand and settings, as a pure B2C shop
 * (no B2B portal, no trade page), with its own order prefix and legal page templates.
 */
export async function createStorefront(input: { name: string; slug: string; hosts: string; catalog?: Partial<StorefrontCatalog>; guestGroupId?: number | null }) {
  const db = await getDb();
  const [sf] = await db.insert(schema.storefronts).values({
    name: input.name, slug: input.slug, hosts: parseHosts(input.hosts),
    catalog: { ...emptyCatalog(), ...input.catalog }, guestGroupId: input.guestGroupId ?? null,
  }).returning();
  invalidateStorefronts();
  const { brand, shop } = await getSettings("brand", "shop");
  await saveSetting("brand", { ...brand, name: input.name, legalName: input.name, announcement: {} }, sf.slug);
  await saveSetting("shop", {
    ...shop,
    channels: { mode: "shop-only", portalHost: "", shopHost: "" },
    modules: { ...shop.modules, trade: false },
    orderPrefix: input.slug.replace(/[^a-z]/g, "").slice(0, 3).toUpperCase() || "SF",
  }, sf.slug);
  await seedLegalStubs(db, input.name, sf.id);
  return sf;
}

export async function updateStorefront(id: number, patch: Partial<Pick<typeof schema.storefronts.$inferInsert, "name" | "hosts" | "active" | "catalog" | "guestGroupId">>) {
  const db = await getDb();
  await db.update(schema.storefronts).set({ ...patch, updatedAt: new Date() }).where(eq(schema.storefronts.id, id));
  invalidateStorefronts();
}

/** Remove a storefront: its settings overrides and own pages go; orders and customers stay (marked with the old id). */
export async function removeStorefront(id: number) {
  const db = await getDb();
  const sf = await db.query.storefronts.findFirst({ where: eq(schema.storefronts.id, id) });
  if (!sf) return;
  await db.delete(schema.pages).where(eq(schema.pages.storefrontId, id));
  await dropStorefrontSettings(sf.slug);
  await db.delete(schema.storefronts).where(eq(schema.storefronts.id, id));
  invalidateStorefronts();
}

/** Number of products in a storefront's assortment (active ones, as consumers see them). */
export async function assortmentSize(catalog: StorefrontCatalog) {
  const db = await getDb();
  const p = schema.products;
  const [{ n }] = await db.select({ n: count() }).from(p).where(and(eq(p.active, true), eq(p.tradeOnly, false), catalogScope({ catalog })));
  return n;
}

/** SKUs (one per line or comma separated) → product ids */
export async function productIdsForSkus(text: string) {
  const skus = [...new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))];
  if (!skus.length) return [];
  const db = await getDb();
  const rows = await db.select({ id: schema.variants.productId }).from(schema.variants).where(inArray(schema.variants.sku, skus));
  return [...new Set(rows.map((r) => r.id))];
}
