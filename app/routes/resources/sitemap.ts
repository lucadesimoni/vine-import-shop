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
  const products = await db.select({ slug: schema.products.slug, updatedAt: schema.products.updatedAt }).from(schema.products).where(visibleProducts({ isTrade: false, storefront: ctx.storefront }));
  const pages = await shopPages(ctx.storefront?.id ?? null);
  const m = shop.modules;
  const urls = ["/", "/shop", ...(m.producers ? ["/producers"] : []), ...(m.trade ? ["/trade"] : []), ...(m.story ? ["/story"] : []), "/contact", ...pages.map((p) => `/page/${p.slug}`), ...products.map((p) => `/product/${p.slug}`)];
  const alt = (u: string) => shop.locales.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${origin}${u}?lang=${l}"/>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.map((u) => `<url><loc>${origin}${u}</loc>${alt(u)}</url>`).join("")}</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" } });
}
