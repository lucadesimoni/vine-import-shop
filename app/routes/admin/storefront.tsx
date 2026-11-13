import { useState } from "react";
import { asc, eq, inArray } from "drizzle-orm";
import { data, Form, Link, redirect, useActionData } from "react-router";
import { ArrowUpRight, FileText, Palette, Settings2, Trash2 } from "lucide-react";
import type { Route } from "./+types/storefront";
import { requireStaff } from "~/.server/auth";
import { getDb, schema } from "~/.server/db";
import { assortmentSize, parseHosts, productIdsForSkus, removeStorefront, updateStorefront } from "~/.server/storefront-admin";
import { emptyCatalog } from "~/.server/storefronts";
import { tl } from "~/lib/localized";
import { cn } from "~/lib/cn";
import { Badge, Button, ButtonLink, Checkbox, Field, Input, Notice, Select, Textarea } from "~/components/ui";
import { PageHeader, Panel, SaveBar, Toggle } from "~/components/admin";

const KINDS = [["wine", "Wein"], ["food", "Lebensmittel"], ["spirit", "Spirituosen"], ["beverage", "Getränke"]] as const;

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `${loaderData?.sf.name ?? "Storefront"} · Admin` }];

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireStaff(request);
  const db = await getDb();
  const sf = await db.query.storefronts.findFirst({ where: eq(schema.storefronts.id, Number(params.id)) });
  if (!sf) throw new Response("Not found", { status: 404 });
  const catalog = { ...emptyCatalog(), ...sf.catalog };
  const skuOf = async (ids: number[]) => ids.length ? (await db.select({ sku: schema.variants.sku }).from(schema.variants).where(inArray(schema.variants.productId, ids))).map((r) => r.sku) : [];
  const [categories, producers, groups, size, include, exclude] = await Promise.all([
    db.select({ id: schema.categories.id, name: schema.categories.name, parentId: schema.categories.parentId }).from(schema.categories).orderBy(asc(schema.categories.sort)),
    db.select({ id: schema.producers.id, name: schema.producers.name }).from(schema.producers).orderBy(asc(schema.producers.name)),
    db.select().from(schema.customerGroups).orderBy(asc(schema.customerGroups.id)),
    assortmentSize(catalog),
    skuOf(catalog.includeIds),
    skuOf(catalog.excludeIds),
  ]);
  return {
    sf: { id: sf.id, slug: sf.slug, name: sf.name, hosts: sf.hosts, active: sf.active, guestGroupId: sf.guestGroupId, catalog },
    categories: categories.map((c) => ({ id: c.id, name: tl(c.name, "de"), sub: !!c.parentId })),
    producers,
    groups: groups.filter((g) => !g.isTrade).map((g) => ({ id: g.id, name: g.name })),
    size, include: include.join("\n"), exclude: exclude.join("\n"),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireStaff(request);
  if (user.role !== "admin") throw new Response("Forbidden", { status: 403 });
  const id = Number(params.id);
  const form = await request.formData();
  if (form.get("intent") === "delete") {
    await removeStorefront(id);
    return redirect("/admin/storefronts");
  }
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2) return data({ error: "Name ist erforderlich" }, { status: 400 });
  const ids = (k: string) => form.getAll(k).map(Number).filter(Number.isFinite);
  await updateStorefront(id, {
    name,
    hosts: parseHosts(String(form.get("hosts") ?? "")),
    active: form.has("active"),
    guestGroupId: Number(form.get("guestGroupId")) || null,
    catalog: {
      kinds: form.getAll("kinds").map(String),
      categoryIds: ids("categoryIds"),
      producerIds: ids("producerIds"),
      includeIds: await productIdsForSkus(String(form.get("include") ?? "")),
      excludeIds: await productIdsForSkus(String(form.get("exclude") ?? "")),
    },
  });
  return { ok: true };
}

