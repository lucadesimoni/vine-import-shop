import { desc, eq } from "drizzle-orm";
import { data, Form, Link } from "react-router";
import { ArrowLeft, RotateCw } from "lucide-react";
import type { Route } from "./+types/order";
import { getDb, schema } from "~/.server/db";
import { getOrder, markPaid, setOrderStatus } from "~/.server/orders";
import { ORDER_STATUSES } from "~/lib/orders";
import { retryOutbox, processOutbox } from "~/.server/vinx/sync";
import { formatMoney } from "~/lib/money";
import { Badge, Button, Select } from "~/components/ui";
import { DataTable, label, PageHeader, Panel } from "~/components/admin";
import { STATUS_TONE } from "~/components/status";

export async function loader({ params }: Route.LoaderArgs) {
  const order = await getOrder({ id: Number(params.id) });
  if (!order) throw data("Not found", { status: 404 });
  const db = await getDb();
  const outbox = await db.select().from(schema.erpOutbox).where(eq(schema.erpOutbox.refId, order.id)).orderBy(desc(schema.erpOutbox.id));
  return { order, outbox: outbox.filter((o) => o.type === "order") };
}

export async function action({ request, params }: Route.ActionArgs) {
  const id = Number(params.id);
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "status") {
    const status = String(form.get("status"));
    if (ORDER_STATUSES.includes(status as never)) await setOrderStatus(id, status as (typeof ORDER_STATUSES)[number]);
  } else if (intent === "paid") {
    await markPaid(id, "manual");
  } else if (intent === "retry") {
    await retryOutbox(Number(form.get("outboxId")));
    await processOutbox(undefined, 5);
  }
  return { ok: true };
}

export default function AdminOrder({ loaderData }: Route.ComponentProps) {
  const { order: o, outbox } = loaderData;
  const m = (c: number) => formatMoney(c, o.currency, "de");
  const addr = (a: typeof o.billing | null) => (a ? [a.company, a.name, a.street, `${a.zip} ${a.city}`, a.country, a.phone].filter(Boolean) : []);
  return (
    <>
      <Link to="/admin/orders" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-fg hover:text-fg"><ArrowLeft size={14} /> Bestellungen</Link>
      <PageHeader
        title={o.number}
        subtitle={<>{new Date(o.createdAt).toLocaleString("de-CH")} · {o.kind === "request" ? "Anfrage / Offerte" : "Bestellung"} {o.isTrade && <Badge tone="primary" className="ml-1">B2B</Badge>}</>}
        actions={
          <Form method="post" className="flex gap-2">
            <input type="hidden" name="intent" value="status" />
            <Select name="status" defaultValue={o.status} size="sm" className="w-44">{ORDER_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
            <Button type="submit" size="sm">Status setzen</Button>
          </Form>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Rechnungsadresse"><address className="text-sm not-italic leading-relaxed">{addr(o.billing).map((l, i) => <div key={i}>{l}</div>)}<a href={`mailto:${o.email}`} className="mt-2 block text-primary">{o.email}</a></address></Panel>
        <Panel title="Lieferung">
          <div className="grid gap-1 text-sm">
            {o.shipping ? addr(o.shipping).map((l, i) => <div key={i}>{l}</div>) : <div className="text-muted-fg">wie Rechnungsadresse</div>}
            <div className="mt-2">Versand: <b>{o.shippingMethod}</b></div>
            {o.deliveryDate && <div>Wunschtermin: <b>{o.deliveryDate}</b></div>}
            {o.poNumber && <div>Referenz: <b>{o.poNumber}</b></div>}
          </div>
        </Panel>
        <Panel title="Status">
          <dl className="grid grid-cols-[90px_1fr] gap-y-2.5 text-sm">
            <dt className="text-muted-fg">Bestellung</dt><dd><Badge tone={STATUS_TONE[o.status]}>{label(o.status)}</Badge></dd>
            <dt className="text-muted-fg">Zahlung</dt><dd className="flex items-center gap-2"><Badge tone={o.paymentStatus === "paid" ? "success" : "neutral"}>{label(o.paymentMethod)} · {label(o.paymentStatus)}</Badge>
              {o.paymentStatus !== "paid" && o.kind === "order" && <Form method="post"><input type="hidden" name="intent" value="paid" /><button className="text-[12px] text-primary underline">als bezahlt</button></Form>}</dd>
            <dt className="text-muted-fg">vinX</dt><dd><Badge tone={o.erpStatus === "transferred" ? "success" : o.erpStatus === "failed" ? "danger" : "warning"}>{label(o.erpStatus)}</Badge> <span className="text-[12px] text-muted-fg">{o.erpId}</span></dd>
          </dl>
        </Panel>
      </div>

      <div className="mt-6">
        <DataTable head={["Art.-Nr.", "Artikel", "Menge", "Netto", "Brutto", "MWST", "Total"]}>
          {o.items.map((i) => (
            <tr key={i.id}>
              <td className="font-mono text-[13px]">{i.sku}</td><td>{i.name}</td><td className="tabular-nums">{i.qty}</td>
              <td className="tabular-nums">{m(i.unitNet)}</td><td className="tabular-nums">{m(i.unitGross)}</td><td className="tabular-nums">{i.taxRate} %</td>
              <td className="text-right tabular-nums">{m(i.lineGross)}</td>
            </tr>
          ))}
          <tr><td colSpan={6} className="text-right text-muted-fg">Zwischensumme netto / brutto</td><td className="text-right tabular-nums">{m(o.subtotalNet)} / {m(o.subtotalGross)}</td></tr>
          {o.discountGross > 0 && <tr><td colSpan={6} className="text-right text-muted-fg">Rabatt {o.couponCode}</td><td className="text-right tabular-nums">− {m(o.discountGross)}</td></tr>}
          <tr><td colSpan={6} className="text-right text-muted-fg">Versand</td><td className="text-right tabular-nums">{m(o.shippingGross)}</td></tr>
          <tr><td colSpan={6} className="text-right font-semibold">Total inkl. MWST</td><td className="text-right font-semibold tabular-nums">{m(o.totalGross)}</td></tr>
        </DataTable>
        {o.notes && <Panel title="Bemerkung" className="mt-6"><p className="whitespace-pre-line text-sm">{o.notes}</p></Panel>}
      </div>

      {outbox.length > 0 && (
        <Panel title="vinX-Übertragung" className="mt-6">
          <ul className="grid gap-2 text-sm">
            {outbox.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3">
                <Badge tone={x.status === "sent" ? "success" : x.status === "failed" ? "danger" : "warning"}>{label(x.status)}</Badge>
                <span className="text-muted-fg">{x.attempts} Versuch(e){x.sentAt ? ` · ${new Date(x.sentAt).toLocaleString("de-CH")}` : ""}</span>
                {x.lastError && <code className="max-w-full truncate rounded-badge bg-muted px-2 py-0.5 text-[12px]">{x.lastError}</code>}
                {x.status !== "sent" && <Form method="post"><input type="hidden" name="intent" value="retry" /><input type="hidden" name="outboxId" value={x.id} /><Button type="submit" size="sm" variant="secondary"><RotateCw size={13} /> Erneut senden</Button></Form>}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
