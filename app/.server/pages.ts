import { eq, isNull, or } from "drizzle-orm";
import { getDb, schema } from "./db";

type Page = typeof schema.pages.$inferSelect;

/**
 * Content pages of a shop: the storefront's own pages, plus the main shop's pages it does not replace
 * (same slug). Legal pages (imprint, terms, privacy) are created per storefront when it is set up.
 */
export async function shopPages(storefrontId: number | null): Promise<Page[]> {
  const db = await getDb();
  const p = schema.pages;
  const rows = await db.select().from(p).where(storefrontId ? or(isNull(p.storefrontId), eq(p.storefrontId, storefrontId)) : isNull(p.storefrontId)).orderBy(p.id);
  const own = new Set(rows.filter((r) => r.storefrontId).map((r) => r.slug));
  return rows.filter((r) => r.storefrontId || !own.has(r.slug));
}

export async function findPage(slug: string, storefrontId: number | null) {
  return (await shopPages(storefrontId)).find((p) => p.slug === slug) ?? null;
}
