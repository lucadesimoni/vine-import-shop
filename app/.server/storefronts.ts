import { and, eq, inArray, notInArray, or, type SQL } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { StorefrontCatalog } from "./db/schema";

export type Storefront = typeof schema.storefronts.$inferSelect;

/** Active storefronts, cached briefly (resolved on every request). */
let cache: { at: number; list: Storefront[] } | null = null;
export async function listStorefronts(): Promise<Storefront[]> {
  if (cache && Date.now() - cache.at < 15_000) return cache.list;
  const db = await getDb();
  const list = await db.select().from(schema.storefronts);
  cache = { at: Date.now(), list };
  return list;
}
export const invalidateStorefronts = () => { cache = null; };

export const normHost = (h: string) => h.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").replace(/^www\./, "");

/** Preview without DNS: `?storefront=<slug>` sets this cookie (`?storefront=main` clears it). */
export const PREVIEW_COOKIE = "sf_preview";

/**
 * Which storefront serves this request: by host name (its own domain), else the preview cookie / parameter.
 * null = the main shop (the platform's own brand and settings).
 */
export async function resolveStorefront(request: Request): Promise<Storefront | null> {
  const url = new URL(request.url);
  const list = (await listStorefronts()).filter((s) => s.active);
  if (!list.length) return null;
  const host = normHost(request.headers.get("X-Forwarded-Host") ?? url.host);
  const byHost = list.find((s) => s.hosts.some((h) => normHost(h) === host));
  if (byHost) return byHost;
  const asked = url.searchParams.get("storefront") ?? request.headers.get("Cookie")?.match(new RegExp(`(?:^|;\\s*)${PREVIEW_COOKIE}=([a-z0-9-]+)`))?.[1];
  return asked ? list.find((s) => s.slug === asked) ?? null : null;
}

/** Set-Cookie header when the request switches the preview storefront, else null. */
export function previewCookie(request: Request): string | null {
  const v = new URL(request.url).searchParams.get("storefront");
  if (v == null) return null;
  return v && v !== "main" ? `${PREVIEW_COOKIE}=${encodeURIComponent(v)}; Path=/; SameSite=Lax; Max-Age=86400` : `${PREVIEW_COOKIE}=; Path=/; Max-Age=0`;
}

export const emptyCatalog = (): StorefrontCatalog => ({ kinds: [], categoryIds: [], producerIds: [], includeIds: [], excludeIds: [] });

/** SQL condition: product offered in this storefront (null = main shop = everything). */
export function catalogScope(sf: Pick<Storefront, "catalog"> | null): SQL | undefined {
  if (!sf) return undefined;
  const c = { ...emptyCatalog(), ...sf.catalog };
  const p = schema.products;
  const rules = [
    c.kinds.length ? inArray(p.kind, c.kinds as ("wine" | "food")[]) : undefined,
    c.categoryIds.length ? inArray(p.categoryId, c.categoryIds) : undefined,
    c.producerIds.length ? inArray(p.producerId, c.producerIds) : undefined,
  ].filter(Boolean) as SQL[];
  const ruled = rules.length ? and(...rules) : undefined;
  const included = c.includeIds.length ? (ruled ? or(ruled, inArray(p.id, c.includeIds)) : undefined) : ruled;
  return and(included, c.excludeIds.length ? notInArray(p.id, c.excludeIds) : undefined);
}

export async function storefrontById(id: number | null | undefined) {
  if (!id) return null;
  return (await listStorefronts()).find((s) => s.id === id) ?? null;
}

export async function storefrontBySlug(slug: string | null | undefined) {
  if (!slug) return null;
  return (await listStorefronts()).find((s) => s.slug === slug) ?? null;
}

export async function deleteStorefront(id: number) {
  const db = await getDb();
  await db.delete(schema.storefronts).where(eq(schema.storefronts.id, id));
  invalidateStorefronts();
}
