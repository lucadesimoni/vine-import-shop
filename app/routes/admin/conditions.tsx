import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { Form, useSearchParams, useSubmit } from "react-router";
import { Plus, Trash2 } from "lucide-react";
import type { Route } from "./+types/conditions";
import { getDb, schema } from "~/.server/db";
import { getSettings } from "~/.server/settings";
import { listPriceSources } from "~/.server/price-sources";
import { formatMoney, parseMoneyInput } from "~/lib/money";
import { Badge, Button, Field, Input, Notice, Select } from "~/components/ui";
import { DataTable, PageHeader, Panel } from "~/components/admin";

const TYPES = {
  special_price: "Spezialpreis",
  promotion_price: "Aktionspreis",
  customer_discount: "Kundenrabatt",
  quantity_discount: "Mengenrabatt",
  promotion_discount: "Aktionsrabatt",
  free_goods: "Gratisware (n für m)",
} as const;
const TARGETS = { all: "Ganzes Sortiment", discount_group: "Rabattgruppe (vinX)", category: "Kategorie", producer: "Produzent", product: "Produkt", variant: "Artikel (Art.-Nr.)" } as const;
const CALCS = { percent: "Prozent", amount_per_unit: "CHF / Einheit", fixed_price: "Fixpreis netto" } as const;

export async function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams;
  const db = await getDb();
  const c = schema.conditions;
  const where: SQL[] = [];
  if (q.get("source")) where.push(eq(c.source, q.get("source")!));
  if (q.get("customer")) where.push(eq(c.customerId, Number(q.get("customer"))));
  const [rules, groups, customers, categories, producers, discountGroups, { shop }] = await Promise.all([
    db.select().from(c).where(where.length ? and(...where) : undefined).orderBy(desc(c.active), asc(c.type), desc(c.id)).limit(500),
    db.select({ id: schema.customerGroups.id, name: schema.customerGroups.name }).from(schema.customerGroups).orderBy(asc(schema.customerGroups.id)),
    db.select({ id: schema.users.id, name: schema.users.name, company: schema.users.company }).from(schema.users).where(sql`${schema.users.tradeStatus} = 'approved'`).orderBy(asc(schema.users.company)),
    db.select({ id: schema.categories.id, name: schema.categories.name }).from(schema.categories).orderBy(asc(schema.categories.sort)),
    db.select({ id: schema.producers.id, name: schema.producers.name }).from(schema.producers).orderBy(asc(schema.producers.name)),
    db.selectDistinct({ key: schema.variants.discountGroup }).from(schema.variants).where(sql`${schema.variants.discountGroup} is not null`),
    getSettings("shop"),
  ]);
  return {
    rules, groups, customers, producers,
    categories: categories.map((x) => ({ id: x.id, name: x.name.de ?? "" })),
    discountGroups: discountGroups.map((d) => d.key!).sort(),
    source: shop.priceSource,
    sourceLabel: listPriceSources().find((s) => s.id === shop.priceSource)?.label ?? shop.priceSource,
    sources: [...new Set(rules.map((r) => r.source))],
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const db = await getDb();
  const intent = form.get("intent");
  const id = Number(form.get("id"));
  if (intent === "delete") {
    await db.delete(schema.conditions).where(and(eq(schema.conditions.id, id), eq(schema.conditions.source, "platform")));
    return { ok: true };
  }
  if (intent === "toggle") {
    await db.update(schema.conditions).set({ active: form.get("active") === "true" }).where(eq(schema.conditions.id, id));
    return { ok: true };
  }
  const type = String(form.get("type")) as keyof typeof TYPES;
  const targetType = String(form.get("targetType")) as keyof typeof TARGETS;
  const calc = type === "free_goods" ? "n_for_m" : (String(form.get("calc")) as keyof typeof CALCS);
  const scope = String(form.get("scope") ?? "");
  const raw = String(form.get("value") ?? "0");
  const value = calc === "percent" ? Number(raw.replace(",", ".")) : parseMoneyInput(raw);
  if (!(type in TYPES) || !(targetType in TARGETS)) return { error: "Ungültige Eingabe" };
  if (calc !== "n_for_m" && !(value > 0)) return { error: "Wert fehlt" };
  const target = targetType === "all" ? null : String(form.get(`target.${targetType}`) ?? "").trim() || null;
  if (targetType !== "all" && !target) return { error: "Ziel fehlt" };
  let resolvedTarget = target;
  if (targetType === "variant" && target) {
    const v = await db.query.variants.findFirst({ where: eq(schema.variants.sku, target) });
    if (!v) return { error: `Art.-Nr. ${target} nicht gefunden` };
    resolvedTarget = String(v.id);
  }
  const date = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(String(form.get(k))) ? new Date(String(form.get(k))) : null);
  await db.insert(schema.conditions).values({
    source: "platform", type, targetType, target: resolvedTarget, calc,
    customerId: scope.startsWith("c:") ? Number(scope.slice(2)) : null,
    groupId: scope.startsWith("g:") ? Number(scope.slice(2)) : null,
    value: String(value), minQty: Number(form.get("minQty")) || 0,
    buyQty: Number(form.get("buyQty")) || 0, payQty: Number(form.get("payQty")) || 0,
    validFrom: date("validFrom"), validTo: date("validTo"), onNetPrices: form.has("onNetPrices"),
    label: { de: String(form.get("label") ?? "").trim() || TYPES[type] },
  });
  return { ok: true };
}

