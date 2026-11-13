import { sql } from "drizzle-orm";
import { useActionData, useSearchParams } from "react-router";
import { Download } from "lucide-react";
import type { Route } from "./+types/orders";
import { getDb, schema } from "~/.server/db";
import { markPaid, setOrderStatus } from "~/.server/orders";
import { bulkIds, countAll, listParams } from "~/.server/admin-list";
import { orderFilters } from "~/.server/admin-orders";
import { ORDER_STATUSES } from "~/lib/orders";
import { getSetting } from "~/.server/settings";
import { listStorefronts } from "~/.server/storefronts";
import { ButtonLink, Input, Notice, Select } from "~/components/ui";
import { label, ListToolbar, PageHeader } from "~/components/admin";
import { OrdersTable } from "~/components/orders-table";

const o = schema.orders;

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url).searchParams;
  const list = listParams(request, {
    sorts: { date: o.createdAt, number: o.number, total: o.totalGross, status: o.status, customer: sql`coalesce(nullif(${o.billing}->>'company', ''), ${o.billing}->>'name')` },
    defaultSort: "date",
    defaultDir: "desc",
  });
  const cond = orderFilters(url, list.like);
  const db = await getDb();
  const [orders, [{ n }], [sum]] = await Promise.all([
    db.select().from(o).where(cond).orderBy(...list.orderBy).limit(list.limit).offset(list.offset),
    db.select({ n: countAll }).from(o).where(cond),
    db.select({ total: sql<number>`coalesce(sum(${o.totalGross}) filter (where ${o.status} <> 'cancelled' and ${o.kind} <> 'request'), 0)::int` }).from(o).where(cond),
  ]);
  const shops = (await listStorefronts()).map((s) => ({ id: s.id, name: s.name }));
  return { orders, list: list.meta(n), sum: sum.total, currency: (await getSetting("shop")).currency, statuses: ORDER_STATUSES, shops };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const ids = bulkIds(form);
  const op = String(form.get("action") ?? "");
  if (!ids.length) return { message: "Nichts ausgewählt." };
  if (op === "paid") for (const id of ids) await markPaid(id, "manual");
  else if (op.startsWith("status:") && ORDER_STATUSES.includes(op.slice(7) as never)) for (const id of ids) await setOrderStatus(id, op.slice(7) as (typeof ORDER_STATUSES)[number]);
  else return { message: "Unbekannte Aktion." };
  return { message: `${ids.length} Bestellung${ids.length === 1 ? "" : "en"} aktualisiert.` };
}

export default function Orders({ loaderData }: Route.ComponentProps) {
  const { orders, list, sum, currency, statuses, shops } = loaderData;
  const result = useActionData<typeof action>();
  const [params] = useSearchParams();
  const exportUrl = `/admin/orders.csv${params.size ? `?${params}` : ""}`;
  return (
    <>
      <PageHeader
        title="Bestellungen"
        subtitle={`${list.total} Einträge · Umsatz ${new Intl.NumberFormat("de-CH", { style: "currency", currency }).format(sum / 100)}`}
        actions={<ButtonLink to={exportUrl} reloadDocument variant="secondary" size="sm"><Download size={14} /> CSV</ButtonLink>}
      />
      {result?.message && <Notice tone="success" className="mb-5">{result.message}</Notice>}
      <ListToolbar placeholder="Nummer, E-Mail, Firma, Name oder Referenz" meta={list}>
        <Select name="status" defaultValue={params.get("status") ?? ""} size="sm" className="w-40" aria-label="Status">
          <option value="">Alle Status</option>
          {statuses.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </Select>
        {shops.length > 0 && (
          <Select name="shop" defaultValue={params.get("shop") ?? ""} size="sm" className="w-40" aria-label="Shop">
            <option value="">Alle Shops</option><option value="main">Hauptshop</option>
            {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        )}
        <Select name="type" defaultValue={params.get("type") ?? ""} size="sm" className="w-36" aria-label="Kanal">
          <option value="">B2B + B2C</option><option value="trade">Nur B2B</option><option value="consumer">Nur B2C</option><option value="request">Anfragen</option>
        </Select>
        <Select name="payment" defaultValue={params.get("payment") ?? ""} size="sm" className="w-36" aria-label="Zahlung">
          <option value="">Zahlung: alle</option><option value="open">Offen</option><option value="paid">Bezahlt</option>
        </Select>
        <Select name="erp" defaultValue={params.get("erp") ?? ""} size="sm" className="w-36" aria-label="ERP">
          <option value="">ERP: alle</option><option value="pending">Ausstehend</option><option value="failed">Fehler</option>
        </Select>
        <Input type="date" name="from" defaultValue={params.get("from") ?? ""} size="sm" className="w-40" aria-label="Von" />
        <Input type="date" name="to" defaultValue={params.get("to") ?? ""} size="sm" className="w-40" aria-label="Bis" />
      </ListToolbar>
      <OrdersTable
        shops={shops}
        orders={orders}
        currency={currency}
        meta={list}
        bulk={[{ value: "status:confirmed", label: "Bestätigen" }, { value: "status:shipped", label: "Versandt" }, { value: "status:completed", label: "Abschliessen" }, { value: "paid", label: "Als bezahlt" }, { value: "status:cancelled", label: "Stornieren", tone: "danger" }]}
      />
    </>
  );
}
