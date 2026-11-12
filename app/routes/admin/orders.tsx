import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { Form, useSearchParams, useSubmit } from "react-router";
import { Search } from "lucide-react";
import type { Route } from "./+types/orders";
import { getDb, schema } from "~/.server/db";
import { ORDER_STATUSES } from "~/lib/orders";
import { getSetting } from "~/.server/settings";
import { Input, Select } from "~/components/ui";
import { label, PageHeader } from "~/components/admin";
import { OrdersTable } from "~/components/orders-table";

export async function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams;
  const where: SQL[] = [];
  if (q.get("status")) where.push(eq(schema.orders.status, q.get("status") as "new"));
  if (q.get("type") === "trade") where.push(eq(schema.orders.isTrade, true));
  if (q.get("type") === "consumer") where.push(eq(schema.orders.isTrade, false));
  if (q.get("q")) where.push(or(ilike(schema.orders.number, `%${q.get("q")}%`), ilike(schema.orders.email, `%${q.get("q")}%`))!);
  const db = await getDb();
  const orders = await db.select().from(schema.orders).where(where.length ? and(...where) : undefined).orderBy(desc(schema.orders.createdAt)).limit(200);
  return { orders, currency: (await getSetting("shop")).currency, statuses: ORDER_STATUSES };
}

export default function Orders({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const submit = useSubmit();
  return (
    <>
      <PageHeader title="Bestellungen" subtitle={`${loaderData.orders.length} Einträge`} />
      <Form method="get" onChange={(e) => submit(e.currentTarget, { replace: true })} className="mb-5 flex flex-wrap gap-3">
        <div className="relative min-w-64 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
          <Input name="q" defaultValue={params.get("q") ?? ""} placeholder="Nummer oder E-Mail" className="h-10 pl-9 text-sm" />
        </div>
        <Select name="status" defaultValue={params.get("status") ?? ""} className="h-10 w-44 text-sm">
          <option value="">Alle Status</option>
          {loaderData.statuses.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </Select>
        <Select name="type" defaultValue={params.get("type") ?? ""} className="h-10 w-40 text-sm">
          <option value="">B2B + B2C</option>
          <option value="trade">Nur B2B</option>
          <option value="consumer">Nur B2C</option>
        </Select>
      </Form>
      <OrdersTable orders={loaderData.orders} currency={loaderData.currency} />
    </>
  );
}
