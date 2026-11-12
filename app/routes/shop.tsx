import { Form, Link, useNavigation, useSearchParams, useSubmit } from "react-router";
import { Map as MapIcon, Search, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import type { Route } from "./+types/shop";
import { shopContext } from "~/.server/context";
import { categoryTree, producerFacets, searchProducts } from "~/.server/catalog";
import { originFacets } from "~/.server/origins";
import { countryName, regionName } from "~/lib/maps/names";
import type { MessageKey } from "~/lib/i18n";
import { useI18n } from "~/lib/i18n";
import { cn } from "~/lib/cn";
import { useRootData } from "~/lib/root-data";
import { Button, Chip, EmptyState, Eyebrow, Input, Select } from "~/components/ui";
import { ProductGrid } from "~/components/shop";

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = context.get(shopContext);
  const url = new URL(request.url);
  const q = url.searchParams;
  const params = {
    q: q.get("q") ?? "",
    category: q.get("category") ?? "",
    producer: q.get("producer") ?? "",
    sort: q.get("sort") ?? "",
    promo: q.get("promo") === "1",
    kind: q.get("kind") ?? "",
    region: q.get("region") ?? "",
    origin: q.get("origin")?.toUpperCase() ?? "",
    page: Number(q.get("page") ?? 1),
  };
  const [result, categories, producers, origins] = await Promise.all([
    searchProducts(ctx, { ...params, kind: params.kind || undefined, region: params.region || undefined, origin: params.origin || undefined, perPage: 24 }),
    categoryTree(ctx),
    producerFacets(ctx, 12),
    originFacets(ctx),
  ]);
  return { result, categories, producers, params, origins: { regions: origins.regions.slice(0, 10).map((r) => ({ id: r.id, count: r.count })), countries: origins.countries.map((c) => ({ iso: c.iso, count: c.count })) }, mapEnabled: ctx.shop.originMap.mode !== "off" };
}

export const meta: Route.MetaFunction = ({ matches }) => {
  const root = matches[0].loaderData as { brand: { name: string } } | undefined;
  return [{ title: `Shop · ${root?.brand.name ?? ""}` }];
};

