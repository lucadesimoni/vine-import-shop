import { and, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { Form, Link, useActionData, useSearchParams } from "react-router";
import { ExternalLink, Map as MapIcon, Plus, Star } from "lucide-react";
import type { Route } from "./+types/producers";
import { getDb, schema } from "~/.server/db";
import { getSettings, saveSetting } from "~/.server/settings";
import { bulkIds, countAll, listParams } from "~/.server/admin-list";
import { countryIso } from "~/.server/origins";
import { REGION_MAP_COUNTRIES } from "~/lib/maps/regions";
import { countryName } from "~/lib/maps/names";
import de from "~/lib/i18n/de";
import { Badge, Button, ButtonLink, Field, Notice, Select } from "~/components/ui";
import { DataTable, ListToolbar, PageHeader, Panel, RowCheck } from "~/components/admin";
import { ProducerLogo } from "~/components/producer";

const pr = schema.producers;
const PRODUCTS = sql<number>`(select count(*)::int from products pp where pp.producer_id = producers.id)`;

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url).searchParams;
  const list = listParams(request, { sorts: { name: pr.name, country: pr.country, region: pr.region, products: PRODUCTS }, defaultSort: "name" });
  const where: SQL[] = [];
  if (list.like) where.push(or(ilike(pr.name, list.like), ilike(pr.region, list.like), ilike(pr.country, list.like), ilike(pr.erpId, list.like))!);
  if (url.get("country")) where.push(eq(pr.country, url.get("country")!));
  if (url.get("logo") === "yes") where.push(isNotNull(pr.logo));
  if (url.get("logo") === "no") where.push(isNull(pr.logo));
  if (url.get("featured") === "1") where.push(eq(pr.featured, true));
  if (url.get("source") === "erp") where.push(isNotNull(pr.erpId));
  if (url.get("source") === "shop") where.push(isNull(pr.erpId));
  const cond = where.length ? and(...where) : undefined;
  const db = await getDb();
  const [rows, [{ n }], countries, { shop, vinx }] = await Promise.all([
    db.select({ id: pr.id, slug: pr.slug, name: pr.name, country: pr.country, region: pr.region, logo: pr.logo, featured: pr.featured, erpId: pr.erpId, website: pr.website, products: PRODUCTS })
      .from(pr).where(cond).orderBy(...list.orderBy).limit(list.limit).offset(list.offset),
    db.select({ n: countAll }).from(pr).where(cond),
    db.selectDistinct({ country: pr.country }).from(pr).where(isNotNull(pr.country)).orderBy(pr.country),
    getSettings("shop", "vinx"),
  ]);
  const missingLogo = (await db.select({ n: countAll }).from(pr).where(isNull(pr.logo)))[0].n;
  return {
    rows: rows.map((r) => ({ ...r, iso: countryIso(r.country) })),
    list: list.meta(n),
    countries: countries.map((c) => c.country!).filter(Boolean),
    originMap: shop.originMap,
    term: shop.terms.producers,
    erp: vinx.enabled,
    missingLogo,
    mapCountries: REGION_MAP_COUNTRIES,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const db = await getDb();
  const intent = form.get("intent");
  if (intent === "map") {
    const { shop } = await getSettings("shop");
    const mode = String(form.get("mode"));
    const country = String(form.get("country") ?? "").toUpperCase();
    await saveSetting("shop", { ...shop, originMap: { mode: ["auto", "regions", "world", "off"].includes(mode) ? mode : shop.originMap.mode, country: /^[A-Z]{2}$/.test(country) ? country : shop.originMap.country } });
    return { ok: "Herkunftskarte gespeichert." };
  }
  if (intent === "bulk") {
    const ids = bulkIds(form);
    if (!ids.length) return { ok: "Nichts ausgewählt." };
    const action = form.get("action");
    if (action === "feature" || action === "unfeature") {
      await db.update(pr).set({ featured: action === "feature" }).where(inArray(pr.id, ids));
      return { ok: `${ids.length} aktualisiert.` };
    }
    if (action === "delete") {
      const used = await db.select({ id: schema.products.producerId }).from(schema.products).where(inArray(schema.products.producerId, ids));
      const free = ids.filter((id) => !used.some((u) => u.id === id));
      if (free.length) await db.delete(pr).where(inArray(pr.id, free));
      return { ok: `${free.length} gelöscht${free.length < ids.length ? ` · ${ids.length - free.length} mit Produkten übersprungen` : ""}.` };
    }
  }
  return { ok: "" };
}

