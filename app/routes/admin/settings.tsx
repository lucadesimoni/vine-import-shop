import { asc, eq } from "drizzle-orm";
import { data, Form, useActionData } from "react-router";
import type { Route } from "./+types/settings";
import { getDb, schema } from "~/.server/db";
import { getScopedSettings, saveSetting } from "~/.server/settings";
import { adminScope, resetScope } from "~/.server/admin-scope";
import { listPriceSources } from "~/.server/price-sources";
import { LOCALES, LOCALE_LABELS } from "~/lib/localized";
import { REGION_MAP_COUNTRIES } from "~/lib/maps/regions";
import { PAYMENT_METHODS } from "~/lib/payment-methods";
import { PRESETS, PRODUCER_TERMS, TRADE_TERMS } from "~/lib/settings";
import { parseMoneyInput } from "~/lib/money";
import { Button, Checkbox, Field, Input, Notice, RadioCard, Select, Textarea } from "~/components/ui";
import { formToObject, label, PageHeader, Panel, SaveBar, ScopeBar, Toggle } from "~/components/admin";

const CHANNEL_HINTS: Record<string, string> = {
  combined: "Alle kaufen im Shop; Geschäftskunden erhalten zusätzlich das Portal.",
  separate: "Shop zeigt nur Privatkonditionen; Geschäftskunden bestellen im Portal.",
  "portal-only": "Shop-Seiten führen ins Portal — reiner Grosshandel.",
  "shop-only": "Kein Portal; Geschäftskunden nutzen Konto & Schnellbestellung im Shop.",
};

export async function loader({ request }: Route.LoaderArgs) {
  const db = await getDb();
  const { slug, scope } = await adminScope(request, ["shop"]);
  const [{ shop }, groups] = await Promise.all([getScopedSettings(slug, "shop"), db.select().from(schema.customerGroups).orderBy(asc(schema.customerGroups.id))]);
  const e = process.env;
  const keys = {
    stripe: !!e.STRIPE_SECRET_KEY && !!e.STRIPE_WEBHOOK_SECRET,
    mollie: !!e.MOLLIE_API_KEY,
    datatrans: !!e.DATATRANS_MERCHANT_ID && !!e.DATATRANS_PASSWORD && !!e.DATATRANS_HMAC_KEY,
    payrexx: !!e.PAYREXX_INSTANCE && !!e.PAYREXX_API_SECRET,
    post: !!e.POST_CLIENT_ID && !!e.POST_CLIENT_SECRET,
  };
  return { shop, groups, keys, priceSources: listPriceSources(), scope };
}

