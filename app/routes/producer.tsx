import { eq } from "drizzle-orm";
import { Link } from "react-router";
import { ArrowLeft, ArrowRight, ArrowUpRight, MapPin } from "lucide-react";
import type { Route } from "./+types/producer";
import { shopContext } from "~/.server/context";
import { searchProducts } from "~/.server/catalog";
import { countryIso, regionId, regionNameOf } from "~/.server/origins";
import { getDb, schema } from "~/.server/db";
import { tl } from "~/lib/localized";
import { renderMarkdown } from "~/lib/markdown";
import { loadRegionMap } from "~/lib/maps/regions";
import { useI18n } from "~/lib/i18n";
import { ButtonLink, Eyebrow } from "~/components/ui";
import { ProductGrid } from "~/components/shop";
import { ProducerLogo } from "~/components/producer";
import { RegionMap, WorldDotMap, countryName } from "~/components/origin-map";

export async function loader({ params, context }: Route.LoaderArgs) {
  const ctx = context.get(shopContext);
  if (!ctx.shop.modules.producers) throw new Response("Not found", { status: 404 });
  const db = await getDb();
  const producer = await db.query.producers.findFirst({ where: eq(schema.producers.slug, params.slug) });
  if (!producer) throw new Response("Not found", { status: 404 });
  const products = await searchProducts(ctx, { producer: producer.slug, perPage: 48 });
  const iso = countryIso(producer.country);
  const rid = regionId(iso, producer.region);
  return {
    producer: {
      slug: producer.slug, name: producer.name, logo: producer.logo, website: producer.website, region: producer.region,
      descriptionHtml: renderMarkdown(tl(producer.description, ctx.locale)),
    },
    origin: { iso, regionId: rid, regionName: iso && rid ? regionNameOf(iso, rid, ctx.locale) : producer.region },
    regionMap: iso && rid && ctx.shop.originMap.mode !== "off" ? await loadRegionMap(iso) : null,
    mapEnabled: ctx.shop.originMap.mode !== "off" && (ctx.shop.originMap.world || !!(iso && rid)),
    products,
  };
}

export const meta: Route.MetaFunction = ({ loaderData, matches }) => {
  const root = matches[0].loaderData as { brand: { name: string } } | undefined;
  if (!loaderData) return [{ title: root?.brand.name ?? "" }];
  const desc = loaderData.producer.descriptionHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  return [{ title: `${loaderData.producer.name} · ${root?.brand.name ?? ""}` }, { name: "description", content: desc }];
};

export default function Producer({ loaderData }: Route.ComponentProps) {
  const { producer: p, origin, regionMap, mapEnabled, products } = loaderData;
  const { t, locale } = useI18n();
  const categories = [...new Set(products.items.map((x) => x.category?.name).filter(Boolean))] as string[];
  const place = [origin.regionName, origin.iso ? countryName(origin.iso, locale) : null].filter(Boolean).join(", ");
  const mapHref = origin.regionId ? `/producers?view=${regionMap ? "regions" : "world"}&region=${origin.regionId}${regionMap ? "" : `&origin=${origin.iso}`}` : origin.iso ? `/producers?view=world&origin=${origin.iso}` : "/producers";

  return (
    <div className="container-page page-top">
      <Link to="/producers" className="mb-8 inline-flex items-center gap-1.5 text-note text-muted-fg hover:text-fg"><ArrowLeft size={14} /> {t("producer.back")}</Link>

      <header className="grid gap-10 border-b border-border pb-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:gap-16">
        <div className="grid content-start gap-6">
          <div className="flex items-center gap-5">
            <ProducerLogo name={p.name} logo={p.logo} size="lg" />
            <div className="grid gap-2">
              <Eyebrow line>{t("producer.eyebrow")}</Eyebrow>
              <h1 className="text-h1">{p.name}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-fg">
            {place && <span className="flex items-center gap-1.5"><MapPin size={15} strokeWidth={1.6} /> {place}</span>}
            {p.website && (
              <a href={p.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 underline-offset-4 hover:text-fg hover:underline">
                {t("producer.website")} <ArrowUpRight size={13} />
              </a>
            )}
          </div>
          {p.descriptionHtml ? (
            <div className="prose-shop max-w-2xl text-body leading-relaxed" dangerouslySetInnerHTML={{ __html: p.descriptionHtml }} />
          ) : (
            <dl className="flex flex-wrap gap-x-10 gap-y-4 border-t border-border pt-6">
              <div className="grid gap-1"><dt className="text-eyebrow text-2xs text-muted-fg">{t("producer.range")}</dt><dd className="font-display text-2xl tabular-nums">{products.total}</dd></div>
              {categories.length > 0 && <div className="grid gap-1"><dt className="text-eyebrow text-2xs text-muted-fg">{t("producer.categories")}</dt><dd className="text-body">{categories.join(" · ")}</dd></div>}
            </dl>
          )}
        </div>

        {mapEnabled && origin.iso && (
          <Link to={mapHref} className="group grid content-start gap-3 rounded-surface border border-border bg-card p-5 transition-colors hover:border-border-strong" aria-label={`${t("producer.onMap")}: ${place}`}>
            <span className="flex items-center justify-between text-eyebrow text-2xs text-muted-fg">{t("producer.origin")} <span className="flex items-center gap-1 normal-case tracking-normal group-hover:text-fg">{t("producer.onMap")} <ArrowRight size={12} /></span></span>
            <div className="pointer-events-none">
              {regionMap && origin.regionId ? (
                <RegionMap map={regionMap} data={[{ id: origin.regionId, count: 1 }]} selected={origin.regionId} href={() => mapHref} locale={locale} label={place} markers={false} className="mx-auto h-auto max-h-60 w-full" />
              ) : (
                <WorldDotMap data={[{ id: origin.iso, count: 1 }]} selected={origin.iso} href={() => mapHref} locale={locale} label={place} compact />
              )}
            </div>
          </Link>
        )}
      </header>

      <section className="grid gap-8 pt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-h2">{t("producer.products", { name: p.name })}</h2>
          {products.total > products.items.length && (
            <ButtonLink to={`/shop?producer=${p.slug}`} variant="secondary" size="sm">{t("producer.allProducts", { n: products.total })} <ArrowRight size={14} /></ButtonLink>
          )}
        </div>
        <ProductGrid products={products.items} />
      </section>
    </div>
  );
}
