import { Fragment, useState } from "react";
import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { data, Form, Link, redirect, useActionData } from "react-router";
import { ArrowLeft, ArrowUpRight, Mail, RefreshCw, Trash2 } from "lucide-react";
import type { Route } from "./+types/customer";
import { getDb, schema } from "~/.server/db";
import { emit } from "~/.server/events";
import { sendTokenMail } from "~/.server/password-reset";
import { erpConnected } from "~/.server/erp-ownership";
import { getSettings } from "~/.server/settings";
import { customerPaymentRule } from "~/.server/payments";
import { PAYMENT_METHODS } from "~/lib/payment-methods";
import { LOCALE_LABELS, LOCALES } from "~/lib/localized";
import { formatMoney } from "~/lib/money";
import { Badge, Button, Checkbox, Field, Input, Notice, Select } from "~/components/ui";
import { DataTable, label, PageHeader, Panel, SaveBar } from "~/components/admin";
import { STATUS_TONE } from "~/components/status";

const u = schema.users;

export async function loader({ params }: Route.LoaderArgs) {
  const db = await getDb();
  const id = Number(params.id);
  const customer = await db.query.users.findFirst({ where: and(eq(u.id, id), eq(u.role, "customer")) });
  if (!customer) throw data("Not found", { status: 404 });
  const [groups, orders, [stats], outbox, [conditions], erp, { shop }] = await Promise.all([
    db.select().from(schema.customerGroups).orderBy(asc(schema.customerGroups.id)),
    db.select().from(schema.orders).where(eq(schema.orders.userId, id)).orderBy(desc(schema.orders.createdAt)).limit(10),
    db.select({ n: sql<number>`count(*)::int`, revenue: sql<number>`coalesce(sum(total_gross) filter (where status <> 'cancelled' and kind = 'order'), 0)::int`, last: sql<string | null>`max(created_at)` }).from(schema.orders).where(eq(schema.orders.userId, id)),
    db.select().from(schema.erpOutbox).where(and(eq(schema.erpOutbox.type, "customer"), eq(schema.erpOutbox.refId, id))).orderBy(desc(schema.erpOutbox.id)).limit(1),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.conditions).where(eq(schema.conditions.customerId, id)),
    erpConnected(),
    getSettings("shop"),
  ]);
  const { passwordHash, resetToken: _r, resetExpires: _e, ...rest } = customer; // never send secrets to the browser
  const c = { ...rest, passwordSet: passwordHash.startsWith("scrypt$") };
  // payment methods: what the shop offers, and what this customer gets (and why)
  const { vinx } = await getSettings("vinx");
  const offered = PAYMENT_METHODS.filter((m) => shop.payments[m].enabled);
  const group = groups.find((g) => g.id === customer.groupId) ?? null;
  const rule = customerPaymentRule({ ...customer, group } as never, vinx, offered);
  const payments = { offered, effective: rule.methods ? offered.filter((m) => rule.methods!.includes(m)) : offered, source: rule.source, erpCondition: customer.erpPaymentConditionId };
  return { customer: c, groups, orders, stats, sync: outbox[0] ?? null, conditions: conditions.n, erp, currency: shop.currency, locales: shop.locales, payments };
}

