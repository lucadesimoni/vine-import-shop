import { and, asc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { Link, useActionData, useSearchParams } from "react-router";
import { Lock, Plus } from "lucide-react";
import type { Route } from "./+types/products";
import { getDb, schema } from "~/.server/db";
import { getSettings } from "~/.server/settings";
import { bulkIds, countAll, listParams } from "~/.server/admin-list";
import { erpOwnedFields } from "~/.server/erp-ownership";
import { formatMoney } from "~/lib/money";
import { Badge, ButtonLink, Notice, Select } from "~/components/ui";
import { DataTable, ListToolbar, PageHeader, RowCheck } from "~/components/admin";
import { ProductImage } from "~/components/shop";

const p = schema.products;
const NAME = sql`coalesce(products.name->>'de', products.name::text)`;
const PRICE = sql`(select min(vv.price_cents) from variants vv where vv.product_id = products.id)`;
const STOCK = sql`(select coalesce(sum(vv.stock), 0) from variants vv where vv.product_id = products.id)`;

const FIELD_LABELS: Record<string, string> = { price: "Preis", stock: "Lager", vintage: "Jahrgang", size: "Format", active: "Aktiv", taxClass: "MWST", packSize: "Gebinde" };

const BULK = {
  activate: { label: "Aktivieren", field: "active", set: { active: true } },
  deactivate: { label: "Deaktivieren", field: "active", set: { active: false } },
  promo: { label: "Aktion an", field: "promo", set: { promo: true } },
  unpromo: { label: "Aktion aus", field: "promo", set: { promo: false } },
  feature: { label: "Empfehlen", field: "featured", set: { featured: true } },
  unfeature: { label: "Nicht empfehlen", field: "featured", set: { featured: false } },
  trade: { label: "Nur B2B", field: "tradeOnly", set: { tradeOnly: true } },
  untrade: { label: "Für alle", field: "tradeOnly", set: { tradeOnly: false } },
} as const;

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url).searchParams;
  const list = listParams(request, { sorts: { name: NAME, producer: schema.producers.name, category: sql`categories.sort`, price: PRICE, stock: STOCK, updated: p.updatedAt }, defaultSort: "name" });
  const where: SQL[] = [];
  if (list.like) where.push(or(sql`products.name::text ilike ${list.like}`, ilike(schema.producers.name, list.like), sql`exists (select 1 from variants vs where vs.product_id = products.id and (vs.sku ilike ${list.like} or vs.erp_id ilike ${list.like}))`)!);
  const f = { category: url.get("category"), producer: url.get("producer"), status: url.get("status"), kind: url.get("kind"), flag: url.get("flag") };
  if (f.category) where.push(eq(p.categoryId, Number(f.category)));
  if (f.producer) where.push(eq(p.producerId, Number(f.producer)));
  if (f.kind) where.push(eq(p.kind, f.kind as "wine"));
  if (f.status === "active") where.push(eq(p.active, true));
  if (f.status === "inactive") where.push(eq(p.active, false));
  if (f.status === "soldout") where.push(sql`${STOCK} <= 0`);
  if (f.flag === "promo") where.push(eq(p.promo, true));
  if (f.flag === "featured") where.push(eq(p.featured, true));
  if (f.flag === "trade") where.push(eq(p.tradeOnly, true));
  if (f.flag === "noimage") where.push(isNull(p.image));
  if (f.flag === "notext") where.push(sql`coalesce(products.description->>'de', '') = ''`);
  const cond = where.length ? and(...where) : undefined;
  const db = await getDb();
  const base = () => db.select({ n: countAll }).from(p).leftJoin(schema.producers, eq(schema.producers.id, p.producerId)).where(cond);
  const [rows, [{ n }], categories, producers, owned] = await Promise.all([
    db.select({
      id: p.id, slug: p.slug, name: p.name, kind: p.kind, color: p.color, image: p.image, updatedAt: p.updatedAt,
      active: p.active, promo: p.promo, featured: p.featured, tradeOnly: p.tradeOnly,
      producer: schema.producers.name, category: schema.categories.name,
      variants: sql<{ sku: string; price: number; stock: number; erp: boolean }[]>`coalesce((select json_agg(json_build_object('sku', vv.sku, 'price', vv.price_cents, 'stock', vv.stock, 'erp', vv.erp_id is not null) order by vv.sort) from variants vv where vv.product_id = products.id), '[]')`,
    })
      .from(p)
      .leftJoin(schema.producers, eq(schema.producers.id, p.producerId))
      .leftJoin(schema.categories, eq(schema.categories.id, p.categoryId))
      .where(cond)
      .orderBy(...list.orderBy, asc(p.id))
      .limit(list.limit)
      .offset(list.offset),
    base(),
    db.select({ id: schema.categories.id, name: schema.categories.name, parentId: schema.categories.parentId }).from(schema.categories).orderBy(asc(schema.categories.sort)),
    db.select({ id: schema.producers.id, name: schema.producers.name }).from(schema.producers).orderBy(asc(schema.producers.name)),
    erpOwnedFields(),
  ]);
  const { shop } = await getSettings("shop");
  return { rows, list: list.meta(n), categories, producers, owned, currency: shop.currency };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const ids = bulkIds(form);
  const action = String(form.get("action"));
  if (!ids.length) return { message: "Nichts ausgewählt." };
  const db = await getDb();
  // ERP-linked = any variant carries an ERP article id; only those are locked
  const linkedIds = new Set((await db.selectDistinct({ id: schema.variants.productId }).from(schema.variants).where(and(inArray(schema.variants.productId, ids), isNotNull(schema.variants.erpId)))).map((r) => r.id));
  const free = ids.filter((id) => !linkedIds.has(id));
  const skipped = ids.length - free.length;
  const note = skipped ? ` · ${skipped} mit vinX verknüpft übersprungen (in vinX ändern)` : "";
  if (action === "delete") {
    if (free.length) await db.delete(p).where(inArray(p.id, free));
    return { message: `${free.length} Produkt${free.length === 1 ? "" : "e"} gelöscht${note}.` };
  }
  const op = BULK[action as keyof typeof BULK];
  if (!op) return { message: "Unbekannte Aktion." };
  const target = (await erpOwnedFields()).includes(op.field) ? free : ids;
  if (target.length) await db.update(p).set({ ...op.set, updatedAt: new Date() }).where(inArray(p.id, target));
  return { message: `${target.length} Produkt${target.length === 1 ? "" : "e"}: ${op.label}${target.length < ids.length ? note : ""}.` };
}