export async function action({ request }: Route.ActionArgs) {
  const { slug } = await adminScope(request, []);
  const form = await request.formData();
  if (form.get("intent") === "scope-reset") { await resetScope(slug, ["shop"]); return { ok: true }; }
  const o = formToObject(form) as Record<string, any>;
  const { shop } = await getScopedSettings(slug, "shop");
  if (form.get("intent") === "preset") {
    const key = String(form.get("profile")) as keyof typeof PRESETS;
    if (!PRESETS[key]) return data({ error: "Unbekanntes Profil" }, { status: 400 });
    await saveSetting("shop", { ...shop, ...PRESETS[key].patch, profile: key }, slug);
    return { ok: true };
  }
  let shipping = shop.shipping;
  try {
    shipping = JSON.parse(String(o.shippingJson));
  } catch {
    return data({ error: "Versand: JSON ungültig" }, { status: 400 });
  }
  // carriers: one per line "code | Name | Tracking-URL mit {code}"
  const carriers = String(o.carriersText ?? "").split("\n").map((l) => l.split("|").map((x) => x.trim())).filter(([c, n]) => c && n)
    .map(([code, label, trackingUrl = ""]) => ({ code: code.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20), label: label.slice(0, 40), trackingUrl: /^https?:\/\//.test(trackingUrl) ? trackingUrl : "" }));
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
      world: form.has("originMap.world"),
    },
    modules: {
      producers: form.has("modules.producers"), story: form.has("modules.story"), trade: form.has("modules.trade"),
      wineDetails: form.has("modules.wineDetails"), conditions: form.has("modules.conditions"), coupons: form.has("modules.coupons"),
    },
    terms: {
      producers: (PRODUCER_TERMS as readonly string[]).includes(o.terms?.producers) ? o.terms.producers : shop.terms.producers,
      trade: (TRADE_TERMS as readonly string[]).includes(o.terms?.trade) ? o.terms.trade : shop.terms.trade,
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
    fulfillment: {
      carriers: carriers.length ? carriers : shop.fulfillment.carriers,
      notify: (["confirmed", "processing", "shipped", "completed", "cancelled"] as const).filter((k) => form.has(`notify.${k}`)),
      post: {
        enabled: form.has("post.enabled"),
        frankingLicense: String(o.post?.frankingLicense ?? "").replace(/\D/g, "").slice(0, 12),
        services: list(o.post?.services).map((x) => x.toUpperCase()),
        labelLayout: ["A5", "A6", "A7", "FE"].includes(o.post?.labelLayout) ? o.post.labelLayout : "A6",
        sender: { name1: o.post?.sender?.name1 ?? "", name2: o.post?.sender?.name2 ?? "", street: o.post?.sender?.street ?? "", zip: o.post?.sender?.zip ?? "", city: o.post?.sender?.city ?? "" },
        defaultWeight: Number(o.post?.defaultWeight) || 2000,
      },
    },
    payments: {
      invoice: { enabled: form.has("pay.invoice"), tradeOnly: form.has("pay.invoiceTradeOnly"), termsDays: Number(o.invoiceDays) || 30 },
      prepayment: { enabled: form.has("pay.prepayment"), holder: o.bank.holder, iban: o.bank.iban, bank: o.bank.bank },
      stripe: { enabled: form.has("pay.stripe") },
      mollie: { enabled: form.has("pay.mollie"), methods: list(o.pay?.mollieMethods) },
      datatrans: { enabled: form.has("pay.datatrans"), methods: list(o.pay?.datatransMethods) },
      payrexx: { enabled: form.has("pay.payrexx"), methods: list(o.pay?.payrexxMethods) },
    },
    trade: { ...shop.trade, requireUid: form.has("trade.requireUid"), defaultGroup: o.trade.defaultGroup, quickOrder: form.has("trade.quickOrder"), priceListExport: form.has("trade.priceListExport") },
  }, slug);
  const db = await getDb();
  for (const [id, g] of Object.entries((o.group ?? {}) as Record<string, Record<string, string>>)) {
    // payment methods of the group: all ticked = no restriction (null)
    const offered = PAYMENT_METHODS.filter((m) => shop.payments[m].enabled);
    const ticked = form.getAll(`group.${id}.pay`).map(String).filter((m) => offered.includes(m as never));
    const paymentMethods = ticked.length === offered.length ? null : ticked;
    await db.update(schema.customerGroups).set({ name: g.name, discountPct: Number(g.discount) || 0, minOrderCents: parseMoneyInput(g.minOrder ?? "0"), showNet: g.showNet === "on", erpCode: g.erpCode || null, paymentMethods }).where(eq(schema.customerGroups.id, Number(id)));
  }
  return { ok: true };
}

const list = (v: unknown) => String(v ?? "").split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

