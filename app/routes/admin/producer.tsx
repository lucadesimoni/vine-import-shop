import { asc, eq } from "drizzle-orm";
import { data, Form, Link, redirect, useActionData } from "react-router";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import type { Route } from "./+types/producer";
import { getDb, schema } from "~/.server/db";
import { getSettings } from "~/.server/settings";
import { saveUpload } from "~/.server/storage";
import { countryIso, regionId } from "~/.server/origins";
import { slugify } from "~/lib/slug";
import type { Localized } from "~/lib/localized";
import { loadRegionMap, REGION_MAP_COUNTRIES } from "~/lib/maps/regions";
import { countryName } from "~/lib/maps/names";
import world from "~/lib/maps/world.json";
import { Badge, Button, ButtonLink, Field, Input, Notice } from "~/components/ui";
import { formToObject, LocalizedInput, PageHeader, Panel, SaveBar, Toggle } from "~/components/admin";
import { ProducerLogo } from "~/components/producer";

export async function loader({ params }: Route.LoaderArgs) {
  const db = await getDb();
  const isNew = params.id === "new";
  const producer = isNew ? null : await db.query.producers.findFirst({ where: eq(schema.producers.id, Number(params.id)) });
  if (!isNew && !producer) throw data("Not found", { status: 404 });
  const [products, { shop, vinx }] = await Promise.all([
    producer ? db.select({ id: schema.products.id, name: schema.products.name, active: schema.products.active }).from(schema.products).where(eq(schema.products.producerId, producer.id)).orderBy(asc(schema.products.id)) : [],
    getSettings("shop", "vinx"),
  ]);
  const iso = countryIso(producer?.country) ?? shop.originMap.country;
  const map = await loadRegionMap(iso);
  return {
    producer, products, locales: shop.locales, erp: vinx.enabled,
    origin: { iso, matched: producer?.region ? regionId(iso, producer.region) : null, hasMap: REGION_MAP_COUNTRIES.includes(iso) },
    regions: map?.regions.map((r) => r.names.de ?? r.name).sort((a, b) => a.localeCompare(b)) ?? [],
    countries: world.countries.map((c) => countryName(c.iso, "de")).sort((a, b) => a.localeCompare(b)),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const db = await getDb();
  const form = await request.formData();
  if (form.get("intent") === "delete") {
    const used = await db.query.products.findFirst({ where: eq(schema.products.producerId, Number(params.id)) });
    if (used) return data({ error: "Es sind noch Produkte zugeordnet." }, { status: 400 });
    await db.delete(schema.producers).where(eq(schema.producers.id, Number(params.id)));
    return redirect("/admin/producers");
  }
  const o = formToObject(form) as Record<string, string> & { description?: Record<string, string> };
  const name = String(o.name ?? "").trim();
  if (!name) return data({ error: "Name ist erforderlich" }, { status: 400 });
  let logo: string | null = form.get("removeLogo") ? null : String(o.logo ?? "").trim() || null;
  const file = form.get("logoFile");
  if (file instanceof File && file.size) {
    try {
      logo = await saveUpload(file, "producers", { svg: true });
    } catch (e) {
      return data({ error: (e as Error).message }, { status: 400 });
    }
  }
  if (logo && !/^(https:\/\/|\/uploads\/|\/demo\/)/.test(logo)) return data({ error: "Logo-URL muss mit https:// beginnen" }, { status: 400 });
  const website = String(o.website ?? "").trim();
  if (website && !/^https?:\/\//.test(website)) return data({ error: "Website muss mit https:// beginnen" }, { status: 400 });
  const values = {
    name,
    country: String(o.country ?? "").trim() || null,
    region: String(o.region ?? "").trim() || null,
    website: website || null,
    description: Object.fromEntries(Object.entries(o.description ?? {}).filter(([, v]) => v.trim())) as Localized,
    featured: form.has("featured"),
    logo,
  };
  if (params.id === "new") {
    const base = slugify(name) || "produzent";
    const taken = await db.query.producers.findFirst({ where: eq(schema.producers.slug, base) });
    const [row] = await db.insert(schema.producers).values({ ...values, slug: taken ? `${base}-${Date.now().toString(36)}` : base }).returning();
    return redirect(`/admin/producers/${row.id}?saved=1`);
  }
  await db.update(schema.producers).set(values).where(eq(schema.producers.id, Number(params.id)));
  return { ok: true };
}

export default function AdminProducer({ loaderData }: Route.ComponentProps) {
  const { producer: p, products, locales, erp, origin, regions, countries } = loaderData;
  const result = useActionData<typeof action>();
  return (
    <Form method="post" encType="multipart/form-data">
      <Link to="/admin/producers" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-fg hover:text-fg"><ArrowLeft size={14} /> Produzenten</Link>
      <PageHeader
        title={p?.name ?? "Neuer Produzent"}
        subtitle={p ? <span className="flex items-center gap-2">/producers/{p.slug}{p.erpId && <Badge title="Wird vom vinX-Sync über diese Kennung zugeordnet — auch nach Umbenennung.">vinX · {p.erpId}</Badge>}</span> : undefined}
        actions={p && <ButtonLink to={`/producers/${p.slug}`} target="_blank" variant="secondary" size="sm"><ExternalLink size={14} /> Im Shop</ButtonLink>}
      />
      {result && "error" in result && <Notice tone="danger" className="mb-6">{result.error}</Notice>}
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-6">
          <Panel title="Stammdaten" description={erp && p?.erpId ? "Name und Herkunft kommen initial aus vinX; Änderungen hier bleiben bestehen." : undefined}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" className="sm:col-span-2">{(id) => <Input id={id} name="name" defaultValue={p?.name ?? ""} required />}</Field>
              <Field label="Land" hint="Name oder ISO-Code, z. B. Italien / IT">
                {(id) => <><Input id={id} name="country" defaultValue={p?.country ?? ""} list="countries" autoComplete="off" /><datalist id="countries">{countries.map((c) => <option key={c} value={c} />)}</datalist></>}
              </Field>
              <Field
                label="Region"
                hint={p?.region ? (origin.matched ? `✓ auf der Karte: ${origin.iso}` : origin.hasMap ? "⚠ nicht auf der Regionenkarte gefunden — Vorschlag aus der Liste wählen" : `Keine Regionenkarte für ${origin.iso} — erscheint auf der Weltkarte`) : "Bestimmt die Position auf der Herkunftskarte"}
              >
                {(id) => <><Input id={id} name="region" defaultValue={p?.region ?? ""} list="regions" autoComplete="off" /><datalist id="regions">{regions.map((r) => <option key={r} value={r} />)}</datalist></>}
              </Field>
              <Field label="Website" className="sm:col-span-2">{(id) => <Input id={id} name="website" type="url" defaultValue={p?.website ?? ""} placeholder="https://" />}</Field>
            </div>
          </Panel>
          <Panel title="Porträt" description="Erscheint auf der Produzenten-Seite. Markdown möglich (**fett**, Absätze, Links).">
            <LocalizedInput label="Beschreibung" name="description" value={p?.description ?? undefined} locales={locales} multiline rows={7} />
          </Panel>
          {p && (
            <Panel title={`Produkte (${products.length})`}>
              {products.length ? (
                <ul className="grid gap-1 text-sm sm:grid-cols-2">
                  {products.map((x) => (
                    <li key={x.id}><Link to={`/admin/products/${x.id}`} className={x.active ? "hover:underline" : "text-muted-fg line-through hover:underline"}>{x.name.de ?? Object.values(x.name)[0]}</Link></li>
                  ))}
                </ul>
              ) : (
                <div className="flex items-center justify-between gap-4 text-sm text-muted-fg">
                  Keine Produkte zugeordnet.
                  <Button type="submit" name="intent" value="delete" variant="ghost" size="sm" formNoValidate onClick={(e) => { if (!confirm("Produzent löschen?")) e.preventDefault(); }}><Trash2 size={14} /> Löschen</Button>
                </div>
              )}
            </Panel>
          )}
        </div>
        <div className="grid content-start gap-6">
          <Panel title="Logo" description="SVG, PNG oder WebP mit transparentem Hintergrund. Wird auf heller Fläche gezeigt — auch im Dark Mode.">
            <div className="mb-4 flex justify-center rounded-surface border border-border bg-muted/40 p-6">
              <ProducerLogo name={p?.name ?? "?"} logo={p?.logo} size="lg" />
            </div>
            <div className="grid gap-3">
              <Input type="file" name="logoFile" accept="image/svg+xml,image/png,image/webp,image/jpeg,image/avif" className="h-auto py-2 text-sm" />
              <Input name="logo" defaultValue={p?.logo ?? ""} placeholder="oder Logo-URL" size="sm" />
              {p?.logo && <label className="flex items-center gap-2 text-sm text-muted-fg"><input type="checkbox" name="removeLogo" className="h-4 w-4 accent-primary" /> Logo entfernen</label>}
            </div>
          </Panel>
          <Panel title="Sichtbarkeit">
            <Toggle name="featured" label="Hervorheben" description="Steht in Listen zuoberst" defaultChecked={p?.featured} />
          </Panel>
        </div>
      </div>
      <SaveBar saved={!!result && "ok" in result} />
    </Form>
  );
}
