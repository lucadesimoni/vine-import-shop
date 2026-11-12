import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { Form, useSearchParams, useSubmit } from "react-router";
import { Check, Search, X } from "lucide-react";
import type { Route } from "./+types/customers";
import { getDb, schema } from "~/.server/db";
import { emit } from "~/.server/events";
import { Badge, Button, Input, Select } from "~/components/ui";
import { DataTable, label, PageHeader, Panel } from "~/components/admin";

export async function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams;
  const db = await getDb();
  const where: SQL[] = [eq(schema.users.role, "customer")];
  if (q.get("status")) where.push(eq(schema.users.tradeStatus, q.get("status") as "pending"));
  if (q.get("q")) where.push(or(ilike(schema.users.email, `%${q.get("q")}%`), ilike(schema.users.name, `%${q.get("q")}%`), ilike(schema.users.company, `%${q.get("q")}%`))!);
  const [customers, groups, inquiries] = await Promise.all([
    db.select({
      id: schema.users.id, email: schema.users.email, name: schema.users.name, company: schema.users.company, uid: schema.users.uidNumber, groupId: schema.users.groupId,
      tradeStatus: schema.users.tradeStatus, erpId: schema.users.erpId, createdAt: schema.users.createdAt,
      orders: sql<number>`(select count(*)::int from orders oc where oc.user_id = users.id)`,
    }).from(schema.users).where(and(...where)).orderBy(sql`case when users.trade_status = 'pending' then 0 else 1 end`, desc(schema.users.createdAt)).limit(300),
    db.select().from(schema.customerGroups).orderBy(asc(schema.customerGroups.id)),
    db.select().from(schema.inquiries).where(and(eq(schema.inquiries.kind, "trade"), eq(schema.inquiries.status, "open"))).orderBy(desc(schema.inquiries.createdAt)).limit(20),
  ]);
  return { customers, groups, inquiries };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const db = await getDb();
  const id = Number(form.get("id"));
  const intent = form.get("intent");
  if (intent === "inquiry-done") {
    await db.update(schema.inquiries).set({ status: "done" }).where(eq(schema.inquiries.id, id));
    return { ok: true };
  }
  const groupId = Number(form.get("groupId")) || undefined;
  if (intent === "approve") {
    await db.update(schema.users).set({ tradeStatus: "approved", groupId }).where(eq(schema.users.id, id));
    await emit("trade.approved", { userId: id });
  } else if (intent === "reject") {
    const consumer = await db.query.customerGroups.findFirst({ where: eq(schema.customerGroups.code, "consumer") });
    await db.update(schema.users).set({ tradeStatus: "rejected", groupId: consumer?.id }).where(eq(schema.users.id, id));
  } else if (intent === "group") {
    await db.update(schema.users).set({ groupId, erpId: String(form.get("erpId") ?? "") || null }).where(eq(schema.users.id, id));
  }
  return { ok: true };
}

export default function Customers({ loaderData }: Route.ComponentProps) {
  const { customers, groups, inquiries } = loaderData;
  const [params] = useSearchParams();
  const submit = useSubmit();
  return (
    <>
      <PageHeader title="Kunden" subtitle="B2B-Anträge freigeben, Kundengruppen und vinX-Adressnummern zuordnen." />
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
      <Form method="get" onChange={(e) => submit(e.currentTarget, { replace: true })} className="mb-5 flex flex-wrap gap-3">
        <div className="relative min-w-64 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
          <Input name="q" defaultValue={params.get("q") ?? ""} placeholder="Name, Firma, E-Mail" size="sm" className="pl-9" />
        </div>
        <Select name="status" defaultValue={params.get("status") ?? ""} size="sm" className="w-48">
          <option value="">Alle Kunden</option><option value="pending">B2B offen</option><option value="approved">B2B freigegeben</option><option value="rejected">B2B abgelehnt</option>
        </Select>
      </Form>
      <DataTable head={["Kunde", "Firma / UID", "B2B", "Best.", "Gruppe · vinX-Adresse", ""]} empty={!customers.length}>
        {customers.map((c) => (
          <tr key={c.id} className={c.tradeStatus === "pending" ? "bg-warning-soft/50" : undefined}>
            <td>{c.name}<span className="block text-[12px] text-muted-fg">{c.email}</span></td>
            <td>{c.company ?? "—"}<span className="block font-mono text-[12px] text-muted-fg">{c.uid}</span></td>
            <td>{c.tradeStatus ? <Badge tone={c.tradeStatus === "approved" ? "success" : c.tradeStatus === "pending" ? "warning" : "danger"}>{label(c.tradeStatus)}</Badge> : "—"}</td>
            <td className="tabular-nums">{c.orders}</td>
            <td colSpan={2}>
              <Form method="post" className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={c.id} />
                <Select name="groupId" defaultValue={c.groupId ?? ""} size="sm" className="w-36" aria-label="Gruppe">{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
                <Input name="erpId" defaultValue={c.erpId ?? ""} placeholder="vinX-Nr." size="sm" className="w-28" aria-label="vinX-Adressnummer" />
                {c.tradeStatus === "pending" ? (
                  <>
                    <Button type="submit" name="intent" value="approve" size="sm"><Check size={13} /> Freigeben</Button>
                    <Button type="submit" name="intent" value="reject" size="sm" variant="ghost"><X size={13} /> Ablehnen</Button>
                  </>
                ) : (
                  <Button type="submit" name="intent" value="group" size="sm" variant="secondary">Speichern</Button>
                )}
              </Form>
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
