import { count, sql } from "drizzle-orm";
import { data, Form, Link, redirect, useActionData } from "react-router";
import { ArrowUpRight, Plus, Store } from "lucide-react";
import type { Route } from "./+types/storefronts";
import { requireStaff } from "~/.server/auth";
import { getDb, schema } from "~/.server/db";
import { createStorefront } from "~/.server/storefront-admin";
import { listStorefronts } from "~/.server/storefronts";
import { slugify } from "~/lib/slug";
import { Badge, Button, Field, Input, Notice } from "~/components/ui";
import { DataTable, PageHeader, Panel } from "~/components/admin";

export const meta: Route.MetaFunction = () => [{ title: "Storefronts · Admin" }];

export async function loader({ request }: Route.LoaderArgs) {
  await requireStaff(request);
  const db = await getDb();
  const [list, orders, customers] = await Promise.all([
    listStorefronts(),
    db.select({ id: schema.orders.storefrontId, n: count(), sum: sql<number>`coalesce(sum(${schema.orders.totalGross}),0)::int` }).from(schema.orders).groupBy(schema.orders.storefrontId),
    db.select({ id: schema.users.storefrontId, n: count() }).from(schema.users).where(sql`${schema.users.role} = 'customer'`).groupBy(schema.users.storefrontId),
  ]);
  const stat = (id: number | null) => ({ orders: orders.find((o) => o.id === id)?.n ?? 0, revenue: orders.find((o) => o.id === id)?.sum ?? 0, customers: customers.find((c) => c.id === id)?.n ?? 0 });
  return {
    main: stat(null),
    storefronts: [...list].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ id: s.id, slug: s.slug, name: s.name, hosts: s.hosts, active: s.active, ...stat(s.id) })),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireStaff(request);
  if (user.role !== "admin") throw new Response("Forbidden", { status: 403 });
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2) return data({ error: "Name ist erforderlich" }, { status: 400 });
  const slug = slugify(String(form.get("slug") || name)).slice(0, 40);
  if (!slug || slug === "main") return data({ error: "Ungültige Kurzbezeichnung" }, { status: 400 });
  if ((await listStorefronts()).some((s) => s.slug === slug)) return data({ error: `„${slug}“ ist schon vergeben` }, { status: 400 });
  const sf = await createStorefront({ name, slug, hosts: String(form.get("hosts") ?? "") });
  return redirect(`/admin/storefronts/${sf.id}`);
}

export default function Storefronts({ loaderData }: Route.ComponentProps) {
  const { main, storefronts } = loaderData;
  const result = useActionData<typeof action>();
  const chf = (c: number) => `CHF ${(c / 100).toLocaleString("de-CH", { maximumFractionDigits: 0 })}`;
  return (
    <>
      <PageHeader title="Storefronts" subtitle="Weitere Shops auf eigener Domain — z. B. für eine Tochterfirma: eigene Marke, eigenes Sortiment, eigene Kunden, Bestellungen und Rechtstexte. Produkte, Lager, ERP und Admin bleiben gemeinsam." />
      {result && "error" in result && <Notice tone="danger" className="mb-6">{result.error}</Notice>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <DataTable head={["Shop", "Domains", "Kunden", "Bestellungen", "Umsatz", ""]} empty={false}>
          <tr>
            <td className="font-medium">Hauptshop <span className="ml-1 text-note font-normal text-muted-fg">Plattform</span></td>
            <td className="text-muted-fg">—</td>
            <td className="tabular-nums">{main.customers}</td>
            <td className="tabular-nums">{main.orders}</td>
            <td className="whitespace-nowrap tabular-nums">{chf(main.revenue)}</td>
            <td />
          </tr>
          {storefronts.map((s) => (
            <tr key={s.id}>
              <td>
                <Link to={`/admin/storefronts/${s.id}`} className="flex items-center gap-2 font-medium hover:underline"><Store size={14} className="shrink-0 text-muted-fg" /> {s.name}</Link>
                {!s.active && <Badge tone="warning" className="mt-1">inaktiv</Badge>}
              </td>
              <td className="max-w-56 text-note text-muted-fg [overflow-wrap:anywhere]">{s.hosts.join(", ") || "noch keine — Vorschau über ?storefront=" + s.slug}</td>
              <td className="tabular-nums">{s.customers}</td>
              <td className="tabular-nums">{s.orders}</td>
              <td className="whitespace-nowrap tabular-nums">{chf(s.revenue)}</td>
              <td className="w-0 whitespace-nowrap text-right"><a href={`/?storefront=${s.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-note text-muted-fg hover:text-fg">Vorschau <ArrowUpRight size={13} /></a></td>
            </tr>
          ))}
        </DataTable>
        <Panel title="Neuer Storefront" description="Startet als Kopie von Marke und Einstellungen des Hauptshops (ohne B2B-Portal) mit eigenen Rechtstext-Vorlagen.">
          <Form method="post" className="grid gap-4">
            <Field label="Name" required>{(id) => <Input id={id} name="name" placeholder="Da Ferrari" required />}</Field>
            <Field label="Kurzbezeichnung" hint="Für Vorschau und Admin, z. B. daferrari">{(id) => <Input id={id} name="slug" placeholder="automatisch" />}</Field>
            <Field label="Domains" hint="Eine pro Zeile, z. B. daferrari.ch — DNS auf diese Installation zeigen lassen">{(id) => <Input id={id} name="hosts" placeholder="daferrari.ch" />}</Field>
            <Button type="submit" className="w-fit"><Plus size={15} /> Anlegen</Button>
          </Form>
        </Panel>
      </div>
    </>
  );
}
