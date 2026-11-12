import { asc, eq } from "drizzle-orm";
import { data, Form, useActionData } from "react-router";
import type { Route } from "./+types/settings";
import { getDb, schema } from "~/.server/db";
import { getSettings, saveSetting } from "~/.server/settings";
import { listPriceSources } from "~/.server/price-sources";
import { LOCALES, LOCALE_LABELS } from "~/lib/localized";
import { parseMoneyInput } from "~/lib/money";
import { Checkbox, Field, Input, Notice, Select, Textarea } from "~/components/ui";
import { formToObject, PageHeader, Panel, SaveBar, Toggle } from "~/components/admin";

const CHANNEL_HINTS: Record<string, string> = {
  combined: "Alle kaufen im Shop; Geschäftskunden erhalten zusätzlich das Portal.",
  separate: "Shop zeigt nur Privatkonditionen; Geschäftskunden bestellen im Portal.",
  "portal-only": "Shop-Seiten führen ins Portal — reiner Grosshandel.",
  "shop-only": "Kein Portal; Geschäftskunden nutzen Konto & Schnellbestellung im Shop.",
};

export async function loader() {
  const db = await getDb();
  const [{ shop }, groups] = await Promise.all([getSettings("shop"), db.select().from(schema.customerGroups).orderBy(asc(schema.customerGroups.id))]);
  const e = process.env;
  const keys = {
    stripe: !!e.STRIPE_SECRET_KEY && !!e.STRIPE_WEBHOOK_SECRET,
    mollie: !!e.MOLLIE_API_KEY,
    datatrans: !!e.DATATRANS_MERCHANT_ID && !!e.DATATRANS_PASSWORD && !!e.DATATRANS_HMAC_KEY,
    payrexx: !!e.PAYREXX_INSTANCE && !!e.PAYREXX_API_SECRET,
  };
  return { shop, groups, keys, priceSources: listPriceSources() };
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
    channels: {
      mode: ["combined", "separate", "portal-only", "shop-only"].includes(o.channels?.mode) ? o.channels.mode : shop.channels.mode,
      portalHost: cleanHost(o.channels?.portalHost),
      shopHost: cleanHost(o.channels?.shopHost),
    },
    originMap: {
      mode: ["auto", "regions", "world", "off"].includes(o.originMap?.mode) ? o.originMap.mode : shop.originMap.mode,
      country: /^[A-Za-z]{2}$/.test(o.originMap?.country ?? "") ? String(o.originMap.country).toUpperCase() : shop.originMap.country,
    },
    priceVisibility: o.priceVisibility,
    priceSource: listPriceSources().some((x) => x.id === o.priceSource) ? o.priceSource : shop.priceSource,
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
      mollie: { enabled: form.has("pay.mollie"), methods: list(o.pay?.mollieMethods) },
      datatrans: { enabled: form.has("pay.datatrans"), methods: list(o.pay?.datatransMethods) },
      payrexx: { enabled: form.has("pay.payrexx"), methods: list(o.pay?.payrexxMethods) },
    },
    trade: { ...shop.trade, requireUid: form.has("trade.requireUid"), defaultGroup: o.trade.defaultGroup, quickOrder: form.has("trade.quickOrder"), priceListExport: form.has("trade.priceListExport") },
  });
  const db = await getDb();
  for (const [id, g] of Object.entries((o.group ?? {}) as Record<string, Record<string, string>>)) {
    await db.update(schema.customerGroups).set({ name: g.name, discountPct: Number(g.discount) || 0, minOrderCents: parseMoneyInput(g.minOrder ?? "0"), showNet: g.showNet === "on", erpCode: g.erpCode || null }).where(eq(schema.customerGroups.id, Number(id)));
  }
  return { ok: true };
}

const list = (v: unknown) => String(v ?? "").split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

