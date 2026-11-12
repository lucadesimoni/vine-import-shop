import { asc, eq } from "drizzle-orm";
import { data, Form, Link, redirect, useActionData } from "react-router";
import { ArrowLeft, ExternalLink, Lock } from "lucide-react";
import type { Route } from "./+types/product";
import { getDb, schema } from "~/.server/db";
import { getSettings } from "~/.server/settings";
import { saveUpload } from "~/.server/storage";
import { slugify } from "~/lib/slug";
import { parseMoneyInput } from "~/lib/money";
import type { Localized } from "~/lib/localized";
import { Badge, ButtonLink, Field, Input, Notice, Select } from "~/components/ui";
import { formToObject, LocalizedInput, PageHeader, Panel, SaveBar, Toggle } from "~/components/admin";
import { ProductImage } from "~/components/shop";

export async function loader({ params }: Route.LoaderArgs) {
  const db = await getDb();
  const isNew = params.id === "new";
  const product = isNew ? null : await db.query.products.findFirst({ where: eq(schema.products.id, Number(params.id)) });
  if (!isNew && !product) throw data("Not found", { status: 404 });
  const [variants, categories, producers, { shop, vinx }] = await Promise.all([
    product ? db.select().from(schema.variants).where(eq(schema.variants.productId, product.id)).orderBy(asc(schema.variants.sort)) : [],
    db.select({ id: schema.categories.id, name: schema.categories.name, parentId: schema.categories.parentId }).from(schema.categories).orderBy(asc(schema.categories.sort)),
    db.select({ id: schema.producers.id, name: schema.producers.name }).from(schema.producers).orderBy(asc(schema.producers.name)),
    getSettings("shop", "vinx"),
  ]);
  return { product, variants, categories, producers, locales: shop.locales, erpOwned: vinx.enabled && vinx.driver !== "mock" ? vinx.ownedFields : vinx.enabled ? vinx.ownedFields : [] };
}

export async function action({ request, params }: Route.ActionArgs) {
  const db = await getDb();
  const form = await request.formData();
  const o = formToObject(form) as Record<string, Record<string, string> & string>;
  const loc = (k: string) => Object.fromEntries(Object.entries((o[k] ?? {}) as Record<string, string>).filter(([, v]) => v.trim())) as Localized;
  const name = loc("name");
  if (!name.de && !Object.values(name)[0]) return data({ error: "Name ist erforderlich" }, { status: 400 });

  let image = String(o.image ?? "") || null;
  const file = form.get("imageFile");
  if (file instanceof File && file.size) {
    try {
      image = await saveUpload(file, "products");
    } catch (e) {
      return data({ error: (e as Error).message }, { status: 400 });
    }
  }
  const values = {
    name, short: loc("short"), description: loc("description"), pairing: loc("pairing"),
    kind: (o.kind as "wine") ?? "wine",
    categoryId: Number(o.categoryId) || null, producerId: Number(o.producerId) || null,
    color: (o.color || null) as "red" | null, country: String(o.country || "") || null, region: String(o.region || "") || null,
    appellation: String(o.appellation || "") || null, grapes: String(o.grapes || "") || null, alcohol: o.alcohol ? Number(String(o.alcohol).replace(",", ".")) : null,
    taxClass: (o.taxClass === "reduced" ? "reduced" : "standard") as "standard",
    active: form.has("active"), featured: form.has("featured"), promo: form.has("promo"), isNew: form.has("isNew"), organic: form.has("organic"),
    tradeOnly: form.has("tradeOnly"), ageRestricted: form.has("ageRestricted"), image, updatedAt: new Date(),
  };
  let id = Number(params.id);
  if (params.id === "new") {
    const [row] = await db.insert(schema.products).values({ ...values, slug: `${slugify(name.de ?? Object.values(name)[0] ?? "produkt")}-${Date.now().toString(36)}` }).returning();
    id = row.id;
    const sku = String(o.newSku ?? "").trim();
    if (sku) await db.insert(schema.variants).values({ productId: id, sku, priceCents: parseMoneyInput(String(o.newPrice ?? "0")), stock: Number(o.newStock) || 0 });
    return redirect(`/admin/products/${id}`);
  }
  await db.update(schema.products).set(values).where(eq(schema.products.id, id));
  // Variant fields (editable unless owned by ERP)
  for (const [key, v] of Object.entries((o.variant ?? {}) as unknown as Record<string, Record<string, string>>)) {
    const patch: Partial<typeof schema.variants.$inferInsert> = {};
    if (v.vintage !== undefined) patch.vintage = v.vintage || null;
    if (v.size !== undefined) patch.size = v.size || null;
    if (v.price !== undefined) patch.priceCents = parseMoneyInput(v.price);
    if (v.stock !== undefined) patch.stock = Number(v.stock) || 0;
    if (Object.keys(patch).length) await db.update(schema.variants).set(patch).where(eq(schema.variants.id, Number(key)));
  }
  return { ok: true };
}