export default function StorefrontEdit({ loaderData }: Route.ComponentProps) {
  const { sf, categories, producers, groups, size, include, exclude } = loaderData;
  const result = useActionData<typeof action>();
  const [filter, setFilter] = useState("");
  const shown = producers.filter((p) => !filter || p.name.toLowerCase().includes(filter.toLowerCase()) || sf.catalog.producerIds.includes(p.id));
  const editors = [
    { to: `/admin/design?sf=${sf.slug}`, label: "Design & Marke", hint: "Logo, Farben, Schriften, Kontakt", icon: Palette },
    { to: `/admin/settings?sf=${sf.slug}`, label: "Einstellungen", hint: "Sprachen, Preise, Versand, Zahlung, Module", icon: Settings2 },
    { to: `/admin/content?sf=${sf.slug}`, label: "Inhalte", hint: "Startseite, Seiten, Impressum & AGB", icon: FileText },
  ];
  return (
    <>
      <PageHeader
        title={sf.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">Storefront · {size} Produkte im Sortiment {!sf.active && <Badge tone="warning">inaktiv</Badge>}</span>}
        actions={<ButtonLink to={`/?storefront=${sf.slug}`} target="_blank" variant="secondary" size="sm">Vorschau <ArrowUpRight size={14} /></ButtonLink>}
      />
      {result && "error" in result && <Notice tone="danger" className="mb-6">{result.error}</Notice>}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {editors.map((e) => (
          <Link key={e.to} to={e.to} className="group flex items-start gap-3 rounded-surface border border-border bg-card p-4 transition-colors hover:border-border-strong">
            <e.icon size={18} className="mt-0.5 shrink-0 text-muted-fg group-hover:text-primary" />
            <span className="grid min-w-0 gap-0.5"><span className="font-medium">{e.label}</span><span className="text-note text-muted-fg">{e.hint}</span></span>
          </Link>
        ))}
      </div>

      <Form method="post" key={JSON.stringify(sf)}>
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Shop & Domains">
            <div className="grid gap-4">
              <Field label="Name" required>{(id) => <Input id={id} name="name" defaultValue={sf.name} required />}</Field>
              <Field label="Domains" hint="Eine pro Zeile (www. wird automatisch erkannt). DNS der Domain auf diese Installation zeigen lassen; bis dahin Vorschau über /?storefront=…">
                {(id) => <Textarea id={id} name="hosts" rows={3} defaultValue={sf.hosts.join("\n")} placeholder="daferrari.ch" className="font-mono text-note" />}
              </Field>
              <Field label="Preise & Konditionen" hint="Kundengruppe für Gäste und neue Kunden dieses Shops — z. B. eine eigene Preisliste (vinX-Preisgruppe der Gruppe)">
                {(id) => (
                  <Select id={id} name="guestGroupId" defaultValue={sf.guestGroupId ?? ""}>
                    <option value="">Listenpreise (wie Hauptshop)</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </Select>
                )}
              </Field>
              <div className="divide-y divide-border"><Toggle name="active" label="Aktiv" description="Inaktiv: Domains zeigen den Hauptshop" defaultChecked={sf.active} /></div>
            </div>
          </Panel>

          <Panel title="Sortiment" description="Leer = alles. Regeln werden kombiniert (Art UND Kategorie UND Produzent); einzelne Artikel lassen sich zusätzlich aufnehmen oder ausschliessen.">
            <div className="grid gap-5">
              <fieldset className="grid gap-2">
                <legend className="text-field-label mb-1">Produktarten</legend>
                <div className="flex flex-wrap gap-x-5 gap-y-2">{KINDS.map(([k, l]) => <Checkbox key={k} name="kinds" value={k} label={l} defaultChecked={sf.catalog.kinds.includes(k)} />)}</div>
              </fieldset>
              <fieldset className="grid gap-2">
                <legend className="text-field-label mb-1">Kategorien</legend>
                <div className="grid max-h-56 gap-2 overflow-y-auto rounded-control border border-border p-3 sm:grid-cols-2">
                  {categories.map((c) => <Checkbox key={c.id} name="categoryIds" value={c.id} label={c.name} defaultChecked={sf.catalog.categoryIds.includes(c.id)} className={cn(c.sub && "pl-4")} />)}
                </div>
              </fieldset>
              <fieldset className="grid gap-2">
                <legend className="text-field-label mb-1">Produzenten {sf.catalog.producerIds.length > 0 && <span className="normal-case tracking-normal text-muted-fg">· {sf.catalog.producerIds.length} gewählt</span>}</legend>
                <Input size="sm" placeholder="Produzent suchen …" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Produzent suchen" />
                <div className="grid max-h-56 gap-2 overflow-y-auto rounded-control border border-border p-3 sm:grid-cols-2">
                  {producers.map((p) => (
                    <span key={p.id} className={cn(!shown.includes(p) && "hidden")}><Checkbox name="producerIds" value={p.id} label={p.name} defaultChecked={sf.catalog.producerIds.includes(p.id)} /></span>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Zusätzlich anbieten" hint="Artikelnummern">{(id) => <Textarea id={id} name="include" rows={4} defaultValue={include} className="font-mono text-note" />}</Field>
                <Field label="Nie anbieten" hint="Artikelnummern">{(id) => <Textarea id={id} name="exclude" rows={4} defaultValue={exclude} className="font-mono text-note" />}</Field>
              </div>
            </div>
          </Panel>
        </div>
        <SaveBar saved={!!result && "ok" in result} />
      </Form>

      <Form method="post" className="mt-6" onSubmit={(e) => !confirm(`Storefront „${sf.name}“ löschen? Eigene Einstellungen und Seiten werden entfernt; Bestellungen und Kunden bleiben erhalten.`) && e.preventDefault()}>
        <input type="hidden" name="intent" value="delete" />
        <Button type="submit" variant="ghost" size="sm" className="text-muted-fg hover:text-danger"><Trash2 size={14} /> Storefront löschen</Button>
      </Form>
    </>
  );
}
