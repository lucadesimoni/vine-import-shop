import { and, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { Link } from "react-router";
import type { Route } from "./+types/dashboard";
import { getDb, schema } from "~/.server/db";
import { getSetting } from "~/.server/settings";
import { lastSuccess, outboxCounts } from "~/.server/vinx/sync";
import { formatMoney } from "~/lib/money";
import { Badge } from "~/components/ui";
import { PageHeader, Panel, Stat } from "~/components/admin";
import { OrdersTable } from "~/components/orders-table";

export async function loader() {
  const db = await getDb();
  const since = new Date(Date.now() - 30 * 86400_000);
  const valid = and(gte(schema.orders.createdAt, since), ne(schema.orders.status, "cancelled"));
  const [[kpi], daily, recent, lowStock, [pending], outbox, lastStock, shop] = await Promise.all([
    db.select({
      orders: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${schema.orders.totalGross}) filter (where ${schema.orders.kind} = 'order'), 0)::int`,
      trade: sql<number>`coalesce(sum(${schema.orders.totalGross}) filter (where ${schema.orders.isTrade} and ${schema.orders.kind} = 'order'), 0)::int`,
      requests: sql<number>`count(*) filter (where ${schema.orders.kind} = 'request')::int`,
    }).from(schema.orders).where(valid),
    db.select({ day: sql<string>`to_char(${schema.orders.createdAt}, 'YYYY-MM-DD')`, total: sql<number>`sum(${schema.orders.totalGross})::int`, n: sql<number>`count(*)::int` })
      .from(schema.orders).where(valid).groupBy(sql`1`).orderBy(sql`1`),
    db.select().from(schema.orders).orderBy(desc(schema.orders.createdAt)).limit(8),
    db.select({ sku: schema.variants.sku, stock: schema.variants.stock, name: schema.products.name, id: schema.products.id })
      .from(schema.variants).innerJoin(schema.products, eq(schema.products.id, schema.variants.productId))
      .where(and(eq(schema.variants.active, true), lt(schema.variants.stock, 12))).orderBy(schema.variants.stock).limit(6),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.users).where(eq(schema.users.tradeStatus, "pending")),
    outboxCounts(),
    lastSuccess("stock"),
    getSetting("shop"),
  ]);
  return { kpi, daily, recent, lowStock, pending: pending.n, outbox, lastStock, currency: shop.currency };
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { kpi, daily, recent, lowStock, pending, outbox, lastStock, currency } = loaderData;
  const m = (c: number) => formatMoney(c, currency, "de");
  // Continuous 30-day axis (days without orders = 0)
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86400_000).toISOString().slice(0, 10);
    return daily.find((x) => x.day === d) ?? { day: d, total: 0, n: 0 };
  });
  const max = Math.max(1, ...days.map((d) => d.total));
  return (
    <>
      <PageHeader title="Übersicht" subtitle="Letzte 30 Tage" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Umsatz" value={m(kpi.revenue)} hint={`Bestellungen: ${kpi.orders - kpi.requests} · Anfragen: ${kpi.requests}`} />
        <Stat label="davon B2B" value={kpi.revenue ? `${Math.round((kpi.trade / kpi.revenue) * 100)} %` : "—"} hint={m(kpi.trade)} />
        <Link to="/admin/customers?status=pending"><Stat label="B2B-Anträge offen" value={pending} tone={pending ? "warning" : undefined} hint="Freigabe ausstehend" /></Link>
        <Link to="/admin/integrations"><Stat label="vinX" value={outbox.failed ? `${outbox.failed} Fehler` : "OK"} tone={outbox.failed ? "danger" : undefined} hint={`${outbox.sent ?? 0} übertragen · Lager ${lastStock ? new Date(lastStock).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }) : "—"}`} /></Link>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Umsatz pro Tag">
          {(
            <div>
              <div className="flex h-44 items-end gap-[3px] border-b border-border" role="img" aria-label="Umsatz pro Tag, letzte 30 Tage">
                {days.map((d) => (
                  <div key={d.day} className="group relative flex h-full flex-1 items-end">
                    <div className={`w-full rounded-t-badge transition-colors ${d.total ? "bg-primary/75 group-hover:bg-primary" : "bg-border/70"}`} style={{ height: d.total ? `${Math.max(4, (d.total / max) * 100)}%` : "2px" }} />
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-badge bg-fg px-2 py-1 text-label text-bg group-hover:block">{new Date(d.day).toLocaleDateString("de-CH")} · {m(d.total)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-label text-muted-fg tabular-nums">
                <span>{new Date(days[0].day).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" })}</span>
                <span>Heute</span>
              </div>
            </div>
          )}
        </Panel>
        <Panel title="Tiefer Lagerbestand" description="Varianten unter 12 Einheiten">
          <ul className="grid gap-2 text-sm">
            {lowStock.map((v) => (
              <li key={v.sku} className="flex items-center justify-between gap-3">
                <Link to={`/admin/products/${v.id}`} className="min-w-0 truncate hover:underline">{v.name.de} <span className="text-muted-fg">· {v.sku}</span></Link>
                <Badge tone={v.stock > 0 ? "warning" : "danger"} className="shrink-0">{v.stock}</Badge>
              </li>
            ))}
            {lowStock.length === 0 && <li className="text-muted-fg">Alles ausreichend an Lager.</li>}
          </ul>
        </Panel>
      </div>

      <h2 className="mb-3 mt-10 font-sans text-body font-semibold">Neueste Bestellungen</h2>
      <OrdersTable orders={recent} currency={currency} />
    </>
  );
}