export default function AdminProduct({ loaderData }: Route.ComponentProps) {
  const { product: p, variants, categories, producers, locales, erpOwned } = loaderData;
  const result = useActionData<typeof action>();
  const owned = (f: string) => erpOwned.includes(f);
  const Lk = () => <Lock size={11} className="inline text-muted-fg" aria-label="von vinX verwaltet" />;
  return (
    <Form method="post" encType="multipart/form-data">
      <Link to="/admin/products" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-fg hover:text-fg"><ArrowLeft size={14} /> Produkte</Link>
      <PageHeader title={p ? p.name.de ?? "Produkt" : "Neues Produkt"} subtitle={p ? `/${p.slug}` : undefined} actions={p && <ButtonLink to={`/product/${p.slug}`} target="_blank" variant="secondary" size="sm"><ExternalLink size={14} /> Im Shop</ButtonLink>} />
      {result && "error" in result && <Notice tone="danger" className="mb-6">{result.error}</Notice>}
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-6">
          <Panel title="Inhalte" description="Mehrsprachig — leere Sprachen fallen auf die Standardsprache zurück.">
            <div className="grid gap-5">
              <LocalizedInput label="Name" name="name" value={p?.name} locales={locales} />
              <LocalizedInput label="Kurzbeschreibung" name="short" value={p?.short ?? undefined} locales={locales} />
              <LocalizedInput label="Beschreibung / Degustationsnotiz" name="description" value={p?.description ?? undefined} locales={locales} multiline rows={4} />
              <LocalizedInput label="Passt zu" name="pairing" value={p?.pairing ?? undefined} locales={locales} />
            </div>
          </Panel>
          <Panel title="Varianten" description={erpOwned.length ? "Felder mit Schloss werden durch vinX synchronisiert." : undefined}>
            {variants.length === 0 && !p ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Art.-Nr. (SKU)">{(id) => <Input id={id} name="newSku" />}</Field>
                <Field label="Preis CHF inkl. MWST">{(id) => <Input id={id} name="newPrice" inputMode="decimal" />}</Field>
                <Field label="Lager">{(id) => <Input id={id} name="newStock" type="number" />}</Field>
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="hidden grid-cols-[1fr_1fr_1fr_1fr_1fr] gap-3 text-[11px] uppercase tracking-wider text-muted-fg sm:grid">
                  <span>Art.-Nr.</span><span>Jahrgang {owned("vintage") && <Lk />}</span><span>Format {owned("size") && <Lk />}</span><span>Preis CHF {owned("price") && <Lk />}</span><span>Lager {owned("stock") && <Lk />}</span>
                </div>
                {variants.map((v) => (
                  <div key={v.id} className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_1fr]">
                    <div className="flex h-9 items-center font-mono text-[13px]">{v.sku}{v.erpId && <Badge className="ml-2">vinX</Badge>}</div>
                    <Input name={`variant.${v.id}.vintage`} defaultValue={v.vintage ?? ""} disabled={owned("vintage")} size="sm" aria-label="Jahrgang" />
                    <Input name={`variant.${v.id}.size`} defaultValue={v.size ?? ""} disabled={owned("size")} size="sm" aria-label="Format" />
                    <Input name={`variant.${v.id}.price`} defaultValue={(v.priceCents / 100).toFixed(2)} disabled={owned("price")} size="sm" className="tabular-nums" aria-label="Preis" />
                    <Input name={`variant.${v.id}.stock`} defaultValue={v.stock} disabled={owned("stock")} type="number" size="sm" className="tabular-nums" aria-label="Lager" />
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel title="Merkmale">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Typ">{(id) => <Select id={id} name="kind" defaultValue={p?.kind ?? "wine"}><option value="wine">Wein</option><option value="food">Lebensmittel</option><option value="spirit">Spirituose</option><option value="beverage">Getränk</option></Select>}</Field>
              <Field label="Weinfarbe">{(id) => <Select id={id} name="color" defaultValue={p?.color ?? ""}><option value="">—</option><option value="red">Rot</option><option value="white">Weiss</option><option value="rose">Rosé</option><option value="sparkling">Schaumwein</option><option value="sweet">Süsswein</option></Select>}</Field>
              <Field label="Land">{(id) => <Input id={id} name="country" defaultValue={p?.country ?? ""} />}</Field>
              <Field label="Region">{(id) => <Input id={id} name="region" defaultValue={p?.region ?? ""} />}</Field>
              <Field label="Appellation">{(id) => <Input id={id} name="appellation" defaultValue={p?.appellation ?? ""} />}</Field>
              <Field label="Traubensorten">{(id) => <Input id={id} name="grapes" defaultValue={p?.grapes ?? ""} />}</Field>
              <Field label="Alkohol % vol.">{(id) => <Input id={id} name="alcohol" defaultValue={p?.alcohol ?? ""} inputMode="decimal" />}</Field>
              <Field label="MWST">{(id) => <Select id={id} name="taxClass" defaultValue={p?.taxClass ?? "standard"}><option value="standard">Normalsatz</option><option value="reduced">Reduziert (Lebensmittel)</option></Select>}</Field>
            </div>
          </Panel>
        </div>
        <div className="grid content-start gap-6">
          <Panel title="Bild">
            <div className="relative mb-4 aspect-square rounded-surface bg-muted"><div className="absolute inset-[8%]"><ProductImage product={{ image: p?.image ?? null, name: p?.name.de ?? "", kind: p?.kind ?? "wine", color: p?.color ?? null }} /></div></div>
            <div className="grid gap-3">
              <Input type="file" name="imageFile" accept="image/jpeg,image/png,image/webp,image/avif" className="h-auto py-2 text-sm" />
              <Input name="image" defaultValue={p?.image ?? ""} placeholder="oder Bild-URL" size="sm" />
            </div>
          </Panel>
          <Panel title="Zuordnung">
            <div className="grid gap-4">
              <Field label="Kategorie">{(id) => <Select id={id} name="categoryId" defaultValue={p?.categoryId ?? ""}><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.parentId ? "— " : ""}{c.name.de}</option>)}</Select>}</Field>
              <Field label="Produzent">{(id) => <Select id={id} name="producerId" defaultValue={p?.producerId ?? ""}><option value="">—</option>{producers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</Field>
            </div>
          </Panel>
          <Panel title="Sichtbarkeit">
            <div className="divide-y divide-border">
              <Toggle name="active" label="Aktiv im Shop" defaultChecked={p?.active ?? true} />
              <Toggle name="promo" label="Aktion" description="Erscheint im Aktions-Karussell" defaultChecked={p?.promo} />
              <Toggle name="featured" label="Empfohlen" defaultChecked={p?.featured} />
              <Toggle name="isNew" label="Neu" defaultChecked={p?.isNew} />
              <Toggle name="organic" label="Bio" defaultChecked={p?.organic} />
              <Toggle name="tradeOnly" label="Nur für Geschäftskunden" defaultChecked={p?.tradeOnly} />
              <Toggle name="ageRestricted" label="Alkohol (Altersbestätigung)" defaultChecked={p?.ageRestricted ?? true} />
            </div>
          </Panel>
        </div>
      </div>
      <SaveBar saved={!!result && "ok" in result} />
    </Form>
  );
}
