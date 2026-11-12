import { createHmac } from "node:crypto";
import { defineExtension } from "~/.server/extensions";
import { getOrder } from "~/.server/orders";

/**
 * Example extension: forwards order events to any HTTP endpoint (Zapier, Make, n8n, Bexio/Abacus middleware …).
 *   ORDER_WEBHOOK_URL=https://hooks.example.com/…   ORDER_WEBHOOK_SECRET=…  (X-Signature: hex HMAC-SHA256 of the body)
 * Inactive when ORDER_WEBHOOK_URL is not set. Template for writing your own extension.
 */
export default defineExtension({
  id: "order-webhook",
  name: "Bestell-Webhook (Zapier/Make/n8n)",
  version: "1.0.0",
  setup(api) {
    const url = process.env.ORDER_WEBHOOK_URL;
    if (!url) return;
    const send = async (event: string, orderId: number) => {
      const order = await getOrder({ id: orderId });
      if (!order) return;
      const body = JSON.stringify({ event, at: new Date().toISOString(), order });
      const sig = process.env.ORDER_WEBHOOK_SECRET ? createHmac("sha256", process.env.ORDER_WEBHOOK_SECRET).update(body).digest("hex") : undefined;
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(sig ? { "X-Signature": sig } : {}) }, body, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    };
    api.on("order.placed", ({ orderId }) => send("order.placed", orderId));
    api.on("order.paid", ({ orderId }) => send("order.paid", orderId));
    api.on("order.status", ({ orderId }) => send("order.status", orderId));
  },
});