/** "https://B2B.example.ch/" → "b2b.example.ch" */
function cleanHost(v: unknown) {
  return String(v ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/:].*$/, "");
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { shop, groups, keys, priceSources } = loaderData;
  const result = useActionData<typeof action>();
  return (
    <Form method="post">
      <PageHeader title="Einstellungen" subtitle="Verkaufsmodell, Sprachen, Preise, Versand und Zahlung." />
      {result && "error" in result && <Notice tone="danger" className="mb-6">{result.error}</Notice>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Kanäle & Domains" description="Ein gemeinsamer Shop, oder ein getrennter B2C-Shop (Direktvertrieb) und ein B2B-Portal — optional je auf eigener Domain." className="xl:col-span-2">
          <div className="grid gap-5 lg:grid-cols-3">
            <Field label="Kanalmodell" hint={CHANNEL_HINTS[shop.channels.mode]}>
              {(id) => (
                <Select id={id} name="channels.mode" defaultValue={shop.channels.mode}>
                  <option value="combined">Kombiniert — ein Shop, B2B-Portal zusätzlich</option>
                  <option value="separate">Getrennt — B2C-Shop + B2B-Portal</option>
                  <option value="portal-only">Nur B2B-Portal</option>
                  <option value="shop-only">Nur Shop (ohne Portal)</option>
                </Select>
              )}
            </Field>
            <Field label="Domain B2C-Shop" hint="z. B. shop.example.ch — leer = aktuelle Domain">
              {(id) => <Input id={id} name="channels.shopHost" defaultValue={shop.channels.shopHost} placeholder="shop.example.ch" />}
            </Field>
            <Field label="Domain B2B-Portal" hint="z. B. b2b.example.ch — dort öffnet «/» direkt das Portal">
              {(id) => <Input id={id} name="channels.portalHost" defaultValue={shop.channels.portalHost} placeholder="b2b.example.ch" />}
            </Field>
          </div>
          <p className="mt-4 text-[13px] text-muted-fg">Beide Domains auf dieselbe Installation zeigen lassen. Für ein gemeinsames Login über Subdomains <code className="rounded-badge bg-muted px-1.5 py-0.5 text-[12px]">COOKIE_DOMAIN=.example.ch</code> setzen.</p>
        </Panel>
        <Panel title="Herkunftskarte" description="Produzenten-Seite: Herkunft aus Lieferanten-/Produzentendaten (Region, Land), je Produkt übersteuerbar.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kartentyp">
              {(id) => (
                <Select id={id} name="originMap.mode" defaultValue={shop.originMap.mode}>
                  <option value="auto">Automatisch</option>
                  <option value="regions">Regionen eines Landes</option>
                  <option value="world">Weltkarte (abstrahiert)</option>
                  <option value="off">Aus (nur A–Z)</option>
                </Select>
              )}
            </Field>
            <Field label="Heimatland (ISO)" hint="Regionenkarte verfügbar: IT">
              {(id) => <Input id={id} name="originMap.country" defaultValue={shop.originMap.country} maxLength={2} className="uppercase" />}
            </Field>
          </div>
        </Panel>
        <Panel title="Verkaufsmodell" description="B2B-only, B2C oder beides — mit Preisanzeige je Kundengruppe.">
          <div className="grid gap-4">
            <Field label="Preise im Shop sichtbar für" hint="Im B2B-Portal sehen Geschäftskunden nach dem Login immer ihre eigenen Preise.">
              {(id) => (
                <Select id={id} name="priceVisibility" defaultValue={shop.priceVisibility}>
                  <option value="public">Alle Besucher</option>
                  <option value="login">Angemeldete Kunden</option>
                  <option value="trade">Nur freigegebene Geschäftskunden (sonst «Preis auf Anfrage»)</option>
                </Select>
              )}
            </Field>
            <Field label="Kunden- & Gruppenpreise aus" hint="Nicht verfügbare Preise fallen automatisch auf die Plattform-Preislisten zurück.">
              {(id) => (
                <Select id={id} name="priceSource" defaultValue={shop.priceSource}>
                  {priceSources.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
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
                <Input name={`group.${g.id}.name`} defaultValue={g.name} size="sm" aria-label="Name" />
                <Input name={`group.${g.id}.discount`} defaultValue={g.discountPct} inputMode="decimal" size="sm" aria-label="Rabatt" />
                <Input name={`group.${g.id}.minOrder`} defaultValue={(g.minOrderCents / 100).toFixed(2)} inputMode="decimal" size="sm" aria-label="Mindestbestellung" />
                <Input name={`group.${g.id}.erpCode`} defaultValue={g.erpCode ?? ""} size="sm" aria-label="vinX-Code" />
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
            <Toggle name="pay.stripe" label="Stripe — Karte, Apple/Google Pay, TWINT" description={keys.stripe ? "Schlüssel konfiguriert · Webhook /api/payments/stripe" : "STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET fehlen (Umgebungsvariablen)"} defaultChecked={shop.payments.stripe.enabled} />
            <Toggle name="pay.mollie" label="Mollie — TWINT, Karte, PostFinance" description={keys.mollie ? "Schlüssel konfiguriert · Webhook /api/payments/mollie" : "MOLLIE_API_KEY fehlt"} defaultChecked={shop.payments.mollie.enabled} />
            <Toggle name="pay.datatrans" label="Datatrans (CH) — TWINT, Karte, PostFinance" description={keys.datatrans ? "Konfiguriert · Webhook /api/payments/datatrans" : "DATATRANS_MERCHANT_ID / _PASSWORD / _HMAC_KEY fehlen"} defaultChecked={shop.payments.datatrans.enabled} />
            <Toggle name="pay.payrexx" label="Payrexx (CH) — TWINT, PostFinance Pay, Karte" description={keys.payrexx ? "Konfiguriert · Webhook /api/payments/payrexx" : "PAYREXX_INSTANCE / PAYREXX_API_SECRET fehlen"} defaultChecked={shop.payments.payrexx.enabled} />
            <div className="grid gap-3 py-3 sm:grid-cols-3">
              <Field label="Mollie-Methoden" hint="leer = alle aktiven">{(id) => <Input id={id} name="pay.mollieMethods" size="sm" defaultValue={shop.payments.mollie.methods.join(", ")} placeholder="twint, creditcard" />}</Field>
              <Field label="Datatrans-Methoden" hint="z. B. TWI, VIS, ECA, PFC">{(id) => <Input id={id} name="pay.datatransMethods" size="sm" defaultValue={shop.payments.datatrans.methods.join(", ")} placeholder="TWI, VIS, ECA" />}</Field>
              <Field label="Payrexx-Methoden" hint="z. B. twint, post-finance-pay">{(id) => <Input id={id} name="pay.payrexxMethods" size="sm" defaultValue={shop.payments.payrexx.methods.join(", ")} placeholder="twint, visa" />}</Field>
            </div>
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