export const meta: Route.MetaFunction = () => [{ title: "Konditionen · Admin" }];

export default function Conditions({ loaderData, actionData }: Route.ComponentProps) {
  const { rules, groups, customers, categories, producers, discountGroups, source, sourceLabel, sources } = loaderData;
  const [params] = useSearchParams();
  const submit = useSubmit();
  const scopeName = (r: (typeof rules)[number]) =>
    r.customerId ? `Kunde · ${customers.find((c) => c.id === r.customerId)?.company ?? customers.find((c) => c.id === r.customerId)?.name ?? r.customerId}` : r.groupId ? `Gruppe · ${groups.find((g) => g.id === r.groupId)?.name}` : "Alle Kunden";
  const targetName = (r: (typeof rules)[number]) => {
    if (r.targetType === "all") return TARGETS.all;
    if (r.targetType === "category") return `${TARGETS.category} · ${categories.find((c) => String(c.id) === r.target)?.name ?? r.target}`;
    if (r.targetType === "producer") return `${TARGETS.producer} · ${producers.find((p) => String(p.id) === r.target)?.name ?? r.target}`;
    return `${TARGETS[r.targetType]} · ${r.target}`;
  };
  const valueText = (r: (typeof rules)[number]) =>
    r.calc === "n_for_m" ? `${r.buyQty} für ${r.payQty}` : r.calc === "percent" ? `${Number(r.value)} %` : r.calc === "fixed_price" ? formatMoney(Number(r.value), "CHF", "de") : `−${formatMoney(Number(r.value), "CHF", "de")} / Stk.`;

  return (
    <>
      <PageHeader title="Konditionen" subtitle="Spezialpreise, Kunden-, Mengen- und Aktionsrabatte sowie Gratisware — nach dem Preisfindungs-Modell von vinX." />
      <Notice className="mb-6">
        {source === "platform"
          ? "Preisquelle: Plattform. Diese Regeln berechnen die Kundenpreise im Shop & Portal. Regeln aus vinX oder einem anderen ERP werden hier synchronisiert und angezeigt."
          : `Preisquelle: ${sourceLabel}. Das ERP berechnet die Kundenpreise live (inkl. seiner Konditionen); diese Regeln greifen nur als Rückfall, wenn das ERP nicht erreichbar ist.`}
      </Notice>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid content-start gap-4">
          <Form method="get" onChange={(e) => submit(e.currentTarget)} className="flex flex-wrap gap-3">
            <Select name="source" defaultValue={params.get("source") ?? ""} size="sm" className="w-44" aria-label="Quelle">
              <option value="">Alle Quellen</option>
              {sources.map((s) => <option key={s} value={s}>{s === "platform" ? "Plattform" : s}</option>)}
            </Select>
            <Select name="customer" defaultValue={params.get("customer") ?? ""} size="sm" className="w-64" aria-label="Kunde">
              <option value="">Alle Kunden & Gruppen</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
            </Select>
          </Form>
          <DataTable head={["Art", "Gilt für", "Ziel", "Wert", "Bedingung", "Quelle", ""]} empty={!rules.length}>
            {rules.map((r) => (
              <tr key={r.id} className={r.active ? "" : "opacity-50"}>
                <td><span className="font-medium">{TYPES[r.type]}</span><span className="block text-xs text-muted-fg">{r.label?.de}</span></td>
                <td className="text-muted-fg">{scopeName(r)}</td>
                <td className="text-muted-fg">{targetName(r)}</td>
                <td className="whitespace-nowrap tabular-nums">{valueText(r)}</td>
                <td className="text-xs text-muted-fg">
                  {[r.minQty ? `ab ${r.minQty} Stk.` : "", r.validTo ? `bis ${new Date(r.validTo).toLocaleDateString("de-CH")}` : "", r.onNetPrices ? "auch auf Nettopreise" : ""].filter(Boolean).join(" · ") || "—"}
                </td>
                <td><Badge tone={r.source === "platform" ? "neutral" : "soft"}>{r.source === "platform" ? "Plattform" : r.source}</Badge></td>
                <td className="whitespace-nowrap text-right">
                  <Form method="post" className="inline">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="active" value={String(!r.active)} />
                    <Button name="intent" value="toggle" variant="ghost" size="sm">{r.active ? "Pausieren" : "Aktivieren"}</Button>
                  </Form>
                  {r.source === "platform" && (
                    <Form method="post" className="inline">
                      <input type="hidden" name="id" value={r.id} />
                      <Button name="intent" value="delete" variant="ghost" size="iconSm" aria-label="Löschen" className="text-muted-fg"><Trash2 size={15} /></Button>
                    </Form>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        </div>

        <Panel title="Neue Kondition" description="Die spezifischste Regel gewinnt: Artikel › Produkt › Rabattgruppe › Produzent › Kategorie › alles; Kunde vor Gruppe.">
          {actionData && "error" in actionData && <Notice tone="danger" className="mb-4">{actionData.error}</Notice>}
          <NewRule groups={groups} customers={customers} categories={categories} producers={producers} discountGroups={discountGroups} />
        </Panel>
      </div>
    </>
  );
}

function NewRule({ groups, customers, categories, producers, discountGroups }: Pick<Route.ComponentProps["loaderData"], "groups" | "customers" | "categories" | "producers" | "discountGroups">) {
  return (
    <Form method="post" className="grid gap-4" onSubmit={(e) => setTimeout(() => (e.target as HTMLFormElement).reset(), 0)}>
      <input type="hidden" name="intent" value="create" />
      <Field label="Art">{(id) => <Select id={id} name="type" defaultValue="customer_discount">{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
      <Field label="Gilt für">
        {(id) => (
          <Select id={id} name="scope" defaultValue="">
            <option value="">Alle Kunden</option>
            <optgroup label="Kundengruppe">{groups.map((g) => <option key={g.id} value={`g:${g.id}`}>{g.name}</option>)}</optgroup>
            <optgroup label="Kunde">{customers.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.company || c.name}</option>)}</optgroup>
          </Select>
        )}
      </Field>
      <Field label="Ziel">
        {(id) => (
          <Select id={id} name="targetType" defaultValue="all">
            {Object.entries(TARGETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        )}
      </Field>
      <div className="grid gap-3 rounded-control bg-muted p-3">
        <p className="text-xs text-muted-fg">Ziel-Wert (passend zur Auswahl oben)</p>
        <Select name="target.discount_group" size="sm" aria-label="Rabattgruppe" defaultValue=""><option value="">Rabattgruppe …</option>{discountGroups.map((d) => <option key={d}>{d}</option>)}</Select>
        <Select name="target.category" size="sm" aria-label="Kategorie" defaultValue=""><option value="">Kategorie …</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select name="target.producer" size="sm" aria-label="Produzent" defaultValue=""><option value="">Produzent …</option>{producers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Input name="target.variant" size="sm" placeholder="Art.-Nr., z. B. 10679" aria-label="Art.-Nr." />
        <Input name="target.product" size="sm" placeholder="Produkt-ID" aria-label="Produkt-ID" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Berechnung">{(id) => <Select id={id} name="calc" defaultValue="percent">{Object.entries(CALCS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
        <Field label="Wert">{(id) => <Input id={id} name="value" inputMode="decimal" placeholder="5 oder 12.50" />}</Field>
        <Field label="Ab Menge">{(id) => <Input id={id} name="minQty" type="number" min={0} placeholder="0" />}</Field>
        <Field label="Gratisware n / m">{(id) => <div className="flex gap-2"><Input id={id} name="buyQty" type="number" min={0} placeholder="12" aria-label="Kaufe" /><Input name="payQty" type="number" min={0} placeholder="11" aria-label="Bezahle" /></div>}</Field>
        <Field label="Gültig ab">{(id) => <Input id={id} name="validFrom" type="date" />}</Field>
        <Field label="Gültig bis">{(id) => <Input id={id} name="validTo" type="date" />}</Field>
      </div>
      <Field label="Bezeichnung (Kunde sieht diese)">{(id) => <Input id={id} name="label" placeholder="z. B. Kundenrabatt Wein 5 %" />}</Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="onNetPrices" className="accent-[var(--t-primary)]" /> Auch auf Spezial-/Aktionspreise</label>
      <Button type="submit"><Plus size={15} /> Kondition anlegen</Button>
    </Form>
  );
}