export default function Shop({ loaderData }: Route.ComponentProps) {
  const { result, categories, producers, params, origins, mapEnabled } = loaderData;
  const { t, locale } = useI18n();
  const { showPrices, user } = useRootData();
  const [searchParams] = useSearchParams();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const loading = navigation.state === "loading" && navigation.location.pathname === "/shop";

  const roots = categories.filter((c) => !c.parentId);
  const activeCat = categories.find((c) => c.slug === params.category);
  const activeRoot = activeCat ? (activeCat.parentId ? categories.find((c) => c.id === activeCat.parentId) : activeCat) : null;
  const total = roots.reduce((a, c) => a + c.total, 0);

  const link = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    next.delete("page");
    return `/shop?${next}`;
  };

  const Facets = (
    <div className="grid gap-10">
      <div>
        <p className="text-eyebrow mb-4 text-[11px] text-muted-fg">{t("shop.categories")}</p>
        <ul className="grid gap-0.5 text-[14px]">
          <li>
            <Link to={link({ category: null })} className={cn("flex justify-between rounded-control px-2 py-1.5 hover:bg-muted", !params.category && "font-semibold")}>
              <span>{t("common.all")}</span><span className="text-muted-fg tabular-nums">{total}</span>
            </Link>
          </li>
          {roots.map((r) => (
            <li key={r.id}>
              <Link to={link({ category: r.slug })} className={cn("flex justify-between rounded-control px-2 py-1.5 hover:bg-muted", params.category === r.slug && "font-semibold")}>
                <span>{r.name}</span><span className="text-muted-fg tabular-nums">{r.total}</span>
              </Link>
              {activeRoot?.id === r.id && (
                <ul className="ml-3 mt-0.5 grid gap-0.5 border-l border-border pl-2">
                  {categories.filter((c) => c.parentId === r.id && c.total > 0).map((c) => (
                    <li key={c.id}>
                      <Link to={link({ category: c.slug })} className={cn("flex justify-between rounded-control px-2 py-1 text-[13px] hover:bg-muted", params.category === c.slug && "font-semibold text-primary")}>
                        <span>{c.name}</span><span className="text-muted-fg tabular-nums">{c.total}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-eyebrow mb-4 text-[11px] text-muted-fg">{t("shop.producers")}</p>
        <ul className="grid gap-0.5 text-[14px]">
          {producers.map((p) => (
            <li key={p.slug}>
              <Link to={link({ producer: params.producer === p.slug ? null : p.slug })} className={cn("flex justify-between gap-3 rounded-control px-2 py-1.5 hover:bg-muted", params.producer === p.slug && "font-semibold text-primary")}>
                <span className="truncate">{p.name}</span><span className="text-muted-fg tabular-nums">{p.count}</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link to="/producers" className="mt-3 inline-block px-2 text-[13px] text-muted-fg underline-offset-4 hover:text-fg hover:underline">{t("common.showAll")}</Link>
      </div>
      {origins.regions.length > 0 && (
        <div>
          <p className="text-eyebrow mb-4 text-[11px] text-muted-fg">{t("shop.origin")}</p>
          <ul className="grid gap-0.5 text-[14px]">
            {origins.regions.map((r) => (
              <li key={r.id}>
                <Link to={link({ region: params.region === r.id ? null : r.id, origin: null })} className={cn("flex justify-between gap-3 rounded-control px-2 py-1.5 hover:bg-muted", params.region === r.id && "font-semibold text-primary")}>
                  <span className="truncate">{regionName(r.id, locale)}</span><span className="text-muted-fg tabular-nums">{r.count}</span>
                </Link>
              </li>
            ))}
          </ul>
          {mapEnabled && <Link to="/producers" className="mt-3 inline-flex items-center gap-1.5 px-2 text-[13px] text-muted-fg underline-offset-4 hover:text-fg hover:underline"><MapIcon size={13} /> {t("shop.onMap")}</Link>}
        </div>
      )}
    </div>
  );

  return (
    <div className="container-page pb-24 pt-12 md:pt-16">
      <header className="mb-10 grid gap-3 md:mb-14">
        <Eyebrow line>{t("shop.eyebrow")}</Eyebrow>
        <h1 className="text-h1">{activeCat?.name ?? (params.region ? regionName(params.region, locale) : params.origin ? countryName(params.origin, locale) : params.promo ? t("shop.promo") : t("shop.title"))}</h1>
        <p className="text-muted-fg">
          {t("shop.count", { count: result.total.toLocaleString("de-CH") })}
          {!showPrices && <> · {user ? t("price.onRequest") : t("price.loginForPrices")}</>}
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[240px_1fr] lg:gap-14">
        <aside className="hidden lg:block">{Facets}</aside>

        <div>
          <div className="mb-8 flex flex-wrap items-center gap-3 border-b border-border pb-5">
            <Form method="get" className="relative min-w-60 flex-1" role="search">
              {[...searchParams].filter(([k]) => !["q", "page"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-fg" />
              <Input name="q" defaultValue={params.q} placeholder={t("shop.search")} aria-label={t("nav.search")} className="pl-10" />
            </Form>
            <Button variant="secondary" className="lg:hidden" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={16} /> {t("shop.filters")}</Button>
            <Form method="get" onChange={(e) => submit(e.currentTarget)} className="w-52">
              {[...searchParams].filter(([k]) => !["sort", "page"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <Select name="sort" defaultValue={params.sort} aria-label={t("shop.sort")}>
                <option value="">{t("shop.sort.recommended")}</option>
                <option value="name">{t("shop.sort.name")}</option>
                <option value="producer">{t("shop.sort.producer")}</option>
                {showPrices && <option value="price_asc">{t("shop.sort.priceAsc")}</option>}
                {showPrices && <option value="price_desc">{t("shop.sort.priceDesc")}</option>}
                <option value="new">{t("shop.sort.new")}</option>
              </Select>
            </Form>
          </div>

          {(params.q || params.producer || params.promo || params.region || params.origin || params.kind) && (
            <div className="mb-6 flex flex-wrap gap-2">
              {params.q && <Chip removable to={link({ q: null })}>«{params.q}»</Chip>}
              {params.producer && <Chip removable to={link({ producer: null })}>{producers.find((p) => p.slug === params.producer)?.name ?? params.producer}</Chip>}
              {params.promo && <Chip removable to={link({ promo: null })}>{t("shop.promo")}</Chip>}
              {params.kind && <Chip removable to={link({ kind: null })}>{t(`kind.${params.kind}` as MessageKey)}</Chip>}
              {params.region && <Chip removable to={link({ region: null })}>{regionName(params.region, locale)}</Chip>}
              {params.origin && <Chip removable to={link({ origin: null })}>{countryName(params.origin, locale)}</Chip>}
            </div>
          )}

          <div className={cn("transition-opacity duration-200", loading && "opacity-50")}>
            {result.items.length ? (
              <ProductGrid products={result.items} className="xl:grid-cols-3 2xl:grid-cols-4" />
            ) : (
              <EmptyState icon={<Search size={28} strokeWidth={1.4} />} title={t("shop.empty")} text={t("shop.emptyHint")} action={<Link to="/shop" className="text-sm underline underline-offset-4">{t("shop.resetFilters")}</Link>} />
            )}
          </div>

          {result.pages > 1 && (
            <nav className="mt-16 flex items-center justify-center gap-1" aria-label="Pagination">
              {Array.from({ length: result.pages }, (_, i) => i + 1).map((n) => {
                const next = new URLSearchParams(searchParams);
                next.set("page", String(n));
                return (
                  <Link key={n} to={`/shop?${next}`} aria-current={n === result.page ? "page" : undefined} className={cn("grid h-9 min-w-9 place-items-center rounded-btn text-sm tabular-nums", n === result.page ? "bg-fg text-bg" : "hover:bg-muted")}>{n}</Link>
                );
              })}
            </nav>
          )}
        </div>
      </div>

      {/* Mobile filter sheet */}
      {filtersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-fg/40" onClick={() => setFiltersOpen(false)} />
          <div className="animate-fade-up absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-surface bg-bg p-6" onClick={(e) => (e.target as HTMLElement).closest("a") && setFiltersOpen(false)}>
            <div className="mb-6 flex items-center justify-between">
              <p className="text-h3">{t("shop.filters")}</p>
              <Button variant="ghost" size="icon" onClick={() => setFiltersOpen(false)} aria-label={t("nav.close")}><X size={18} /></Button>
            </div>
            {Facets}
          </div>
        </div>
      )}
    </div>
  );
}
