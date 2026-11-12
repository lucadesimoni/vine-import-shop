import { Form, Link, useNavigation, useSearchParams, useSubmit } from "react-router";
import { ClipboardList, Search } from "lucide-react";
import type { Route } from "./+types/catalog";
import { shopContext } from "~/.server/context";
import { categoryTree, searchProducts } from "~/.server/catalog";
import { useI18n, metaT } from "~/lib/i18n";
import { cn } from "~/lib/cn";
import { formatMoney } from "~/lib/money";
import { useRootData } from "~/lib/root-data";
import { Badge, Button, Card, EmptyState, Eyebrow, Input, Pagination, Select } from "~/components/ui";
import { ProductImage, StockLabel } from "~/components/shop";

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = context.get(shopContext);
  const q = new URL(request.url).searchParams;
  const params = { q: q.get("q") ?? "", category: q.get("category") ?? "", sort: q.get("sort") ?? "name", page: Math.max(1, Number(q.get("page") ?? 1)) };
  const [result, categories] = await Promise.all([searchProducts(ctx, { ...params, perPage: 50 }), categoryTree(ctx)]);
  return { result, categories: categories.filter((c) => c.total > 0), params };
}

export const meta: Route.MetaFunction = ({ matches }) => [{ title: `${metaT(matches)("portal.catalog")} · B2B` }];

