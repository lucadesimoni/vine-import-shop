import { Link, useSearchParams } from "react-router";
import { ArrowLeft, ArrowRight, Globe2, List, Map as MapIcon, X } from "lucide-react";
import { sql } from "drizzle-orm";
import type { Route } from "./+types/producers";
import { shopContext } from "~/.server/context";
import { producersList, searchProducts, visibleProducts } from "~/.server/catalog";
import { originFacets } from "~/.server/origins";
import { getDb, schema } from "~/.server/db";
import { metaT, useI18n, type MessageKey } from "~/lib/i18n";
import { cn } from "~/lib/cn";
import { useRootData } from "~/lib/root-data";
import { ButtonLink, Chip, Eyebrow } from "~/components/ui";
import { ProductGrid } from "~/components/shop";
import { RegionMap, WorldDotMap, countryName } from "~/components/origin-map";
import { hasRegionMap, loadRegionMap } from "~/lib/maps/regions";
import { ProducerLogo } from "~/components/producer";

const KINDS = ["wine", "food", "spirit", "beverage"] as const;

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = context.get(shopContext);
  if (!ctx.shop.modules.producers) throw new Response("Not found", { status: 404 });
  const q = new URL(request.url).searchParams;
  const kind = KINDS.find((k) => k === q.get("kind")) ?? null;
  const region = q.get("region");
  const origin = q.get("origin")?.toUpperCase() ?? null;
  const cfg = ctx.shop.originMap;
  const db = await getDb();

  const [facets, producers, kindRows] = await Promise.all([
    originFacets(ctx, kind),
    producersList(ctx),
    db.select({ kind: schema.products.kind, n: sql<number>`count(*)::int` }).from(schema.products).where(visibleProducts(ctx)).groupBy(schema.products.kind),
  ]);

  // Which views make sense: region map of the home country (if a map exists and it has products), world map, A–Z
  const home = facets.countries.find((c) => c.iso === cfg.country);
  const canRegions = hasRegionMap(cfg.country) && !!home && facets.regions.some((r) => r.country === cfg.country);
  // the world map can be switched off in the admin: then region maps (home country, or any country with a map) and A–Z remain
  const world = cfg.world;
  const auto = canRegions && (!world || home!.count / Math.max(1, facets.total) >= 0.6) ? "regions" : world ? "world" : "az";
  const preferred = cfg.mode === "auto" ? auto : cfg.mode === "regions" && !canRegions ? (world ? "world" : "az") : cfg.mode === "world" && !world ? auto : cfg.mode;
  const asked = q.get("view");
  const view: "regions" | "world" | "az" =
    cfg.mode === "off" || asked === "az" ? "az" : asked === "world" && world ? "world" : asked === "regions" && canRegions ? "regions" : (preferred as "regions" | "world" | "az");
  // Drill-down: a country picked on the world map (or as a chip) that has its own region map shows its regions
  const hasRegions = (iso: string | null) => !!iso && hasRegionMap(iso) && facets.regions.some((r) => r.country === iso);
  const mapCountry = view !== "az" && hasRegions(origin) ? origin : view === "regions" ? cfg.country : null;
  const regionMap = mapCountry ? await loadRegionMap(mapCountry) : null;

  const selRegion = region ? facets.regions.find((r) => r.id === region && (!mapCountry || r.country === mapCountry)) ?? null : null;
  const selCountry = !selRegion && origin ? facets.countries.find((c) => c.iso === origin) ?? null : null;
  const products = selRegion || selCountry ? await searchProducts(ctx, { region: selRegion?.id, origin: selCountry?.iso, kind: kind ?? undefined, perPage: 4 }) : null;
  const logos = new Map(producers.map((p) => [p.slug, p.logo]));
  const withLogo = <T extends { slug: string }>(list: T[]) => list.map((p) => ({ ...p, logo: logos.get(p.slug) ?? null }));

  return {
    view, kind, homeCountry: cfg.country, mapCountry, regionMap,
    views: (cfg.mode === "off" ? ["az"] : [...(canRegions ? ["regions"] : []), ...(world ? ["world"] : []), "az"]) as ("regions" | "world" | "az")[],
    kinds: kindRows.filter((k) => k.n > 0).map((k) => k.kind),
    facets,
    selected: selRegion
      ? { type: "region" as const, ...selRegion, producers: withLogo(selRegion.producers) }
      : selCountry ? { type: "country" as const, id: selCountry.iso, name: "", country: selCountry.iso, count: selCountry.count, producers: withLogo(selCountry.producers) } : null,
    products,
    producers: producers.filter((p) => p.count > 0),
  };
}

export const meta: Route.MetaFunction = ({ matches }) => {
  const root = matches[0].loaderData as { brand: { name: string }; shop: { terms: { producers: string } } } | undefined;
  const t = metaT(matches);
  return [{ title: `${t(`term.producers.${root?.shop.terms.producers ?? "producers"}` as MessageKey)} · ${t("origin.eyebrow")} · ${root?.brand.name ?? ""}` }];
};