export async function action({ request, params }: Route.ActionArgs) {
  const id = Number(params.id);
  const form = await request.formData();
  const db = await getDb();
  if (form.get("intent") === "delete") {
    const c = await db.query.users.findFirst({ where: eq(u.id, id) });
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.orders).where(eq(schema.orders.userId, id));
    if (c?.erpId) return data({ error: "Mit vinX verknüpfte Kunden werden in vinX verwaltet." }, { status: 400 });
    if (n > 0) return data({ error: "Kunden mit Bestellungen können nicht gelöscht werden (Aufbewahrungspflicht) — B2B-Status auf „Abgelehnt“ setzen." }, { status: 400 });
    await db.delete(u).where(eq(u.id, id));
    return redirect("/admin/customers");
  }
  if (form.get("intent") === "invite") {
    await sendTokenMail(id, "invite", new URL(request.url).origin);
    return { ok: "Einladung gesendet — der Link ist 14 Tage gültig." };
  }
  if (form.get("intent") === "push") {
    await emit("customer.updated", { userId: id });
    return { ok: "An vinX übergeben — Status siehe „Abgleich“." };
  }
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const email = s("email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return data({ error: "Ungültige E-Mail-Adresse" }, { status: 400 });
  const self = await db.query.users.findFirst({ where: eq(u.id, id), columns: { storefrontId: true } });
  // e-mails are unique per shop (main shop / each storefront)
  const taken = await db.query.users.findFirst({ where: and(sql`lower(${u.email}) = ${email}`, ne(u.id, id), self?.storefrontId ? eq(u.storefrontId, self.storefrontId) : isNull(u.storefrontId)) });
  if (taken) return data({ error: "Diese E-Mail-Adresse wird bereits verwendet" }, { status: 400 });
  const status = s("tradeStatus");
  const before = await db.query.users.findFirst({ where: eq(u.id, id) });
  await db.update(u).set({
    email, name: s("name"), company: s("company") || null, uidNumber: s("uidNumber") || null, phone: s("phone") || null,
    locale: (LOCALES as readonly string[]).includes(s("locale")) ? s("locale") : "de",
    groupId: Number(s("groupId")) || null,
    tradeStatus: ["pending", "approved", "rejected"].includes(status) ? (status as "approved") : null,
    erpId: s("erpId") || null,
    // own payment methods only when "automatic" is off (else vinX terms / group decide)
    paymentMethods: form.has("payAuto") ? null : PAYMENT_METHODS.filter((m) => form.has(`pay.${m}`)),
    billing: { name: s("name"), company: s("company") || undefined, street: s("street"), zip: s("zip"), city: s("city"), country: s("country").toUpperCase() || "CH" },
    updatedAt: new Date(),
  }).where(eq(u.id, id));
  if (status === "approved" && before?.tradeStatus !== "approved") await emit("trade.approved", { userId: id });
  else await emit("customer.updated", { userId: id, previousEmail: before?.email });
  return { ok: "Gespeichert." };
}

