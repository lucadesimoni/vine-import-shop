import { eq } from "drizzle-orm";
import type { Route } from "./+types/order-label";
import { requireStaff } from "~/.server/auth";
import { getDb, schema } from "~/.server/db";

/** Shipping label PDF of an order (admin only — it carries the customer's address). */
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireStaff(request);
  const db = await getDb();
  const o = await db.query.orders.findFirst({ where: eq(schema.orders.id, Number(params.id)), columns: { number: true, shippingLabel: true } });
  if (!o?.shippingLabel) throw new Response("Not found", { status: 404 });
  return new Response(Buffer.from(o.shippingLabel, "base64"), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="etikett-${o.number}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