export default function Producers({ loaderData }: Route.ComponentProps) {
  const { view, views, kind, kinds, facets, selected, products, producers, homeCountry, mapCountry, regionMap } = loaderData;
  const { t, locale } = useI18n();
  const { shop } = useRootData();
  const [params] = useSearchParams();
  const link = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    const s = next.toString();
    return s ? `?${s}` : "?";
  };
  const shopLink = (extra: Record<string, string>) => `/shop?${new URLSearchParams({ ...(kind ? { kind } : {}), ...extra })}`;
  const showRegions = !!regionMap && !!mapCountry;
  // keep the country in the URL when its regions are shown away from the home country (world drill-down, country chips)
  const regionLink = (id: string) => link({ region: id, origin: view === "regions" && mapCountry === homeCountry ? null : mapCountry });
  const regionAreas = showRegions ? facets.regions.filter((r) => r.country === mapCountry) : [];
  const areaName = selected ? (selected.type === "region" ? selected.name : countryName(selected.id, locale)) : "";
  const otherCountries = view === "regions" ? facets.countries.filter((c) => c.iso !== homeCountry) : [];
  const listAreas = showRegions
    ? regionAreas.map((r) => ({ id: r.id, name: r.name, count: r.count, producers: r.producers, to: regionLink(r.id) }))
    : facets.countries.map((c) => ({ id: c.iso, name: countryName(c.iso, locale), count: c.count, producers: c.producers, to: link({ origin: c.iso, region: null }) }));
  const viewLabel = { regions: t("origin.viewRegions"), world: t("origin.viewWorld"), az: t("origin.az") };

  return (
    <div className="container-page page-top">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8">
        <div className="grid gap-3">
          <Eyebrow line>{t("origin.eyebrow")}</Eyebrow>
          <h1 className="text-h1">{t(`term.producers.${shop.terms.producers}` as MessageKey)}</h1>
          <p className="max-w-2xl text-muted-fg">{t("origin.intro", { producers: producers.length, areas: showRegions ? regionAreas.length : facets.countries.length })}</p>
        </div>
        {views.length > 1 && (
          <nav className="flex rounded-control border border-border bg-surface p-1" aria-label={t("origin.view")}>
            {views.map((v) => (
              <Link key={v} to={link({ view: v, region: null, origin: null })} preventScrollReset aria-current={view === v ? "page" : undefined} className={cn("btn-label btn-text-sm flex h-9 items-center gap-2 rounded-btn px-4 transition-colors", view === v ? "bg-fg text-bg" : "text-muted-fg hover:text-fg")}>
                {v === "regions" && <MapIcon size={14} />}{v === "world" && <Globe2 size={14} />}{v === "az" && <List size={14} />} {viewLabel[v]}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {view !== "az" ? (
        <>
          {kinds.length > 1 && (
            <div className="mb-8 flex flex-wrap gap-2" role="group" aria-label={t("origin.kind")}>
              <Chip to={link({ kind: null })} active={!kind} preventScrollReset>{t("common.all")}</Chip>
              {kinds.map((k) => <Chip key={k} to={link({ kind: k })} active={kind === k} preventScrollReset>{t(`kind.${k}` as MessageKey)}</Chip>)}
            </div>
          )}
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
            <div className="grid content-start gap-6 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]">
              <div className="flex items-center justify-between gap-4">
                <p className="text-eyebrow text-label text-muted-fg">{showRegions ? t("origin.chooseRegion") : t("origin.chooseCountry")}</p>
                {mapCountry && (view === "world" || mapCountry !== homeCountry) && (
                  <Link to={link({ origin: null, region: null })} preventScrollReset className="flex items-center gap-1.5 text-note text-muted-fg hover:text-fg"><ArrowLeft size={14} /> {view === "world" ? t("origin.backToWorld") : countryName(homeCountry, locale)}</Link>
                )}
              </div>
              <div className={cn("flex w-full justify-center", showRegions && "lg:justify-start")}>
                {showRegions ? (
                  <RegionMap map={regionMap!} data={regionAreas.map((r) => ({ id: r.id, count: r.count }))} selected={selected?.type === "region" ? selected.id : null} href={regionLink} locale={locale} label={t("origin.mapLabel")} className="h-auto max-h-[calc(100vh-var(--header-h)-9rem)] w-full max-w-[560px]" />
                ) : (
                  <WorldDotMap zoomable labels={{ zoomIn: t("origin.zoomIn"), zoomOut: t("origin.zoomOut"), reset: t("origin.zoomReset"), europe: t("origin.europe") }} data={facets.countries.map((c) => ({ id: c.iso, count: c.count }))} selected={selected?.id} href={(iso) => link({ origin: iso, region: null })} locale={locale} label={t("origin.mapLabel")} />
                )}
              </div>
              <Legend />
              {otherCountries.length > 0 && (
                <div className="grid gap-3 border-t border-border pt-5">
                  <p className="text-eyebrow text-2xs text-muted-fg">{t("origin.otherCountries")}</p>
                  <div className="flex flex-wrap gap-2">
                    {otherCountries.map((c) => <Chip key={c.iso} to={link({ origin: c.iso, region: null })} active={selected?.id === c.iso} preventScrollReset>{countryName(c.iso, locale)} · {c.count}</Chip>)}
                  </div>
                </div>
              )}
            </div>

            <section className="grid content-start gap-8" aria-live="polite">
              {selected ? (
                <>
                  <div className="grid gap-3">
                    <div className="flex items-center justify-between gap-4">
                      <Eyebrow className="text-label text-primary">{selected.type === "region" ? countryName(selected.country, locale) : t("origin.country")}</Eyebrow>
                      <Link to={link({ region: null, origin: view === "world" && selected.type === "region" ? mapCountry : null })} preventScrollReset className="flex items-center gap-1.5 text-note text-muted-fg hover:text-fg"><X size={14} /> {t("origin.reset")}</Link>
                    </div>
                    <h2 className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-h1">
                      {areaName}
                      <span className="border-l border-border pl-4 font-sans text-base text-muted-fg">{t("origin.count", { products: selected.count, producers: selected.producers.length })}</span>
                    </h2>
                  </div>
                  <ProducerList producers={selected.producers} />
                  {products && products.items.length > 0 && <ProductGrid products={products.items} className="grid-cols-2 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-4" />}
                  <ButtonLink to={shopLink(selected.type === "region" ? { region: selected.id } : { origin: selected.id })} variant="secondary" className="w-fit">
                    {t("origin.allProducts", { n: selected.count, area: areaName })} <ArrowRight size={15} />
                  </ButtonLink>
                </>
              ) : (
                <>
                  <div className="grid gap-3">
                    <Eyebrow className="text-label text-primary">{mapCountry && view === "world" ? countryName(mapCountry, locale) : t("origin.overview")}</Eyebrow>
                    <h2 className="text-h2">{t(showRegions ? "origin.regionsCount" : "origin.countriesCount", { n: listAreas.length })}</h2>
                    <p className="text-muted-fg">{t("origin.hint")}</p>
                  </div>
                  <ol className="grid gap-1">
                    {listAreas.map((a) => {
                      const max = listAreas[0]?.count ?? 1;
                      return (
                        <li key={a.id}>
                          <Link to={a.to} preventScrollReset className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 rounded-control px-3 py-2.5 transition-colors hover:bg-muted">
                            <span className="font-display text-lg leading-tight group-hover:text-primary">{a.name}</span>
                            <span className="text-note text-muted-fg tabular-nums">{t("origin.count", { products: a.count, producers: a.producers.length })}</span>
                            <span className="col-span-2 h-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary/70" style={{ width: `${Math.max(6, (a.count / max) * 100)}%` }} /></span>
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
            </section>
          </div>
        </>
      ) : (
        <AZ producers={producers} />
      )}
    </div>
  );
}

/** Producer rows with logo → producer page. */
function ProducerList({ producers }: { producers: { slug: string; name: string; count: number; logo: string | null }[] }) {
  return (
    <ul className="grid gap-x-8 sm:grid-cols-2">
      {producers.map((p) => (
        <li key={p.slug}>
          <Link to={`/producers/${p.slug}`} className="group flex items-center justify-between gap-3 border-b border-border py-3">
            <span className="flex min-w-0 items-center gap-3">
              <ProducerLogo name={p.name} logo={p.logo} size="sm" />
              <span className="truncate font-display text-lg leading-tight group-hover:text-primary">{p.name}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-fg tabular-nums">{p.count} <ArrowRight size={12} /></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Legend() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 text-xs text-muted-fg">
      <span>{t("origin.few")}</span>
      <span className="h-2 w-28 rounded-full" style={{ background: "linear-gradient(90deg, color-mix(in oklab, var(--t-primary) 22%, var(--t-card)), var(--t-primary))" }} />
      <span>{t("origin.many")}</span>
    </div>
  );
}

function AZ({ producers }: { producers: Route.ComponentProps["loaderData"]["producers"] }) {
  const groups = new Map<string, typeof producers>();
  for (const p of producers) {
    const k = p.name.charAt(0).toUpperCase();
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return (
    <div className="grid gap-12">
      {[...groups].sort(([a], [b]) => a.localeCompare(b)).map(([letter, list]) => (
        <section key={letter} className="grid gap-4 border-t border-border pt-6 md:grid-cols-[80px_1fr]">
          <h2 className="font-display text-4xl text-primary">{letter}</h2>
          <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => (
              <li key={p.id}>
                <Link to={`/producers/${p.slug}`} className="group flex items-center justify-between gap-3 border-b border-border py-3">
                  <span className="flex min-w-0 items-center gap-3">
                  <ProducerLogo name={p.name} logo={p.logo} size="sm" />
                  <span className="grid">
                    <span className="font-display text-lg leading-tight group-hover:text-primary">{p.name}</span>
                    {p.region && <span className="text-xs text-muted-fg">{p.region}</span>}
                  </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-fg tabular-nums">{p.count} <ArrowRight size={12} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