/** "https://B2B.example.ch/" → "b2b.example.ch" */
function cleanHost(v: unknown) {
  return String(v ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/:].*$/, "");
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { shop, groups, keys, priceSources, scope } = loaderData;
  const result = useActionData<typeof action>();
  return (
    <>
    <ScopeBar scope={scope} keys={["shop"]} label="Einstellungen" />
    <div key={scope.current ?? "main"}>
    <Panel title="Geschäftsmodell" description="Ein Profil setzt passende Module, Begriffe und die Alterskontrolle — alles bleibt danach einzeln anpassbar." className="mb-6">
      <Form method="post" className="grid gap-4">
        <input type="hidden" name="intent" value="preset" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Object.entries(PRESETS).map(([key, p]) => (
            <RadioCard key={key} name="profile" value={key} defaultChecked={shop.profile === key} label={p.label} description={p.description} />
          ))}
        </div>
        <Button type="submit" variant="secondary" className="w-fit">Profil anwenden</Button>
      </Form>
    </Panel>
    <Form method="post">
      <PageHeader title="Einstellungen" subtitle="Verkaufsmodell, Sprachen, Preise, Versand und Zahlung." />
      {result && "error" in result && <Notice tone="danger" className="mb-6">{result.error}</Notice>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Module & Begriffe" description="Funktionen ein-/ausblenden; ausgeschaltete Seiten verschwinden aus Navigation & Sitemap." className="xl:col-span-2">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="divide-y divide-border">
              <Toggle name="modules.producers" label="Produzenten / Marken & Herkunftskarte" defaultChecked={shop.modules.producers} />
              <Toggle name="modules.story" label="Geschichte" defaultChecked={shop.modules.story} />
              <Toggle name="modules.trade" label="B2B-Seite & Antrag" defaultChecked={shop.modules.trade} />
              <Toggle name="modules.wineDetails" label="Weinangaben" description="Jahrgang, Rebsorten, Appellation" defaultChecked={shop.modules.wineDetails} />
              <Toggle name="modules.conditions" label="Konditionen (B2B-Rabatte)" defaultChecked={shop.modules.conditions} />
              <Toggle name="modules.coupons" label="Gutscheine" defaultChecked={shop.modules.coupons} />
            </div>
            <div className="grid content-start gap-4">
              <Field label="Bezeichnung Produzenten">
                {(id) => <Select id={id} name="terms.producers" defaultValue={shop.terms.producers}><option value="producers">Produzenten</option><option value="winemakers">Winzer</option><option value="brands">Marken</option><option value="makers">Manufakturen</option><option value="suppliers">Lieferanten</option></Select>}
              </Field>
              <Field label="Bezeichnung B2B-Bereich">
                {(id) => <Select id={id} name="terms.trade" defaultValue={shop.terms.trade}><option value="gastronomy">Gastronomie</option><option value="business">Firmenkunden</option><option value="resellers">Wiederverkauf</option></Select>}
              </Field>
            </div>
          </div>
        </Panel>
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
          <p className="mt-4 text-note text-muted-fg">Beide Domains auf dieselbe Installation zeigen lassen. Für ein gemeinsames Login über Subdomains <code className="rounded-badge bg-muted px-1.5 py-0.5 text-xs">COOKIE_DOMAIN=.example.ch</code> setzen.</p>
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
            <Field label="Heimatland (ISO)" hint={`Regionenkarten: ${REGION_MAP_COUNTRIES.join(", ")}`}>
              {(id) => <Input id={id} name="originMap.country" defaultValue={shop.originMap.country} maxLength={2} className="uppercase" />}
            </Field>
          </div>
          <div className="mt-2 divide-y divide-border">
            <Toggle name="originMap.world" label="Weltkarte anzeigen" description="Zoombare Weltkarte als eigene Ansicht; Länder mit Regionenkarte (z. B. IT, FR, CH, AT, DE, ES, PT) öffnen ihre Regionen. Aus: nur Regionenkarten und A–Z." defaultChecked={shop.originMap.world} />
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
            <div className="hidden grid-cols-[1.5fr_1fr_1fr_1fr_auto] gap-3 text-label uppercase tracking-wider text-muted-fg md:grid"><span>Name</span><span>Rabatt %</span><span>Mindestbestellung CHF netto</span><span>vinX-Preisgruppe</span><span>Netto-Anzeige</span></div>
            {groups.map((g) => (
              <div key={g.id} className="grid grid-cols-2 items-center gap-3 md:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
                <Input name={`group.${g.id}.name`} defaultValue={g.name} size="sm" aria-label="Name" />
                <Input name={`group.${g.id}.discount`} defaultValue={g.discountPct} inputMode="decimal" size="sm" aria-label="Rabatt" />
                <Input name={`group.${g.id}.minOrder`} defaultValue={(g.minOrderCents / 100).toFixed(2)} inputMode="decimal" size="sm" aria-label="Mindestbestellung" />
                <Input name={`group.${g.id}.erpCode`} defaultValue={g.erpCode ?? ""} size="sm" aria-label="vinX-Code" />
                <Checkbox name={`group.${g.id}.showNet`} defaultChecked={g.showNet} label={g.isTrade ? "B2B" : "B2C"} />
                <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border pb-3 text-note md:col-span-5">
                  <span className="text-muted-fg">Zahlarten:</span>
                  {PAYMENT_METHODS.filter((m) => shop.payments[m].enabled).map((m) => (
                    <Checkbox key={m} name={`group.${g.id}.pay`} value={m} label={label(m)} defaultChecked={!g.paymentMethods?.length || g.paymentMethods.includes(m)} className="text-note" />
                  ))}
                  <span className="text-muted-fg">· Kunden mit vinX-Zahlungsbedingung oder eigener Auswahl übersteuern die Gruppe</span>
                </div>
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

        <Panel title="Versand & Kundenbenachrichtigung" description="Status-E-Mails an Kunden (je Status einmal, in der Sprache der Bestellung, mit Marke des Shops); Versanddienste mit Tracking-Link; Post-Etiketten über die Digital Commerce API." className="xl:col-span-2">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="grid content-start gap-5">
              <fieldset className="grid gap-2">
                <legend className="text-field-label mb-1">E-Mail an den Kunden bei</legend>
                <p className="text-note text-muted-fg">Die Bestellbestätigung geht immer raus.</p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {([["confirmed", "Bestätigt"], ["processing", "In Bearbeitung"], ["shipped", "Versandt (mit Tracking)"], ["completed", "Abgeschlossen"], ["cancelled", "Storniert"]] as const).map(([k, l]) => (
                    <Checkbox key={k} name={`notify.${k}`} label={l} defaultChecked={(shop.fulfillment.notify as string[]).includes(k)} />
                  ))}
                </div>
              </fieldset>
              <Field label="Versanddienste" hint="Eine Zeile pro Dienst: Kürzel | Name | Tracking-URL mit {code}">
                {(id) => <Textarea id={id} name="carriersText" rows={7} spellCheck={false} defaultValue={shop.fulfillment.carriers.map((c) => [c.code, c.label, c.trackingUrl].join(" | ")).join("\n")} className="font-mono text-note" />}
              </Field>
            </div>
            <div className="grid content-start gap-4 rounded-control border border-border p-4">
              <div className="divide-y divide-border"><Toggle name="post.enabled" label="Post-Etiketten (Swiss Post Barcode-API)" description={keys.post ? "POST_CLIENT_ID/SECRET gesetzt" : "Ohne POST_CLIENT_ID/POST_CLIENT_SECRET: Demo-Etiketten (Specimen)"} defaultChecked={shop.fulfillment.post.enabled} /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Frankierlizenz">{(id) => <Input id={id} name="post.frankingLicense" defaultValue={shop.fulfillment.post.frankingLicense} inputMode="numeric" className="font-mono" />}</Field>
                <Field label="Leistungen" hint="PRI = A-Post, ECO = B-Post, + z. B. SI">{(id) => <Input id={id} name="post.services" defaultValue={shop.fulfillment.post.services.join(", ")} />}</Field>
                <Field label="Etikettformat">{(id) => <Select id={id} name="post.labelLayout" defaultValue={shop.fulfillment.post.labelLayout}>{["A5", "A6", "A7", "FE"].map((x) => <option key={x}>{x}</option>)}</Select>}</Field>
                <Field label="Standardgewicht (g)">{(id) => <Input id={id} name="post.defaultWeight" defaultValue={shop.fulfillment.post.defaultWeight} inputMode="numeric" />}</Field>
                <Field label="Absender" className="sm:col-span-2">{(id) => <Input id={id} name="post.sender.name1" defaultValue={shop.fulfillment.post.sender.name1} placeholder="Firma" />}</Field>
                <Field label="Zusatz">{(id) => <Input id={id} name="post.sender.name2" defaultValue={shop.fulfillment.post.sender.name2} />}</Field>
                <Field label="Strasse">{(id) => <Input id={id} name="post.sender.street" defaultValue={shop.fulfillment.post.sender.street} />}</Field>
                <Field label="PLZ">{(id) => <Input id={id} name="post.sender.zip" defaultValue={shop.fulfillment.post.sender.zip} inputMode="numeric" />}</Field>
                <Field label="Ort">{(id) => <Input id={id} name="post.sender.city" defaultValue={shop.fulfillment.post.sender.city} />}</Field>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Versandarten" description='Preise in Rappen. "rates": [[ab Einheiten, Preis]] · "audience": all | consumer | trade' className="xl:col-span-2">
          <Textarea name="shippingJson" aria-label="Versandarten (JSON)" rows={14} spellCheck={false} defaultValue={JSON.stringify(shop.shipping, null, 2)} className="font-mono text-note" />
        </Panel>
      </div>
      <SaveBar saved={!!result && "ok" in result} />
    </Form>
    </div>
    </>
  );
}
