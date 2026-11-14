import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/sitemap";
import { getDb, schema } from "~/.server/db";
import { shopContext } from "~/.server/context";
import { visibleProducts } from "~/.server/catalog";
import { shopPages } from "~/.server/pages";

export async function loader({ request, context }: Route.LoaderArgs) {
  const origin = new URL(request.url).origin;
  const db = await getDb();
  const ctx = context.get(shopContext);
  const shop = ctx.shop;
  const [products, producers, pages] = await Promise.all([
    db.select({ slug: schema.products.slug, updatedAt: schema.products.updatedAt }).from(schema.products).where(visibleProducts({ isTrade: false, storefront: ctx.storefront })),
    // producer pages with at least one visible product
    shop.modules.producers
      ? db.selectDistinct({ slug: schema.producers.slug }).from(schema.producers).innerJoin(schema.products, and(eq(schema.products.producerId, schema.producers.id), visibleProducts({ isTrade: false, storefront: ctx.storefront })))
      : Promise.resolve([] as { slug: string }[]),
    shopPages(ctx.storefront?.id ?? null),
  ]);
  const m = shop.modules;
  const urls: { u: string; mod?: Date | null }[] = [
    ...["/", "/shop", ...(m.producers ? ["/producers"] : []), ...(m.trade ? ["/trade"] : []), ...(m.story ? ["/story"] : []), "/contact"].map((u) => ({ u })),
    ...pages.map((p) => ({ u: `/page/${p.slug}`, mod: p.updatedAt })),
    ...producers.map((p) => ({ u: `/producers/${p.slug}` })),
    ...products.map((p) => ({ u: `/product/${p.slug}`, mod: p.updatedAt })),
  ];
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  // language variants: ?lang=xx (canonical URLs keep it), x-default = without parameter
  const alt = (u: string) => shop.locales.length < 2 ? "" : shop.locales.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${esc(`${origin}${u}?lang=${l}`)}"/>`).join("") + `<xhtml:link rel="alternate" hreflang="x-default" href="${esc(origin + u)}"/>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.map(({ u, mod }) => `<url><loc>${esc(origin + u)}</loc>${mod ? `<lastmod>${mod.toISOString().slice(0, 10)}</lastmod>` : ""}${alt(u)}</url>`).join("")}</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" } });
}
