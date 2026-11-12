import { asc, eq, ilike, or, sql } from "drizzle-orm";
import { Form, Link, useSearchParams } from "react-router";
import { Plus, Search } from "lucide-react";
import type { Route } from "./+types/products";
import { getDb, schema } from "~/.server/db";
import { formatMoney } from "~/lib/money";
import { Badge, ButtonLink, Input } from "~/components/ui";
import { DataTable, PageHeader } from "~/components/admin";
import { ProductImage } from "~/components/shop";

export async function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const db = await getDb();
  const rows = await db
    .select({
      id: schema.products.id, slug: schema.products.slug, name: schema.products.name, kind: schema.products.kind, color: schema.products.color, image: schema.products.image,
      active: schema.products.active, promo: schema.products.promo, featured: schema.products.featured, tradeOnly: schema.products.tradeOnly,
      producer: schema.producers.name, category: schema.categories.name,
      variants: sql<{ sku: string; price: number; stock: number }[]>`coalesce((select json_agg(json_build_object('sku', vv.sku, 'price', vv.price_cents, 'stock', vv.stock) order by vv.sort) from variants vv where vv.product_id = products.id), '[]')`,
    })
    .from(schema.products)
    .leftJoin(schema.producers, eq(schema.producers.id, schema.products.producerId))
    .leftJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(q ? or(sql`products.name::text ilike ${`%${q}%`}`, ilike(schema.producers.name, `%${q}%`), sql`exists (select 1 from variants vs where vs.product_id = products.id and vs.sku ilike ${`%${q}%`})`) : undefined)
    .orderBy(asc(schema.categories.sort), asc(sql`products.name->>'de'`))
    .limit(300);
  return { rows, q };
}

export default function Products({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  return (
    <>
      <PageHeader title="Produkte" subtitle="Stammdaten, Preise & Lager kommen aus vinX. Texte, Bilder & Sichtbarkeit pflegen Sie hier." actions={<ButtonLink to="/admin/products/new" size="sm"><Plus size={15} /> Neues Produkt</ButtonLink>} />
      <Form method="get" className="relative mb-5 max-w-md">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
        <Input name="q" defaultValue={params.get("q") ?? ""} placeholder="Name, Produzent oder Art.-Nr." size="sm" className="pl-9" />
      </Form>
      <DataTable head={["", "Produkt", "Kategorie", "Varianten", "Preis", "Lager", "Status"]} empty={!loaderData.rows.length}>
        {loaderData.rows.map((p) => (
          <tr key={p.id}>
            <td className="w-14"><div className="relative h-12 w-10 rounded-badge bg-media p-0.5"><ProductImage product={{ image: p.image, name: p.name.de ?? "", kind: p.kind, color: p.color }} /></div></td>
            <td><Link to={`/admin/products/${p.id}`} className="font-medium hover:underline">{p.name.de}</Link><span className="block text-[12px] text-muted-fg">{p.producer}</span></td>
            <td className="text-muted-fg">{p.category?.de}</td>
            <td className="font-mono text-[12px] text-muted-fg">{p.variants.map((v) => v.sku).join(", ")}</td>
            <td className="whitespace-nowrap tabular-nums">{p.variants[0] ? formatMoney(p.variants[0].price, "CHF", "de") : "—"}</td>
            <td className="tabular-nums">{p.variants.reduce((a, v) => a + v.stock, 0)}</td>
            <td className="space-x-1 whitespace-nowrap">
              <Badge tone={p.active ? "success" : "neutral"}>{p.active ? "aktiv" : "inaktiv"}</Badge>
              {p.promo && <Badge tone="primary">Aktion</Badge>}
              {p.tradeOnly && <Badge>B2B</Badge>}
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