export default function Products({ loaderData }: Route.ComponentProps) {
  const { rows, list, categories, producers, owned, currency } = loaderData;
  const result = useActionData<typeof action>();
  const [params] = useSearchParams();
  const erp = owned.length > 0;
  return (
    <>
      <PageHeader
        title="Produkte"
        subtitle={erp ? <span className="flex flex-wrap items-center gap-1.5"><Lock size={12} /> vinX führt {owned.map((f) => FIELD_LABELS[f] ?? f).join(", ")} — Texte, Bilder, Zuordnung & Sichtbarkeit pflegen Sie hier.</span> : "Texte, Bilder, Preise, Lager & Sichtbarkeit."}
        actions={<ButtonLink to="/admin/products/new" size="sm"><Plus size={15} /> Neues Produkt</ButtonLink>}
      />
      {result && "message" in result && <Notice tone="success" className="mb-5">{result.message}</Notice>}
      {params.get("deleted") && !result && <Notice tone="success" className="mb-5">Produkt gelöscht.</Notice>}
      <ListToolbar placeholder="Name, Produzent, Art.-Nr. oder ERP-Nr." meta={list}>
        <Select name="category" defaultValue={params.get("category") ?? ""} size="sm" className="w-44" aria-label="Kategorie">
          <option value="">Alle Kategorien</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.parentId ? "— " : ""}{c.name.de}</option>)}
        </Select>
        <Select name="producer" defaultValue={params.get("producer") ?? ""} size="sm" className="w-44" aria-label="Produzent">
          <option value="">Alle Produzenten</option>
          {producers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
        <Select name="status" defaultValue={params.get("status") ?? ""} size="sm" className="w-36" aria-label="Status">
          <option value="">Status: alle</option><option value="active">Aktiv</option><option value="inactive">Inaktiv</option><option value="soldout">Ausverkauft</option>
        </Select>
        <Select name="flag" defaultValue={params.get("flag") ?? ""} size="sm" className="w-40" aria-label="Merkmal">
          <option value="">Merkmal: alle</option><option value="promo">Aktion</option><option value="featured">Empfohlen</option><option value="trade">Nur B2B</option><option value="noimage">Ohne Bild</option><option value="notext">Ohne Beschreibung</option>
        </Select>
      </ListToolbar>
      <DataTable
        meta={list}
        empty={!rows.length}
        bulk={[...Object.entries(BULK).map(([value, b]) => ({ value, label: b.label })), { value: "delete", label: "Löschen", tone: "danger" as const }]}
        head={["", { label: "Produkt", sort: "name" }, { label: "Kategorie", sort: "category" }, "Art.-Nr.", { label: "Preis", sort: "price" }, { label: "Lager", sort: "stock" }, "Status"]}
      >
        {rows.map((x) => {
          const stock = x.variants.reduce((a, v) => a + v.stock, 0);
          return (
            <tr key={x.id}>
              <RowCheck id={x.id} label={x.name.de} />
              <td className="w-14"><div className="relative h-12 w-10 rounded-badge bg-media p-0.5"><ProductImage product={{ image: x.image, name: x.name.de ?? "", kind: x.kind, color: x.color }} /></div></td>
              <td><Link to={`/admin/products/${x.id}`} className="font-medium hover:underline">{x.name.de ?? Object.values(x.name)[0]}</Link><span className="block text-xs text-muted-fg">{x.producer}</span></td>
              <td className="text-muted-fg">{x.category?.de}</td>
              <td className="font-mono text-xs text-muted-fg">{x.variants.map((v) => v.sku).join(", ")}</td>
              <td className="whitespace-nowrap tabular-nums">{x.variants[0] ? formatMoney(Math.min(...x.variants.map((v) => v.price)), currency, "de") : "—"}</td>
              <td className={stock <= 0 ? "text-danger tabular-nums" : "tabular-nums"}>{stock}</td>
              <td className="space-x-1 whitespace-nowrap">
                <Badge tone={x.active ? "success" : "neutral"}>{x.active ? "aktiv" : "inaktiv"}</Badge>
                {x.promo && <Badge tone="primary">Aktion</Badge>}
                {x.tradeOnly && <Badge>B2B</Badge>}
                {x.variants.some((v) => v.erp) && <Badge title="Mit vinX verknüpft">vinX</Badge>}
              </td>
            </tr>
          );
        })}
      </DataTable>
    </>
  );
}
