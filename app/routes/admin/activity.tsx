import { and, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/activity";
import { getDb, schema } from "~/.server/db";
import { countAll, listParams } from "~/.server/admin-list";
import { Input, Select } from "~/components/ui";
import { DataTable, ListToolbar, PageHeader } from "~/components/admin";

/** Admin › Protokoll: who changed what, when (app/.server/audit.ts). */
const a = schema.auditLog;
const ENTITIES: Record<string, string> = {
  product: "Produkte", producer: "Produzenten", customer: "Kunden", order: "Bestellungen", condition: "Konditionen", settings: "Einstellungen & Inhalte",
  storefront: "Storefronts", integration: "vinX / Jobs", system: "System", user: "Anmeldungen & Passwörter", media: "Dateien",
};
const LINKS: Record<string, string> = { product: "/admin/products/", producer: "/admin/producers/", customer: "/admin/customers/", order: "/admin/orders/", storefront: "/admin/storefronts/" };

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url).searchParams;
  const list = listParams(request, { sorts: { at: a.at, actor: a.actor, entity: a.entity }, defaultSort: "at", defaultDir: "desc", perPage: 50 });
  const where: SQL[] = [];
  if (list.like) where.push(or(ilike(a.summary, list.like), ilike(a.actor, list.like), ilike(a.path, list.like))!);
  if (url.get("entity")) where.push(eq(a.entity, url.get("entity")!));
  if (url.get("actor")) where.push(eq(a.actor, url.get("actor")!));
  if (url.get("from")) where.push(gte(a.at, new Date(`${url.get("from")}T00:00:00`)));
  if (url.get("to")) where.push(lte(a.at, new Date(`${url.get("to")}T23:59:59`)));
  const cond = where.length ? and(...where) : undefined;
  const db = await getDb();
  const [rows, [{ n }], actors] = await Promise.all([
    db.select().from(a).where(cond).orderBy(...list.orderBy).limit(list.limit).offset(list.offset),
    db.select({ n: countAll }).from(a).where(cond),
    db.selectDistinct({ actor: a.actor }).from(a).orderBy(a.actor).limit(100),
  ]);
  return { rows, list: list.meta(n), actors: actors.map((x) => x.actor) };
}

export const meta: Route.MetaFunction = () => [{ title: "Protokoll · Admin" }];

export default function Activity({ loaderData }: Route.ComponentProps) {
  const { rows, list, actors } = loaderData;
  const [params] = useSearchParams();
  const when = (d: Date | string) => new Date(d).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <>
      <PageHeader title="Protokoll" subtitle="Wer hat wann was geändert — Anmeldungen und alle Aktionen im Admin. Formularinhalte werden nicht gespeichert; Einträge bleiben 365 Tage." />
      <ListToolbar placeholder="Suche in Aktion, Person oder Seite" meta={list}>
        <Select name="entity" defaultValue={params.get("entity") ?? ""} size="sm" className="w-48" aria-label="Bereich">
          <option value="">Alle Bereiche</option>
          {Object.entries(ENTITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select name="actor" defaultValue={params.get("actor") ?? ""} size="sm" className="w-56" aria-label="Person">
          <option value="">Alle Personen</option>
          {actors.map((x) => <option key={x} value={x}>{x}</option>)}
        </Select>
        <Input type="date" name="from" defaultValue={params.get("from") ?? ""} size="sm" className="w-40" aria-label="Von" />
        <Input type="date" name="to" defaultValue={params.get("to") ?? ""} size="sm" className="w-40" aria-label="Bis" />
      </ListToolbar>
      <DataTable meta={list} empty={!rows.length} head={[{ label: "Zeit", sort: "at" }, { label: "Person", sort: "actor" }, { label: "Bereich", sort: "entity" }, "Aktion"]}>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-border last:border-0 align-top">
            <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-fg">{when(r.at)}</td>
            <td className="px-4 py-3 [overflow-wrap:anywhere]">{r.actor}</td>
            <td className="whitespace-nowrap px-4 py-3 text-muted-fg">{ENTITIES[r.entity ?? ""] ?? r.entity ?? "—"}</td>
            <td className="px-4 py-3">
              {r.entity && r.entityId && LINKS[r.entity] && !/gelöscht/.test(r.summary)
                ? <Link to={`${LINKS[r.entity]}${r.entityId}`} className="underline-offset-4 hover:underline">{r.summary}</Link>
                : r.summary}
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
