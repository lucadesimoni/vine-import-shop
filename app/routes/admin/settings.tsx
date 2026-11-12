import { asc, eq } from "drizzle-orm";
import { data, Form, useActionData } from "react-router";
import type { Route } from "./+types/settings";
import { getDb, schema } from "~/.server/db";
import { getSettings, saveSetting } from "~/.server/settings";
import { LOCALES, LOCALE_LABELS } from "~/lib/localized";
import { parseMoneyInput } from "~/lib/money";
import { Checkbox, Field, Input, Notice, Select, Textarea } from "~/components/ui";
import { formToObject, PageHeader, Panel, SaveBar, Toggle } from "~/components/admin";

export async function loader() {
  const db = await getDb();
  const [{ shop }, groups] = await Promise.all([getSettings("shop"), db.select().from(schema.customerGroups).orderBy(asc(schema.customerGroups.id))]);
  return { shop, groups, stripeKey: !!process.env.STRIPE_SECRET_KEY };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const o = formToObject(form) as Record<string, any>;
  const { shop } = await getSettings("shop");
  let shipping = shop.shipping;
  try {
    shipping = JSON.parse(String(o.shippingJson));
  } catch {
    return data({ error: "Versand: JSON ungültig" }, { status: 400 });
  }
  const locales = LOCALES.filter((l) => form.has(`locale.${l}`));
  await saveSetting("shop", {
    ...shop,
    locales: locales.length ? locales : [shop.defaultLocale],
    defaultLocale: locales.includes(o.defaultLocale) ? o.defaultLocale : locales[0] ?? shop.defaultLocale,
    priceVisibility: o.priceVisibility,
    consumerCheckout: form.has("consumerCheckout"),
    guestCheckout: form.has("guestCheckout"),
    stockDisplay: o.stockDisplay,
    stockLow: Number(o.stockLow),
    stockHigh: Number(o.stockHigh),
    ageGate: form.has("ageGate"),
    minAge: Number(o.minAge),
    orderPrefix: String(o.orderPrefix).toUpperCase().slice(0, 8),
    notifyEmail: o.notifyEmail,
    tax: { standard: Number(o.tax.standard), reduced: Number(o.tax.reduced) },
    shipping,
    payments: {
      invoice: { enabled: form.has("pay.invoice"), tradeOnly: form.has("pay.invoiceTradeOnly"), termsDays: Number(o.invoiceDays) || 30 },
      prepayment: { enabled: form.has("pay.prepayment"), holder: o.bank.holder, iban: o.bank.iban, bank: o.bank.bank },
      stripe: { enabled: form.has("pay.stripe") },
    },
    trade: { ...shop.trade, requireUid: form.has("trade.requireUid"), defaultGroup: o.trade.defaultGroup, quickOrder: form.has("trade.quickOrder"), priceListExport: form.has("trade.priceListExport") },
  });
  const db = await getDb();
  for (const [id, g] of Object.entries((o.group ?? {}) as Record<string, Record<string, string>>)) {
    await db.update(schema.customerGroups).set({ name: g.name, discountPct: Number(g.discount) || 0, minOrderCents: parseMoneyInput(g.minOrder ?? "0"), showNet: g.showNet === "on", erpCode: g.erpCode || null }).where(eq(schema.customerGroups.id, Number(id)));
  }
  return { ok: true };
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { shop, groups, stripeKey } = loaderData;
  const result = useActionData<typeof action>();
  return (
    <Form method="post">
      <PageHeader title="Einstellungen" subtitle="Verkaufsmodell, Sprachen, Preise, Versand und Zahlung." />
      {result && "error" in result && <Notice tone="danger" className="mb-6">{result.error}</Notice>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Verkaufsmodell" description="B2B-only, B2C oder beides — mit Preisanzeige je Kundengruppe.">
          <div className="grid gap-4">
            <Field label="Preise sichtbar für">
              {(id) => (
                <Select id={id} name="priceVisibility" defaultValue={shop.priceVisibility}>
                  <option value="public">Alle Besucher</option>
                  <option value="login">Angemeldete Kunden</option>
                  <option value="trade">Nur freigegebene Geschäftskunden (sonst «Preis auf Anfrage»)</option>
                </Select>
              )}
            </Field>
            <div className="divide-y divide-border">
              <Toggle name="consumerCheckout" label="Privatkunden können bestellen" defaultChecked={shop.consumerCheckout} />
              <Toggle name="guestCheckout" label="Bestellung ohne Konto (Gast)" defaultChecked={shop.guestCheckout} />
              <Toggle name="ageGate" label="Altersbestätigung" description="Checkbox im Checkout bei alkoholischen Produkten" defaultChecked={shop.ageGate} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Mindestalter">{(id) => <Input id={id} name="minAge" type="number" min={16} max={21} defaultValue={shop.minAge} />}</Field>
              <Field label="Bestellnummer-Präfix">{(id) => <Input id={id} name="orderPrefix" defaultValue={shop.orderPrefix} maxLength={8} />}</Field>
            </div>
            <Field label="Benachrichtigungen an" hint="Neue Bestellungen, B2B-Anträge, Kontaktanfragen">{(id) => <Input id={id} name="notifyEmail" type="email" defaultValue={shop.notifyEmail} />}</Field>
          </div>
        </Panel>

        <Panel title="Sprachen">
          <div className="grid gap-3">
            {LOCALES.map((l) => <Checkbox key={l} name={`locale.${l}`} defaultChecked={shop.locales.includes(l)} label={LOCALE_LABELS[l]} />)}
            <Field label="Standardsprache" className="mt-2 max-w-xs">{(id) => <Select id={id} name="defaultLocale" defaultValue={shop.defaultLocale}>{LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABELS[l]}</option>)}</Select>}</Field>
          </div>
        </Panel>

        <Panel title="Kundengruppen" description="Preislisten & Staffeln kommen aus vinX (Preisgruppe ↔ vinX-Code). Rabatt gilt, wenn keine Listenpreise vorhanden sind." className="xl:col-span-2">
          <div className="grid gap-3">
            <div className="hidden grid-cols-[1.5fr_1fr_1fr_1fr_auto] gap-3 text-[11px] uppercase tracking-wider text-muted-fg md:grid"><span>Name</span><span>Rabatt %</span><span>Mindestbestellung CHF netto</span><span>vinX-Preisgruppe</span><span>Netto-Anzeige</span></div>
            {groups.map((g) => (
              <div key={g.id} className="grid grid-cols-2 items-center gap-3 md:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
                <Input name={`group.${g.id}.name`} defaultValue={g.name} className="h-10 text-sm" aria-label="Name" />
                <Input name={`group.${g.id}.discount`} defaultValue={g.discountPct} inputMode="decimal" className="h-10 text-sm" aria-label="Rabatt" />
                <Input name={`group.${g.id}.minOrder`} defaultValue={(g.minOrderCents / 100).toFixed(2)} inputMode="decimal" className="h-10 text-sm" aria-label="Mindestbestellung" />
                <Input name={`group.${g.id}.erpCode`} defaultValue={g.erpCode ?? ""} className="h-10 text-sm" aria-label="vinX-Code" />
                <Checkbox name={`group.${g.id}.showNet`} defaultChecked={g.showNet} label={g.isTrade ? "B2B" : "B2C"} />
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Geschäftskunden (B2B)">
          <div className="divide-y divide-border">
            <Toggle name="trade.requireUid" label="UID-Nummer verlangen" defaultChecked={shop.trade.requireUid} />
            <Toggle name="trade.quickOrder" label="Schnellbestellung (Art.-Nr. / Excel)" defaultChecked={shop.trade.quickOrder} />
            <Toggle name="trade.priceListExport" label="Preisliste als CSV" defaultChecked={shop.trade.priceListExport} />
          </div>
          <Field label="Standardgruppe für neue B2B-Kunden" className="mt-3 max-w-xs">{(id) => <Select id={id} name="trade.defaultGroup" defaultValue={shop.trade.defaultGroup}>{groups.filter((g) => g.isTrade).map((g) => <option key={g.id} value={g.code}>{g.name}</option>)}</Select>}</Field>
        </Panel>

        <Panel title="Lager & Steuern">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Lageranzeige">{(id) => <Select id={id} name="stockDisplay" defaultValue={shop.stockDisplay}><option value="levels">Stufen</option><option value="exact">Exakte Menge</option><option value="hidden">Ausblenden</option></Select>}</Field>
            <Field label="«Nur noch wenige» unter">{(id) => <Input id={id} name="stockLow" type="number" defaultValue={shop.stockLow} />}</Field>
            <Field label="«Gut an Lager» ab">{(id) => <Input id={id} name="stockHigh" type="number" defaultValue={shop.stockHigh} />}</Field>
            <Field label="MWST Normalsatz %">{(id) => <Input id={id} name="tax.standard" defaultValue={shop.tax.standard} inputMode="decimal" />}</Field>
            <Field label="MWST reduziert %">{(id) => <Input id={id} name="tax.reduced" defaultValue={shop.tax.reduced} inputMode="decimal" />}</Field>
          </div>
        </Panel>

        <Panel title="Zahlungsarten">
          <div className="divide-y divide-border">
            <Toggle name="pay.invoice" label="Rechnung" defaultChecked={shop.payments.invoice.enabled} />
            <Toggle name="pay.invoiceTradeOnly" label="Rechnung nur für Geschäftskunden" defaultChecked={shop.payments.invoice.tradeOnly} />
            <Toggle name="pay.prepayment" label="Vorauskasse" defaultChecked={shop.payments.prepayment.enabled} />
            <Toggle name="pay.stripe" label="Karte / TWINT (Stripe)" description={stripeKey ? "Schlüssel konfiguriert" : "STRIPE_SECRET_KEY fehlt (Umgebungsvariable)"} defaultChecked={shop.payments.stripe.enabled} />
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Zahlungsfrist (Tage)">{(id) => <Input id={id} name="invoiceDays" type="number" defaultValue={shop.payments.invoice.termsDays} />}</Field>
            <Field label="Kontoinhaber">{(id) => <Input id={id} name="bank.holder" defaultValue={shop.payments.prepayment.holder} />}</Field>
            <Field label="IBAN">{(id) => <Input id={id} name="bank.iban" defaultValue={shop.payments.prepayment.iban} />}</Field>
            <Field label="Bank">{(id) => <Input id={id} name="bank.bank" defaultValue={shop.payments.prepayment.bank} />}</Field>
          </div>
        </Panel>

        <Panel title="Versandarten" description='Preise in Rappen. "rates": [[ab Einheiten, Preis]] · "audience": all | consumer | trade' className="xl:col-span-2">
          <Textarea name="shippingJson" rows={14} spellCheck={false} defaultValue={JSON.stringify(shop.shipping, null, 2)} className="font-mono text-[12.5px]" />
        </Panel>
      </div>
      <SaveBar saved={!!result && "ok" in result} />
    </Form>
  );
}