export default function AdminCustomer({ loaderData }: Route.ComponentProps) {
  const { customer: c, groups, orders, stats, sync, conditions, erp, currency, locales, payments } = loaderData;
  const result = useActionData<typeof action>();
  const b = c.billing;
  return (
    <>
      <Link to="/admin/customers" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-fg hover:text-fg"><ArrowLeft size={14} /> Kunden</Link>
      <PageHeader
        title={c.company || c.name || c.email}
        subtitle={<span className="flex flex-wrap items-center gap-2">{c.email} · Kunde seit {new Date(c.createdAt).toLocaleDateString("de-CH")}{c.erpId && <Badge>vinX {c.erpId}</Badge>}</span>}
      />
      {result && "error" in result && <Notice tone="danger" className="mb-6">{result.error}</Notice>}
      {result && "ok" in result && <Notice tone="success" className="mb-6">{result.ok}</Notice>}
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Form method="post" className="grid content-start gap-6" id="customer">
          <Panel title="Kontakt">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">{(id) => <Input id={id} name="name" defaultValue={c.name} required />}</Field>
              <Field label="E-Mail (Login)">{(id) => <Input id={id} name="email" type="email" defaultValue={c.email} required />}</Field>
              <Field label="Firma">{(id) => <Input id={id} name="company" defaultValue={c.company ?? ""} />}</Field>
              <Field label="UID / MWST-Nr.">{(id) => <Input id={id} name="uidNumber" defaultValue={c.uidNumber ?? ""} placeholder="CHE-123.456.789" />}</Field>
              <Field label="Telefon">{(id) => <Input id={id} name="phone" type="tel" defaultValue={c.phone ?? ""} />}</Field>
              <Field label="Sprache">{(id) => <Select id={id} name="locale" defaultValue={c.locale}>{LOCALES.filter((l) => locales.includes(l) || l === c.locale).map((l) => <option key={l} value={l}>{LOCALE_LABELS[l]}</option>)}</Select>}</Field>
            </div>
          </Panel>
          <Panel title="Rechnungsadresse">
            <div className="grid gap-4 sm:grid-cols-[1fr_120px_1fr_100px]">
              <Field label="Strasse" className="sm:col-span-4">{(id) => <Input id={id} name="street" defaultValue={b?.street ?? ""} />}</Field>
              <Field label="PLZ">{(id) => <Input id={id} name="zip" defaultValue={b?.zip ?? ""} />}</Field>
              <Field label="Ort" className="sm:col-span-2">{(id) => <Input id={id} name="city" defaultValue={b?.city ?? ""} />}</Field>
              <Field label="Land">{(id) => <Input id={id} name="country" defaultValue={b?.country ?? "CH"} maxLength={2} className="uppercase" />}</Field>
            </div>
          </Panel>
          <Panel title="Konditionen" description="Gruppe bestimmt Preisliste & Rabatte; kundenspezifische Konditionen kommen dazu.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Kundengruppe">{(id) => <Select id={id} name="groupId" defaultValue={c.groupId ?? ""}><option value="">—</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>}</Field>
              <Field label="B2B-Status">{(id) => <Select id={id} name="tradeStatus" defaultValue={c.tradeStatus ?? ""}><option value="">Privatkunde</option><option value="pending">Offen</option><option value="approved">Freigegeben</option><option value="rejected">Abgelehnt</option></Select>}</Field>
              <Field label="vinX-Adressnummer" hint={erp ? "Leer = wird beim nächsten Senden angelegt" : undefined}>{(id) => <Input id={id} name="erpId" defaultValue={c.erpId ?? ""} className="font-mono" />}</Field>
            </div>
            <PaymentMethodsField payments={payments} own={c.paymentMethods} />
            <p className="mt-4 text-note text-muted-fg">
              {conditions} kundenspezifische Kondition{conditions === 1 ? "" : "en"} · <Link to="/admin/conditions" className="underline underline-offset-4">Konditionen verwalten</Link>
            </p>
          </Panel>
          <SaveBar saved={false} />
        </Form>

        <div className="grid content-start gap-6">
          {c.erpInfo && Object.keys(c.erpInfo).length > 0 && (
            <Panel title="Stammdaten aus vinX" description="Read-only — gepflegt in vinX, übernommen mit dem Job „Kundenadressen“.">
              <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-5 gap-y-2 text-sm">
                {([
                  ["Aussendienst", c.erpInfo.salesRep?.name],
                  ["Tour", c.erpInfo.tour],
                  ["Liefertage", c.erpInfo.deliveryDays?.map((d) => ["", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][d]).join(", ")],
                  ["Kategorie", c.erpInfo.category],
                  ["Kette", c.erpInfo.chain],
                  ["Vertriebsweg", c.erpInfo.channel],
                  ["Sortiment", c.erpInfo.selectionCodeId != null ? `${c.erpInfo.assortment ?? "Selektion"} (${c.erpInfo.selectionCodeId})` : undefined],
                  ["Marketing", c.erpInfo.marketing?.join(", ")],
                  ["Abteilung", c.erpInfo.department],
                  ["Kontaktperson", c.erpInfo.contactPersonId != null ? `#${c.erpInfo.contactPersonId} (eigenes Login)` : undefined],
                ] as const).filter(([, v]) => v).map(([k, v]) => <Fragment key={k}><dt className="text-muted-fg">{k}</dt><dd>{v}</dd></Fragment>)}
              </dl>
            </Panel>
          )}
          <Panel title="Zugang" description={c.passwordSet ? "Der Kunde hat ein Passwort gesetzt." : "Noch kein Passwort — z. B. nach einem Import."}>
            <Form method="post"><Button type="submit" name="intent" value="invite" variant="secondary" size="sm"><Mail size={13} /> {c.passwordSet ? "Link zum Zurücksetzen senden" : "Einladung senden"}</Button></Form>
          </Panel>
          <Panel title="Kennzahlen">
            <dl className="grid grid-cols-2 gap-4">
              <div><dt className="text-xs text-muted-fg">Bestellungen</dt><dd className="font-display text-2xl tabular-nums">{stats.n}</dd></div>
              <div><dt className="text-xs text-muted-fg">Umsatz</dt><dd className="font-display text-2xl tabular-nums">{formatMoney(stats.revenue, currency, "de")}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-muted-fg">Letzte Bestellung</dt><dd className="text-sm">{stats.last ? new Date(stats.last).toLocaleDateString("de-CH") : "—"}</dd></div>
            </dl>
          </Panel>
          {erp && (
            <Panel title="Abgleich mit vinX" description="Shop → vinX bei jeder Änderung (OnlineAddress). vinX → Shop: Adressänderungen per Job „Kundenadressen“.">
              {sync ? (
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center justify-between"><span className="text-muted-fg">Letzte Übertragung</span><Badge tone={sync.status === "sent" ? "success" : sync.status === "failed" ? "danger" : "warning"}>{label(sync.status)}</Badge></div>
                  <div className="text-xs text-muted-fg tabular-nums">{new Date(sync.sentAt ?? sync.createdAt).toLocaleString("de-CH")} · {sync.attempts} Versuch{sync.attempts === 1 ? "" : "e"}</div>
                  {sync.lastError && <p className="rounded-control bg-danger-soft p-2 text-xs text-danger">{sync.lastError}</p>}
                </div>
              ) : (
                <p className="text-sm text-muted-fg">Noch nicht übertragen.</p>
              )}
              <Form method="post" className="mt-4"><Button type="submit" name="intent" value="push" variant="secondary" size="sm"><RefreshCw size={13} /> Jetzt senden</Button></Form>
            </Panel>
          )}
          {!c.erpId && stats.n === 0 && (
            <Form method="post" onSubmit={(e) => !confirm("Kunde endgültig löschen?") && e.preventDefault()}>
              <input type="hidden" name="intent" value="delete" />
              <button className="flex items-center gap-1.5 px-1 text-xs text-muted-fg hover:text-danger"><Trash2 size={13} /> Kunde löschen</button>
            </Form>
          )}
        </div>
      </div>

      {orders.length > 0 && (
        <section className="mt-8 grid gap-3">
          <h2 className="font-sans text-body font-semibold">Letzte Bestellungen</h2>
          <DataTable head={["Nummer", "Datum", "Status", "Total", ""]}>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="font-medium">{o.number}</td>
                <td className="tabular-nums text-muted-fg">{new Date(o.createdAt).toLocaleDateString("de-CH")}</td>
                <td><Badge tone={STATUS_TONE[o.status]}>{label(o.status)}</Badge></td>
                <td className="tabular-nums">{o.kind === "request" ? "Anfrage" : formatMoney(o.totalGross, o.currency, "de")}</td>
                <td className="text-right"><Link to={`/admin/orders/${o.id}`} className="inline-flex items-center gap-1 text-note text-muted-fg hover:text-fg">Öffnen <ArrowUpRight size={12} /></Link></td>
              </tr>
            ))}
          </DataTable>
        </section>
      )}
    </>
  );
}

