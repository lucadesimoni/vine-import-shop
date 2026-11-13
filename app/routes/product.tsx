import { data, Link } from "react-router";
import { ChevronRight, Leaf } from "lucide-react";
import type { Route } from "./+types/product";
import { shopContext } from "~/.server/context";
import { productDetail } from "~/.server/catalog";
import { useI18n, type MessageKey } from "~/lib/i18n";
import { formatMoney } from "~/lib/money";
import { useRootData } from "~/lib/root-data";
import { usePath } from "~/lib/channel";
import { ProducerLogo } from "~/components/producer";
import { Badge, Eyebrow, Notice, SectionHeading } from "~/components/ui";
import { AddToList, PriceTag, ProductGrid, ProductImage, StockLabel } from "~/components/shop";

export async function loader({ params, context, request }: Route.LoaderArgs) {
  const ctx = context.get(shopContext);
  const product = await productDetail(ctx, params.slug);
  if (!product) throw data("Not found", { status: 404 });
  return { product, url: request.url };
}

export const meta: Route.MetaFunction = ({ loaderData, matches }) => {
  if (!loaderData) return [];
  const root = matches[0].loaderData as { brand: { name: string } } | undefined;
  const p = loaderData.product;
  const v = p.card.variants[0];
  return [
    { title: `${p.card.name} · ${root?.brand.name ?? ""}` },
    { name: "description", content: p.short || p.description.slice(0, 160) },
    { property: "og:title", content: p.card.name },
    ...(p.card.image ? [{ property: "og:image", content: new URL(p.card.image, loaderData.url).href }] : []),
    {
      "script:ld+json": {
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.card.name,
        sku: v?.sku,
        brand: p.producer ? { "@type": "Brand", name: p.producer.name } : undefined,
        image: p.card.image ? new URL(p.card.image, loaderData.url).href : undefined,
        offers: v ? { "@type": "Offer", availability: v.stock === "out" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock", ...(v.price ? { price: (v.price.gross / 100).toFixed(2), priceCurrency: "CHF" } : {}) } : undefined,
      },
    },
  ];
};

export default function Product({ loaderData }: Route.ComponentProps) {
  const { product: p } = loaderData;
  const { t, locale } = useI18n();
  const to = usePath();
  const { shop, showPrices, user } = useRootData();
  const c = p.card;
  const first = c.variants[0];
  const isVintage = shop.modules.wineDetails && c.variants.some((v) => v.vintage);
  const facts = [
    [t("product.producer"), p.producer?.name],
    [t("product.origin"), [c.region, c.country].filter(Boolean).join(", ")],
    ...(shop.modules.wineDetails ? [[t("product.appellation"), p.appellation], [t("product.grapes"), p.grapes]] : []),
    [t("product.alcohol"), p.alcohol ? `${p.alcohol} % vol.` : null],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div className="container-page page-top">
      <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-1.5 text-note text-muted-fg">
        <Link to={to("/shop")} className="hover:text-fg">{t("nav.shop")}</Link>
        {c.category && <><ChevronRight size={13} /><Link to={to(`/shop?category=${c.category.slug}`)} className="hover:text-fg">{c.category.name}</Link></>}
        <ChevronRight size={13} /><span className="text-fg">{c.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
        <div className="relative lg:sticky lg:top-[calc(var(--header-h)+2rem)] lg:self-start">
          <div className="relative aspect-square overflow-hidden rounded-surface border border-border bg-media">
            <div className="absolute inset-[8%]"><ProductImage product={c} /></div>
          </div>
          <div className="absolute left-4 top-4 flex flex-col gap-1.5">
            {c.promo && <Badge tone="outline">{t("shop.promo")}</Badge>}
            {c.organic && <Badge tone="success"><Leaf size={10} /> {t("shop.organic")}</Badge>}
          </div>
        </div>

        <div className="grid content-start gap-8">
          <div className="grid gap-4">
            <Eyebrow>{[c.color ? t(`color.${c.color}` as MessageKey) : c.category?.name, c.country].filter(Boolean).join(" · ")}</Eyebrow>
            <h1 className="text-h1">{c.name}</h1>
            {p.producer && (
              <Link to={to.portal || !shop.modules.producers ? to(`/shop?producer=${p.producer.slug}`) : `/producers/${p.producer.slug}`} className="group flex w-fit items-center gap-3 text-lg text-muted-fg hover:text-fg">
                {p.producer.logo && <ProducerLogo name={p.producer.name} logo={p.producer.logo} size="sm" />}
                <span className="underline-offset-4 group-hover:underline">{p.producer.name}</span>
              </Link>
            )}
            {p.short && p.short !== p.producer?.name && <p className="max-w-xl text-muted-fg">{p.short}</p>}
          </div>

          {first && (
            <div className="grid gap-2">
              <PriceTag price={first.price} size="lg" />
              {!showPrices && (
                <p className="text-sm text-muted-fg">
                  {user ? t("cart.requestNote") : <>{t("price.loginForPrices")} · <Link to={to("/login")} className="text-fg underline underline-offset-4">{t("nav.login")}</Link></>}
                </p>
              )}
            </div>
          )}

          {/* Variant table */}
          <div className="overflow-hidden rounded-surface border border-border bg-surface">
            <div className="hidden gap-4 border-b border-border px-5 py-3 sm:grid sm:grid-cols-[1.1fr_0.7fr_0.9fr] 2xl:grid-cols-[1fr_0.6fr_0.8fr_auto]">
              {[isVintage ? t("product.vintage") : t("product.variant"), t("product.format"), t("product.art")].map((h, i) => <span key={i} className="text-eyebrow text-2xs text-muted-fg">{h}</span>)}
            </div>
            {c.variants.map((v) => (
              <div key={v.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3 border-b border-border px-4 py-4 last:border-0 sm:grid-cols-[1.1fr_0.7fr_0.9fr] sm:items-center sm:gap-4 sm:px-5 sm:py-5 2xl:grid-cols-[1fr_0.6fr_0.8fr_auto]">
                <div className="grid gap-1">
                  <span className="font-medium tabular-nums">
                    {isVintage ? (v.vintage ?? "—") : (v.size ?? c.name)}
                    {isVintage && v.size && <span className="font-normal text-muted-fg sm:hidden"> · {v.size}</span>}
                  </span>
                  <StockLabel level={v.stock} qty={v.stockQty} />
                  <span className="text-xs text-muted-fg tabular-nums sm:hidden">{t("product.art")} {v.sku}</span>
                </div>
                <span className="hidden text-sm sm:block">{v.size ?? "—"}</span>
                <div className="grid justify-items-end gap-0.5 sm:justify-items-start">
                  <span className="hidden text-sm tabular-nums sm:inline">{v.sku}</span>
                  {v.price && <span className="font-semibold tabular-nums sm:text-note sm:font-normal sm:text-muted-fg">{formatMoney(v.price.display, shop.currency, locale)}</span>}
                </div>
                <div className="col-span-2 sm:col-span-3 2xl:col-span-1"><AddToList variantId={v.id} packSize={v.packSize} compact disabled={v.stock === "out"} /></div>
              </div>
            ))}
          </div>

          {first?.price && first.price.tiers.length > 1 && (
            <div className="rounded-surface border border-border bg-surface p-5">
              <p className="text-eyebrow mb-3 text-2xs text-muted-fg">{t("price.tiers")} · {first.price.displayMode === "net" ? t("price.exclVat") : t("price.inclVat")}</p>
              <dl className="grid grid-cols-3 gap-3">
                {first.price.tiers.map((tier) => (
                  <div key={tier.minQty} className="rounded-control bg-muted px-3 py-2.5">
                    <dt className="text-xs text-muted-fg">{t("price.from", { qty: tier.minQty })}</dt>
                    <dd className="font-semibold tabular-nums">{formatMoney(first.price!.displayMode === "net" ? tier.netCents : Math.round(tier.netCents * (1 + first.price!.taxRate / 100)), shop.currency, locale)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {!showPrices && !user && <Notice>{t("auth.tradeText")} <Link to="/trade#apply" className="font-medium underline underline-offset-4">{t("trade.apply")}</Link></Notice>}

          {p.description && (
            <div className="grid gap-3">
              <h2 className="text-eyebrow text-label text-muted-fg">{t("product.details")}</h2>
              <p className="text-lead whitespace-pre-line">{p.description}</p>
            </div>
          )}
          {p.pairing && (
            <div className="grid gap-3">
              <h2 className="text-eyebrow text-label text-muted-fg">{t("product.pairing")}</h2>
              <p>{p.pairing}</p>
            </div>
          )}
          {facts.length > 0 && (
            <dl className="grid grid-cols-2 border-t border-border">
              {facts.map(([k, v]) => (
                <div key={k} className="border-b border-border py-3.5 pr-4">
                  <dt className="text-eyebrow text-2xs text-muted-fg">{k}</dt>
                  <dd className="mt-1 text-sm">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      {p.moreFromProducer.length > 0 && p.producer && (
        <section className="mt-24">
          <SectionHeading title={t("product.more", { name: p.producer.name })} action={<Link to={to(`/shop?producer=${p.producer.slug}`)} className="text-sm underline underline-offset-4">{t("common.showAll")}</Link>} />
          <ProductGrid products={p.moreFromProducer} />
        </section>
      )}
      {p.related.length > 0 && (
        <section className="mt-24">
          <SectionHeading title={t("product.related")} />
          <ProductGrid products={p.related} />
        </section>
      )}
    </div>
  );
}