export default function Producers({ loaderData }: Route.ComponentProps) {
  const { rows, list, countries, originMap, term, erp, missingLogo, mapCountries } = loaderData;
  const result = useActionData<typeof action>();
  const [params] = useSearchParams();
  const title = de[`term.producers.${term}`];
  return (
    <>
      <PageHeader
        title={title}
        subtitle={<>Logo, Herkunft, Beschreibung und Website pflegen. {erp && "Neue Einträge legt der vinX-Sync automatisch an; Logo, Texte und Website bleiben im Shop."}</>}
        actions={<><ButtonLink to="/producers" target="_blank" variant="secondary" size="sm"><ExternalLink size={14} /> Im Shop</ButtonLink><ButtonLink to="/admin/producers/new" size="sm"><Plus size={15} /> Neu</ButtonLink></>}
      />
      {result?.ok && <Notice tone="success" className="mb-5">{result.ok}</Notice>}

      <Panel title="Herkunftskarte" description={`Standardansicht der Produzenten-Seite — Besucher wechseln selbst zwischen Regionen, Welt und A–Z. Regionenkarten für ${mapCountries.length} Länder; Länder ohne Regionenkarte erscheinen auf der Weltkarte.`} className="mb-6" actions={<MapIcon size={18} className="text-muted-fg" />}>
        <Form method="post" className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
          <input type="hidden" name="intent" value="map" />
          <Field label="Standardansicht">
            {(id) => (
              <Select id={id} name="mode" defaultValue={originMap.mode}>
                <option value="auto">Automatisch</option>
                <option value="regions">Regionen des Heimatlands</option>
                <option value="world">Weltkarte (abstrahiert)</option>
                <option value="off">Keine Karte (nur A–Z)</option>
              </Select>
            )}
          </Field>
          <Field label="Heimatland (Regionenkarte)">
            {(id) => (
              <Select id={id} name="country" defaultValue={originMap.country}>
                {mapCountries.map((iso) => <option key={iso} value={iso}>{countryName(iso, "de")} ({iso})</option>)}
              </Select>
            )}
          </Field>
          <Button type="submit" variant="secondary">Speichern</Button>
        </Form>
      </Panel>

      {missingLogo > 0 && !params.get("logo") && (
        <Notice className="mb-5">{missingLogo} ohne Logo — <Link to="?logo=no" className="underline underline-offset-4">anzeigen</Link>. Ohne Logo erscheint ein Monogramm in Markenfarbe.</Notice>
      )}

      <ListToolbar placeholder="Name, Region, Land oder ERP-Nr." meta={list}>
        <Select name="country" defaultValue={params.get("country") ?? ""} size="sm" className="w-44" aria-label="Land">
          <option value="">Alle Länder</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select name="logo" defaultValue={params.get("logo") ?? ""} size="sm" className="w-36" aria-label="Logo">
          <option value="">Logo: alle</option><option value="yes">mit Logo</option><option value="no">ohne Logo</option>
        </Select>
        {erp && (
          <Select name="source" defaultValue={params.get("source") ?? ""} size="sm" className="w-36" aria-label="Quelle">
            <option value="">Quelle: alle</option><option value="erp">aus vinX</option><option value="shop">nur Shop</option>
          </Select>
        )}
      </ListToolbar>

      <DataTable
        meta={list}
        empty={!rows.length}
        bulk={[{ value: "feature", label: "Hervorheben" }, { value: "unfeature", label: "Nicht hervorheben" }, { value: "delete", label: "Löschen", tone: "danger" }]}
        head={["", { label: "Name", sort: "name" }, { label: "Land", sort: "country" }, { label: "Region", sort: "region" }, { label: "Produkte", sort: "products", className: "text-right" }, ""]}
      >
        {rows.map((p) => (
          <tr key={p.id}>
            <RowCheck id={p.id} label={p.name} />
            <td className="w-14"><ProducerLogo name={p.name} logo={p.logo} size="sm" /></td>
            <td>
              <Link to={`/admin/producers/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
              {p.website && <span className="block truncate text-[12px] text-muted-fg">{p.website.replace(/^https?:\/\/(www\.)?/, "")}</span>}
            </td>
            <td className="text-muted-fg">{p.iso ? countryName(p.iso, "de") : p.country ?? "—"}</td>
            <td className="text-muted-fg">{p.region ?? "—"}</td>
            <td className="text-right tabular-nums">{p.products}</td>
            <td className="space-x-1 whitespace-nowrap text-right">
              {p.featured && <Badge tone="primary"><Star size={10} /> Top</Badge>}
              {p.erpId && <Badge title={`vinX: ${p.erpId}`}>vinX</Badge>}
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