export default function PortalCatalog({ loaderData }: Route.ComponentProps) {
  const { result, categories, params } = loaderData;
  const { t, locale } = useI18n();
  const { shop } = useRootData();
  const [searchParams] = useSearchParams();
  const submit = useSubmit();
  const nav = useNavigation();
  const busy = nav.state === "submitting";
  const loading = nav.state === "loading" && nav.location.pathname === "/portal/catalog";
  const roots = categories.filter((c) => !c.parentId);
  const pageLink = (n: number) => { const s = new URLSearchParams(searchParams); s.set("page", String(n)); return `?${s}`; };

  return (
    <div className="container-page grid gap-8 pb-10 pt-10 md:pt-12">
      <header className="grid gap-3">
        <Eyebrow line>{t("portal.title")}</Eyebrow>
        <h1 className="text-h2">{t("portal.catalog")}</h1>
        <p className="text-muted-fg">{t("portal.results", { n: result.total })} · {t("portal.netHint")}</p>
      </header>

      <Form method="get" onChange={(e) => { if ((e.target as HTMLElement).tagName === "SELECT") submit(e.currentTarget); }} className="flex flex-wrap items-center gap-3" role="search">
        <div className="relative min-w-60 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
          <Input name="q" defaultValue={params.q} placeholder={t("shop.search")} aria-label={t("nav.search")} size="sm" className="pl-9" />
        </div>
        <Select name="category" defaultValue={params.category} aria-label={t("shop.categories")} size="sm" className="w-56">
          <option value="">{t("common.all")}</option>
          {roots.map((r) => [
            <option key={r.id} value={r.slug}>{r.name} ({r.total})</option>,
            ...categories.filter((c) => c.parentId === r.id).map((c) => <option key={c.id} value={c.slug}>— {c.name} ({c.total})</option>),
          ])}
        </Select>
        <Select name="sort" defaultValue={params.sort} aria-label={t("shop.sort")} size="sm" className="w-44">
          <option value="name">{t("shop.sort.name")}</option>
          <option value="producer">{t("shop.sort.producer")}</option>
          <option value="price_asc">{t("shop.sort.priceAsc")}</option>
          <option value="price_desc">{t("shop.sort.priceDesc")}</option>
          <option value="new">{t("shop.sort.new")}</option>
        </Select>
        <Button type="submit" variant="secondary" size="sm">{t("nav.search")}</Button>
      </Form>

      {result.items.length === 0 ? (
        <EmptyState icon={<Search size={26} strokeWidth={1.4} />} title={t("shop.empty")} text={t("shop.emptyHint")} action={<Link to="/portal/catalog" className="text-sm underline underline-offset-4">{t("shop.resetFilters")}</Link>} />
      ) : (
        <Form method="post" action="/portal/quick-order" className={cn("grid gap-0 transition-opacity", loading && "opacity-50")}>
          <Card className="mb-4 md:overflow-x-auto">
            <table className="w-full text-sm md:min-w-[760px]">
              <thead className="hidden md:table-header-group">
                <tr className="border-b border-border text-left">
                  {["", t("cart.item"), t("product.art"), t("portal.stock"), t("portal.unitPrice"), t("cart.qty")].map((h, i) => (
                    <th key={i} className={cn("text-eyebrow px-4 py-3 text-[10px] font-semibold text-muted-fg", i >= 4 && "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.items.flatMap((p) =>
                  p.variants.map((v, i) => (
                    <tr key={v.id} className={cn("grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-border px-3 py-3 last:border-0 hover:bg-bg/60 md:table-row md:p-0", i > 0 && "md:border-t-0")}>
                      <td className="row-span-2 self-start md:w-14 md:py-2 md:pl-4">{i === 0 && <Link to={`/portal/product/${p.slug}`} className="relative block h-12 w-10 rounded-badge bg-media p-0.5" tabIndex={-1}><ProductImage product={p} /></Link>}</td>
                      <td className="min-w-0 md:px-4 md:py-2.5">
                        {i === 0 ? (
                          <>
                            <Link to={`/portal/product/${p.slug}`} className="font-medium hover:underline">{p.name}</Link>
                            {p.promo && <Badge tone="primary" className="ml-2 align-middle">{t("shop.promo")}</Badge>}
                            <span className="block truncate text-[12px] text-muted-fg">{[p.producer?.name, v.vintage, v.size].filter(Boolean).join(" · ")}<span className="md:hidden"> · {v.sku}</span></span>
                          </>
                        ) : (
                          <span className="block pl-0 text-[12px] text-muted-fg">{[v.vintage, v.size].filter(Boolean).join(" · ")}<span className="md:hidden"> · {v.sku}</span></span>
                        )}
                      </td>
                      <td className="hidden px-4 py-2.5 font-mono text-[12px] text-muted-fg md:table-cell">{v.sku}</td>
                      <td className="col-start-2 row-start-2 md:px-4 md:py-2.5"><StockLabel level={v.stock} qty={v.stockQty} /></td>
                      <td className="col-start-3 row-start-1 text-right tabular-nums md:px-4 md:py-2.5">
                        {v.price ? formatMoney(v.price.display, shop.currency, locale) : "—"}
                        {v.price?.applied?.length ? <span className="block text-[11px] text-primary">{v.price.applied.map((a) => a.label).join(" · ")}</span> : v.price && v.price.tiers.length > 0 && <span className="block text-[11px] text-primary">{t("price.tiers")}</span>}
                      </td>
                      <td className="col-start-3 row-start-2 text-right md:w-28 md:px-4 md:py-2">
                        <Input name={`qty:${v.id}`} type="number" min={0} step={1} placeholder="0" aria-label={`${t("cart.qty")} ${p.name}`} size="sm" className="ml-auto w-20 text-right tabular-nums" disabled={v.stock === "out"} />
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </Card>
          <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex items-center justify-between gap-4 border-t border-border bg-bg/90 px-4 py-3 backdrop-blur-md lg:bottom-0 lg:py-4">
            <p className="hidden text-[13px] text-muted-fg sm:block">{t("portal.netHint")}</p>
            <Button type="submit" disabled={busy} className="w-full sm:w-auto"><ClipboardList size={16} /> {t("portal.addSelected")}</Button>
          </div>
        </Form>
      )}

      {result.pages > 1 && (
        <Pagination page={result.page} pages={result.pages} href={pageLink} labels={{ prev: t("common.prev"), next: t("common.next") }} />
      )}
    </div>
  );
}
