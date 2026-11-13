import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { CartSummary } from "./cart";
import type { ShopContext } from "./context";
import { getDb, schema } from "./db";
import type { Address } from "./db/schema";
import { emit } from "./events";

import { ORDER_STATUSES } from "~/lib/orders";
export { ORDER_STATUSES };

export async function placeOrder(
  ctx: ShopContext,
  summary: CartSummary,
  input: { email: string; billing: Address; shipping: Address | null; paymentMethod: string; notes?: string; poNumber?: string; deliveryDate?: string },
) {
  const db = await getDb();
  const t = summary.totals;
  const order = await db.transaction(async (tx) => {
    const [o] = await tx
      .insert(schema.orders)
      .values({
        number: `TMP-${randomBytes(6).toString("hex")}`,
        token: randomBytes(20).toString("hex"),
        kind: summary.isRequest ? "request" : "order",
        userId: ctx.user?.id ?? null,
        groupId: ctx.group?.id ?? null,
        isTrade: ctx.isTrade,
        email: input.email,
        paymentMethod: summary.isRequest ? "request" : input.paymentMethod,
        shippingMethod: t.shippingCode,
        currency: ctx.shop.currency,
        subtotalNet: t.subtotalNet,
        subtotalGross: t.subtotalGross,
        shippingGross: t.shippingGross,
        discountGross: t.discount,
        taxTotal: t.taxTotal,
        totalGross: t.totalGross,
        couponCode: t.coupon?.code ?? null,
        billing: input.billing,
        shipping: input.shipping,
        notes: input.notes || null,
        poNumber: input.poNumber || null,
        deliveryDate: input.deliveryDate || null,
        locale: ctx.locale,
        storefrontId: ctx.storefront?.id ?? null,
      })
      .returning();
    const number = `${ctx.shop.orderPrefix}-${new Date().getFullYear()}-${String(o.id).padStart(6, "0")}`;
    await tx.update(schema.orders).set({ number }).where(eq(schema.orders.id, o.id));

    for (const [idx, l] of summary.lines.entries()) {
      const price = t.lines[idx].price;
      await tx.insert(schema.orderItems).values({
        orderId: o.id,
        variantId: l.variantId,
        sku: l.sku,
        name: [l.name, l.vintage, l.size].filter(Boolean).join(" · "),
        qty: l.qty,
        unitNet: price.net,
        unitGross: price.gross,
        taxRate: price.taxRate,
        lineGross: t.lines[idx].lineGross,
      });
      // Reserve stock locally; the ERP stays master and corrects it on next sync.
      await tx.update(schema.variants).set({ stock: sql`greatest(${schema.variants.stock} - ${l.qty}, 0)` }).where(eq(schema.variants.id, l.variantId));
    }
    return { ...o, number };
  });

  await emit("order.placed", { orderId: order.id });
  return order;
}

export async function getOrder(where: { id?: number; number?: string }) {
  const db = await getDb();
  const order = await db.query.orders.findFirst({
    where: where.id ? eq(schema.orders.id, where.id) : eq(schema.orders.number, where.number ?? ""),
  });
  if (!order) return null;
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id)).orderBy(schema.orderItems.id);
  return { ...order, items };
}
export type OrderWithItems = NonNullable<Awaited<ReturnType<typeof getOrder>>>;

/** Set the status (admin, bulk action, ERP sync, label creation); "shipped" can carry carrier + tracking number. Customer mail: listeners.ts */
export async function setOrderStatus(id: number, status: (typeof ORDER_STATUSES)[number], shipment?: { carrier?: string | null; trackingNumber?: string | null }) {
  const db = await getDb();
  const patch: Partial<typeof schema.orders.$inferInsert> = { status, updatedAt: new Date() };
  if (status === "shipped") patch.shippedAt = new Date();
  if (shipment?.carrier !== undefined) patch.carrier = shipment.carrier || null;
  if (shipment?.trackingNumber !== undefined) patch.trackingNumber = shipment.trackingNumber?.trim() || null;
  await db.update(schema.orders).set(patch).where(eq(schema.orders.id, id));
  await emit("order.status", { orderId: id, status });
}

export async function markPaid(id: number, ref: string) {
  const db = await getDb();
  await db.update(schema.orders).set({ paymentStatus: "paid", paymentRef: ref, updatedAt: sql`now()` }).where(eq(schema.orders.id, id));
  await emit("order.paid", { orderId: id });
}
