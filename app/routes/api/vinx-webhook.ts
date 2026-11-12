import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/vinx-webhook";
import { getDb, schema } from "~/.server/db";
import { markPaid, ORDER_STATUSES, setOrderStatus } from "~/.server/orders";
import { runScheduled } from "~/.server/vinx/sync";

/**
 * Optional push channel (vinX REST is passive — use this via a small relay/agent, or rely on /api/cron).
 * Header X-Signature: hex(HMAC-SHA256(rawBody, VINX_WEBHOOK_SECRET))
 *  { "event": "stock.updated", "items": [{ "sku": "10679", "stock": 42 }] }
 *  { "event": "article.updated" }
 *  { "event": "order.status", "number": "DS-2026-000123", "status": "shipped", "paid": true }
 */
export async function action({ request }: Route.ActionArgs) {
  const secret = process.env.VINX_WEBHOOK_SECRET;
  const body = await request.text();
  const sig = Buffer.from(request.headers.get("X-Signature") ?? "", "hex");
  const expected = secret ? createHmac("sha256", secret).update(body).digest() : null;
  if (!expected || sig.length !== expected.length || !timingSafeEqual(sig, expected)) return Response.json({ error: "invalid signature" }, { status: 401 });

  const evt = JSON.parse(body) as { event: string; items?: { sku: string; stock: number }[]; number?: string; status?: string; paid?: boolean };
  const db = await getDb();
  let handled = 0;
  if (evt.event === "stock.updated") {
    for (const i of evt.items ?? []) handled += (await db.update(schema.variants).set({ stock: Math.max(0, i.stock), syncedAt: new Date() }).where(eq(schema.variants.sku, i.sku)).returning()).length;
  } else if (evt.event === "article.updated") {
    await runScheduled(["articles"]);
    handled = 1;
  } else if (evt.event === "order.status" && evt.number) {
    const o = await db.query.orders.findFirst({ where: eq(schema.orders.number, evt.number) });
    if (o && ORDER_STATUSES.includes(evt.status as never)) {
      await setOrderStatus(o.id, evt.status as (typeof ORDER_STATUSES)[number]);
      if (evt.paid) await markPaid(o.id, "vinx");
      handled = 1;
    }
  }
  return Response.json({ ok: true, handled });
}