const SOURCE: Record<string, string> = { customer: "für diesen Kunden festgelegt", vinx: "aus den Zahlungsbedingungen in vinX", group: "von der Kundengruppe", none: "alle Zahlarten des Shops" };

/** Payment methods of a customer: automatic (vinX terms → group → shop) or set by hand. */
function PaymentMethodsField({ payments, own }: { payments: { offered: string[]; effective: string[]; source: string | null; erpCondition: number | null }; own: string[] | null }) {
  const [auto, setAuto] = useState(!own?.length);
  return (
    <fieldset className="mt-5 grid gap-3 border-t border-border pt-5">
      <legend className="text-field-label">Zahlarten</legend>
      <p className="text-note text-muted-fg">
        Aktuell: <strong className="text-fg">{payments.effective.map((m) => label(m)).join(", ") || "—"}</strong> · {SOURCE[payments.source ?? "none"]}
        {payments.erpCondition != null && <> · vinX-Zahlungsbedingung <code className="rounded-badge bg-muted px-1.5 py-0.5 text-xs">{payments.erpCondition}</code></>}
      </p>
      <Checkbox name="payAuto" label="Automatisch (vinX-Zahlungsbedingung, sonst Kundengruppe)" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
      {!auto && (
        <div className="flex flex-wrap gap-x-5 gap-y-2 pl-7">
          {payments.offered.map((m) => <Checkbox key={m} name={`pay.${m}`} label={label(m)} defaultChecked={(own ?? payments.effective).includes(m)} />)}
        </div>
      )}
    </fieldset>
  );
}
