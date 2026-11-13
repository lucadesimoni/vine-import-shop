import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { Form, Link } from "react-router";
import { ArrowRight, FileSpreadsheet, FileText, Mail, Phone, RotateCcw, Zap } from "lucide-react";
import type { Route } from "./+types/dashboard";
import { requireUser } from "~/.server/auth";
import { shopContext } from "~/.server/context";
import { cartSummary, getCart } from "~/.server/cart";
import { toCards } from "~/.server/catalog";
import { getDb, schema } from "~/.server/db";
import { erpConnected } from "~/.server/erp-ownership";
import { erpClient } from "~/.server/vinx/sync";
import { useI18n, type MessageKey } from "~/lib/i18n";
import { formatMoney } from "~/lib/money";
import { useRootData } from "~/lib/root-data";
import { Badge, Button, ButtonLink, Card, EmptyState, Eyebrow } from "~/components/ui";
import { AddToList, ProductImage, StockLabel } from "~/components/shop";
import { STATUS_TONE } from "~/components/status";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const ctx = context.get(shopContext);
  const db = await getDb();
  const year = new Date().getFullYear();
  const since = new Date(year, 0, 1);
  const mine = eq(schema.orders.userId, user.id);

  const [[ytd], [open], recent, frequent, cart] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int`, net: sql<number>`coalesce(sum(${schema.orders.subtotalNet}),0)::int` }).from(schema.orders)
      .where(and(mine, eq(schema.orders.kind, "order"), gte(schema.orders.createdAt, since))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.orders).where(and(mine, inArray(schema.orders.status, ["new", "confirmed", "processing"]))),
    db.select().from(schema.orders).where(mine).orderBy(desc(schema.orders.createdAt)).limit(5),
    db.select({ productId: schema.variants.productId, variantId: schema.orderItems.variantId, qty: sql<number>`sum(${schema.orderItems.qty})::int` })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .innerJoin(schema.variants, eq(schema.variants.id, schema.orderItems.variantId))
      .where(mine)
      .groupBy(schema.variants.productId, schema.orderItems.variantId)
      .orderBy(desc(sql`sum(${schema.orderItems.qty})`))
      .limit(6),
    getCart(request, ctx),
  ]);
  const summary = await cartSummary(ctx, cart.items, cart.couponCode);

  // ERP data for linked customers: documents (invoices, delivery notes) and the ERP's order proposal,
  // which also knows orders placed by phone/e-mail — the local order history is the fallback
  let documents: { id: string; title: string }[] = [];
  if (user.erpId && (await erpConnected())) {
    const client = await erpClient().catch(() => null);
    const [docs, proposal] = await Promise.all([
      client?.documents?.(user.erpId).catch(() => []) ?? [],
      client?.orderProposal?.(user.erpId).catch(() => []) ?? [],
    ]);
    documents = docs.slice(0, 8).map((d) => ({ id: d.id, title: d.title }));
    if (proposal.length) {
      const keys = proposal.flatMap((p) => [p.articleId, p.articleNumber]).filter(Boolean);
      const vs = await db.select({ id: schema.variants.id, productId: schema.variants.productId, sku: schema.variants.sku, erpId: schema.variants.erpId }).from(schema.variants)
        .where(or(inArray(schema.variants.erpId, keys), inArray(schema.variants.sku, keys)));
      const fromErp = proposal
        .map((p) => vs.find((v) => v.erpId === p.articleId || v.sku === p.articleNumber))
        .filter((v, i, a) => v && a.findIndex((x) => x?.id === v.id) === i)
        .slice(0, 6)
        .map((v) => ({ productId: v!.productId, variantId: v!.id as number | null, qty: proposal.find((p) => p.articleId === v!.erpId || p.articleNumber === v!.sku)?.quantity ?? 0 }));
      if (fromErp.length) frequent.splice(0, frequent.length, ...fromErp);
    }
  }
  const cards = await toCards(ctx, [...new Set(frequent.map((f) => f.productId))]);

  return {
    year,
    name: user.name.split(" ")[0] ?? "",
    company: user.company,
    group: ctx.group ? { name: user.group?.name ?? "", minOrderCents: ctx.group.minOrderCents, discountPct: ctx.group.discountPct } : null,
    kpi: { orders: ytd.n, revenueNet: ytd.net, open: open.n, listUnits: summary.count, listValue: summary.totals.subtotalNet },
    recent,
    frequent: frequent
      .map((f) => {
        const card = cards.find((c) => c.id === f.productId);
        const variant = card?.variants.find((v) => v.id === f.variantId);
        return card && variant ? { card, variant, ordered: f.qty } : null;
      })
      .filter((x) => x !== null),
    contact: { phone: ctx.brand.contact.phone, email: ctx.brand.contact.email },
    priceList: ctx.shop.trade.priceListExport,
    documents,
    quickOrder: ctx.shop.trade.quickOrder,
  };
}

export const meta: Route.MetaFunction = ({ matches }) => {
  const root = matches[0].loaderData as { brand: { name: string } } | undefined;
  return [{ title: `B2B · ${root?.brand.name ?? ""}` }];
};

export default function PortalDashboard({ loaderData }: Route.ComponentProps) {
  const { year, name, company, group, kpi, recent, frequent, contact, priceList, documents, quickOrder } = loaderData;
  const { t, locale } = useI18n();
  const { shop } = useRootData();
  const m = (c: number) => formatMoney(c, shop.currency, locale);

  return (
    <div className="container-page grid gap-8 pb-20 pt-10 md:pt-12">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="grid gap-3">
          <Eyebrow line>{company || t("portal.title")}</Eyebrow>
          <h1 className="text-h2">{t("portal.welcome", { name })}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickOrder && <ButtonLink to="/portal/quick-order" variant="secondary"><Zap size={15} /> {t("account.quickOrder")}</ButtonLink>}
          <ButtonLink to="/portal/catalog">{t("portal.catalog")} <ArrowRight size={15} /></ButtonLink>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={t("portal.kpi.ordersYear", { year })} value={String(kpi.orders)} hint={t("account.orders")} />
        <Kpi label={t("portal.kpi.revenueYear", { year })} value={m(kpi.revenueNet)} hint={t("portal.netHint")} />
        <Kpi label={t("portal.kpi.open")} value={String(kpi.open)} hint={t("portal.orders")} to="/portal/orders" />
        <Kpi label={t("portal.kpi.list")} value={m(kpi.listValue)} hint={t("cart.units", { n: kpi.listUnits })} to="/portal/order-list" />
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-8">
          <section className="grid gap-4">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-h3">{t("portal.recent")}</h2>
              <Link to="/portal/orders" className="text-sm text-muted-fg underline-offset-4 hover:text-fg hover:underline">{t("portal.allOrders")}</Link>
            </div>
            {recent.length === 0 ? (
              <EmptyState title={t("account.noOrders")} />
            ) : (
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {recent.map((o) => (
                      <tr key={o.id} className="border-b border-border last:border-0">
                        <td className="whitespace-nowrap px-5 py-3.5"><Link to={`/portal/orders/${o.number}`} className="font-medium hover:underline">{o.number}</Link></td>
                        <td className="hidden px-5 py-3.5 text-muted-fg tabular-nums sm:table-cell">{new Date(o.createdAt).toLocaleDateString(`${locale}-CH`)}</td>
                        <td className="px-5 py-3.5"><Badge tone={STATUS_TONE[o.status]}>{t(`status.${o.status}` as MessageKey)}</Badge></td>
                        <td className="hidden whitespace-nowrap px-5 py-3.5 text-right tabular-nums md:table-cell">{o.kind === "request" ? t("account.request") : m(o.totalGross)}</td>
                        <td className="w-0 px-3 py-2 text-right">
                          <Form method="post" action={`/portal/orders/${o.number}`}>
                            <input type="hidden" name="intent" value="reorder" />
                            <Button type="submit" variant="ghost" size="iconSm" aria-label={t("account.reorder")} title={t("account.reorder")}><RotateCcw size={15} /></Button>
                          </Form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </section>

          {frequent.length > 0 && (
            <section className="grid gap-4">
              <h2 className="text-h3">{t("portal.frequent")}</h2>
              <Card className="divide-y divide-border">
                {frequent.map(({ card, variant }) => (
                  <div key={variant.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3.5">
                    <Link to={`/portal/product/${card.slug}`} className="relative h-14 w-11 shrink-0 rounded-badge bg-media p-1" tabIndex={-1}><ProductImage product={card} /></Link>
                    <div className="min-w-48 flex-1">
                      <Link to={`/portal/product/${card.slug}`} className="line-clamp-1 font-medium hover:underline">{card.name}</Link>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-fg">
                        <span>{[variant.vintage, variant.size, `${t("product.art")} ${variant.sku}`].filter(Boolean).join(" · ")}</span>
                        <StockLabel level={variant.stock} qty={variant.stockQty} />
                      </p>
                    </div>
                    <span className="w-24 text-right text-sm font-medium tabular-nums">{variant.price ? m(variant.price.display) : ""}</span>
                    <AddToList variantId={variant.id} compact iconOnly disabled={variant.stock === "out"} />
                  </div>
                ))}
              </Card>
            </section>
          )}
        </div>

        <aside className="grid content-start gap-4">
          {group && (
            <div className="grid gap-4 rounded-surface bg-inverse p-6 text-on-inverse">
              <Eyebrow className="text-2xs text-on-inverse/70">{t("portal.terms")}</Eyebrow>
              <div className="grid gap-1">
                <p className="font-display text-2xl">{group.name}</p>
                <p className="text-note text-on-inverse/75">{t("portal.netHint")}</p>
              </div>
              <dl className="grid grid-cols-2 gap-3 border-t border-on-inverse/15 pt-4 text-sm">
                {group.discountPct > 0 && <div><dt className="text-xs text-on-inverse/70">{t("portal.discount")}</dt><dd className="font-medium tabular-nums">{group.discountPct}%</dd></div>}
                {group.minOrderCents > 0 && <div><dt className="text-xs text-on-inverse/70">{t("portal.minOrderShort")}</dt><dd className="font-medium tabular-nums">{m(group.minOrderCents)}</dd></div>}
              </dl>
            </div>
          )}
          <Card className="grid gap-4 p-6">
            <Eyebrow className="text-2xs">{t("portal.contact")}</Eyebrow>
            {contact.phone && <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="flex items-center gap-3 text-sm hover:text-primary"><Phone size={15} className="text-muted-fg" /> {contact.phone}</a>}
            {contact.email && <a href={`mailto:${contact.email}`} className="flex items-center gap-3 text-sm hover:text-primary"><Mail size={15} className="text-muted-fg" /> {contact.email}</a>}
          </Card>
          {(priceList || documents.length > 0) && (
            <Card className="grid gap-4 p-6">
              <Eyebrow className="text-2xs">{t("portal.downloads")}</Eyebrow>
              {priceList && <a href="/account/price-list.csv" className="flex items-center gap-3 text-sm hover:text-primary"><FileSpreadsheet size={15} className="shrink-0 text-muted-fg" /> {t("account.priceList")}</a>}
              {documents.length > 0 && (
                <div className="grid gap-2.5 border-t border-border pt-4">
                  <span className="text-xs text-muted-fg">{t("portal.documents")}</span>
                  {documents.map((d) => (
                    <a key={d.id} href={`/account/documents/${d.id}`} className="flex min-w-0 items-center gap-3 text-sm hover:text-primary"><FileText size={15} className="shrink-0 text-muted-fg" /> <span className="truncate">{d.title}</span></a>
                  ))}
                </div>
              )}
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, to }: { label: string; value: string; hint?: string; to?: string }) {
  const body = (
    <Card className="grid h-full min-w-0 gap-2 p-4 transition-shadow hover:shadow-card sm:p-5">
      <span className="text-eyebrow text-2xs text-muted-fg">{label}</span>
      <span className="truncate text-[1.3rem] font-medium leading-none tracking-tight tabular-nums sm:text-[1.6rem]">{value}</span>
      {hint && <span className="text-xs text-muted-fg">{hint}</span>}
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}
