import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { Form, Link, useActionData, useSearchParams } from "react-router";
import { Check, X } from "lucide-react";
import type { Route } from "./+types/customers";
import { getDb, schema } from "~/.server/db";
import { emit } from "~/.server/events";
import { erpConnected } from "~/.server/erp-ownership";
import { bulkIds, countAll, listParams } from "~/.server/admin-list";
import { formatMoney } from "~/lib/money";
import { getSetting } from "~/.server/settings";
import { Badge, Button, Notice, Select } from "~/components/ui";
import { DataTable, label, ListToolbar, PageHeader, Panel, RowCheck } from "~/components/admin";

const u = schema.users;
const ORDERS = sql<number>`(select count(*)::int from orders oc where oc.user_id = users.id)`;
const REVENUE = sql<number>`(select coalesce(sum(oc.total_gross), 0)::int from orders oc where oc.user_id = users.id and oc.status <> 'cancelled' and oc.kind = 'order')`;

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url).searchParams;
  const list = listParams(request, {
    sorts: { name: u.name, company: u.company, created: u.createdAt, orders: ORDERS, revenue: REVENUE, status: sql`case when users.trade_status = 'pending' then 0 else 1 end` },
    defaultSort: "status",
  });
  const where: SQL[] = [eq(u.role, "customer")];
  if (url.get("status") === "consumer") where.push(isNull(u.tradeStatus));
  else if (url.get("status")) where.push(eq(u.tradeStatus, url.get("status") as "pending"));
  if (url.get("group")) where.push(eq(u.groupId, Number(url.get("group"))));
  if (url.get("erp") === "linked") where.push(isNotNull(u.erpId));
  if (url.get("erp") === "unlinked") where.push(isNull(u.erpId));
  if (list.like) where.push(or(ilike(u.email, list.like), ilike(u.name, list.like), ilike(u.company, list.like), ilike(u.erpId, list.like), ilike(u.uidNumber, list.like), sql`${u.billing}->>'city' ilike ${list.like}`)!);
  const cond = and(...where);
  const db = await getDb();
  const [customers, [{ n }], groups, inquiries, erp, currency] = await Promise.all([
    db.select({
      id: u.id, email: u.email, name: u.name, company: u.company, uid: u.uidNumber, groupId: u.groupId, city: sql<string | null>`${u.billing}->>'city'`,
      tradeStatus: u.tradeStatus, erpId: u.erpId, createdAt: u.createdAt, orders: ORDERS, revenue: REVENUE,
    }).from(u).where(cond).orderBy(...list.orderBy, desc(u.createdAt)).limit(list.limit).offset(list.offset),
    db.select({ n: countAll }).from(u).where(cond),
    db.select().from(schema.customerGroups).orderBy(asc(schema.customerGroups.id)),
    db.select().from(schema.inquiries).where(and(eq(schema.inquiries.kind, "trade"), eq(schema.inquiries.status, "open"))).orderBy(desc(schema.inquiries.createdAt)).limit(20),
    erpConnected(),
    getSetting("shop").then((s) => s.currency),
  ]);
  return { customers, list: list.meta(n), groups, inquiries, erp, currency };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const db = await getDb();
  const intent = form.get("intent");
  if (intent === "inquiry-done") {
    await db.update(schema.inquiries).set({ status: "done" }).where(eq(schema.inquiries.id, Number(form.get("id"))));
    return { message: "Anfrage erledigt." };
  }
  const ids = intent === "bulk" ? bulkIds(form) : [Number(form.get("id"))].filter(Boolean);
  const op = intent === "bulk" ? String(form.get("action") ?? "") : String(intent);
  if (!ids.length) return { message: "Nichts ausgewählt." };
  if (op === "approve") {
    const trade = await db.query.customerGroups.findFirst({ where: eq(schema.customerGroups.code, "trade") });
    for (const id of ids) {
      const cur = await db.query.users.findFirst({ where: eq(u.id, id) });
      await db.update(u).set({ tradeStatus: "approved", groupId: Number(form.get("groupId")) || (cur?.tradeStatus === "approved" ? cur.groupId : trade?.id) || cur?.groupId, updatedAt: new Date() }).where(eq(u.id, id));
      await emit("trade.approved", { userId: id });
    }
    return { message: `${ids.length} freigegeben.` };
  }
  if (op === "reject") {
    const consumer = await db.query.customerGroups.findFirst({ where: eq(schema.customerGroups.code, "consumer") });
    await db.update(u).set({ tradeStatus: "rejected", groupId: consumer?.id, updatedAt: new Date() }).where(inArray(u.id, ids));
    return { message: `${ids.length} abgelehnt.` };
  }
  if (op.startsWith("group:")) {
    await db.update(u).set({ groupId: Number(op.slice(6)), updatedAt: new Date() }).where(inArray(u.id, ids));
    for (const id of ids) await emit("customer.updated", { userId: id });
    return { message: `${ids.length} Kunden: Gruppe geändert.` };
  }
  if (op === "push") {
    for (const id of ids) await emit("customer.updated", { userId: id });
    return { message: `${ids.length} Kunden an vinX übergeben (Outbox).` };
  }
  return { message: "Unbekannte Aktion." };
}

export default function Customers({ loaderData }: Route.ComponentProps) {
  const { customers, list, groups, inquiries, erp, currency } = loaderData;
  const result = useActionData<typeof action>();
  const [params] = useSearchParams();
  const groupName = (id: number | null) => groups.find((g) => g.id === id)?.name ?? "—";
  return (
    <>
      <PageHeader title="Kunden" subtitle={erp ? "B2B-Anträge freigeben, Kundengruppen zuordnen. Änderungen gehen an vinX, Adressänderungen aus vinX kommen automatisch zurück." : "B2B-Anträge freigeben und Kundengruppen zuordnen."} />
      {result?.message && <Notice tone="success" className="mb-5">{result.message}</Notice>}
      {inquiries.length > 0 && (
        <Panel title="Offene B2B-Anfragen ohne Konto" className="mb-6">
          <ul className="grid gap-3 text-sm">
            {inquiries.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                <span><b>{i.data.business}</b> · {i.data.contact} · <a href={`mailto:${i.email}`} className="text-primary">{i.email}</a> {i.data.phone && `· ${i.data.phone}`} {i.data.uid && <Badge className="ml-1">{i.data.uid}</Badge>}</span>
                <Form method="post"><input type="hidden" name="intent" value="inquiry-done" /><input type="hidden" name="id" value={i.id} /><Button type="submit" size="sm" variant="secondary"><Check size={13} /> Erledigt</Button></Form>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <ListToolbar placeholder="Name, Firma, E-Mail, Ort, UID oder vinX-Nr." meta={list}>
        <Select name="status" defaultValue={params.get("status") ?? ""} size="sm" className="w-44" aria-label="Status">
          <option value="">Alle Kunden</option><option value="pending">B2B offen</option><option value="approved">B2B freigegeben</option><option value="rejected">B2B abgelehnt</option><option value="consumer">Privatkunden</option>
        </Select>
        <Select name="group" defaultValue={params.get("group") ?? ""} size="sm" className="w-40" aria-label="Gruppe">
          <option value="">Alle Gruppen</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        {erp && (
          <Select name="erp" defaultValue={params.get("erp") ?? ""} size="sm" className="w-40" aria-label="vinX">
            <option value="">vinX: alle</option><option value="linked">Verknüpft</option><option value="unlinked">Nicht verknüpft</option>
          </Select>
        )}
      </ListToolbar>
      <DataTable
        meta={list}
        empty={!customers.length}
        bulk={[{ value: "approve", label: "B2B freigeben" }, ...groups.map((g) => ({ value: `group:${g.id}`, label: `→ ${g.name}` })), ...(erp ? [{ value: "push", label: "An vinX senden" }] : []), { value: "reject", label: "Ablehnen", tone: "danger" as const }]}
        head={[{ label: "Kunde", sort: "name" }, { label: "Firma", sort: "company" }, { label: "B2B", sort: "status" }, "Gruppe", { label: "Best.", sort: "orders", className: "text-right" }, { label: "Umsatz", sort: "revenue", className: "text-right" }, ""]}
      >
        {customers.map((c) => (
          <tr key={c.id} className={c.tradeStatus === "pending" ? "bg-warning-soft/50" : undefined}>
            <RowCheck id={c.id} label={c.name || c.email} />
            <td><Link to={`/admin/customers/${c.id}`} className="font-medium hover:underline">{c.name || c.email}</Link><span className="block text-[12px] text-muted-fg">{c.email}</span></td>
            <td>{c.company ?? "—"}<span className="block text-[12px] text-muted-fg">{[c.city, c.uid].filter(Boolean).join(" · ")}</span></td>
            <td>{c.tradeStatus ? <Badge tone={c.tradeStatus === "approved" ? "success" : c.tradeStatus === "pending" ? "warning" : "danger"}>{label(c.tradeStatus)}</Badge> : <span className="text-muted-fg">Privat</span>}</td>
            <td className="whitespace-nowrap">{groupName(c.groupId)}{c.erpId && <Badge className="ml-2" title="vinX-Adressnummer">vinX {c.erpId}</Badge>}</td>
            <td className="text-right tabular-nums">{c.orders}</td>
            <td className="whitespace-nowrap text-right tabular-nums">{c.revenue ? formatMoney(c.revenue, currency, "de") : "—"}</td>
            <td className="whitespace-nowrap text-right">
              {c.tradeStatus === "pending" && (
                <Form method="post" className="inline-flex gap-1">
                  <input type="hidden" name="id" value={c.id} />
                  <Button type="submit" name="intent" value="approve" size="sm"><Check size={13} /> Freigeben</Button>
                  <Button type="submit" name="intent" value="reject" size="sm" variant="ghost" aria-label="Ablehnen"><X size={13} /></Button>
                </Form>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
