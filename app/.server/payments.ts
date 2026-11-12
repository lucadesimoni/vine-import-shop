import { createHmac, timingSafeEqual } from "node:crypto";
import { redirect } from "react-router";
import type { ShopContext } from "./context";
import { getOrder, markPaid } from "./orders";

/**
 * Payment providers. Add one by implementing `PaymentProvider` and listing it in `providers`.
 * Candidates for CH: Payrexx/TWINT, Datatrans, Saferpay, PostFinance Checkout.
 */
export type PaymentProvider = {
  code: string;
  available(ctx: ShopContext): boolean;
  /** Return a redirect Response to an external payment page, or null when nothing else to do. */
  start(ctx: ShopContext, order: { id: number; number: string; token: string; email: string; totalGross: number; currency: string }, origin: string): Promise<Response | null>;
};

const invoice: PaymentProvider = {
  code: "invoice",
  available: (ctx) => ctx.shop.payments.invoice.enabled && (ctx.isTrade || !ctx.shop.payments.invoice.tradeOnly),
  start: async () => null,
};

const prepayment: PaymentProvider = {
  code: "prepayment",
  available: (ctx) => ctx.shop.payments.prepayment.enabled,
  start: async () => null,
};

const stripe: PaymentProvider = {
  code: "stripe",
  available: (ctx) => ctx.shop.payments.stripe.enabled && !!process.env.STRIPE_SECRET_KEY,
  async start(ctx, order, origin) {
    const done = `${origin}/checkout/done/${order.number}?t=${order.token}`;
    const body = new URLSearchParams({
      mode: "payment",
      customer_email: order.email,
      client_reference_id: order.number,
      success_url: `${done}&paid=1`,
      cancel_url: `${origin}/checkout?cancelled=1`,
      "metadata[order_number]": order.number,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": order.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(order.totalGross),
      "line_items[0][price_data][product_data][name]": `${ctx.brand.name} · ${order.number}`,
    });
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await res.json()) as { url?: string; error?: { message: string } };
    if (!res.ok || !json.url) {
      console.error("[stripe]", json.error?.message);
      return redirect(`${done}&payment=failed`);
    }
    return redirect(json.url, 303);
  },
};

export const providers: PaymentProvider[] = [invoice, prepayment, stripe];
export const availablePayments = (ctx: ShopContext) => providers.filter((p) => p.available(ctx)).map((p) => p.code);
export const getProvider = (code: string) => providers.find((p) => p.code === code);

/** Stripe webhook: verify signature (v1, 5 min tolerance) and mark order paid. */
export async function handleStripeWebhook(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const payload = await request.text();
  const header = request.headers.get("Stripe-Signature") ?? "";
  if (!secret) return new Response("not configured", { status: 501 });
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const ts = Number(parts.t);
  if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) return new Response("stale", { status: 400 });
  const expected = createHmac("sha256", secret).update(`${ts}.${payload}`).digest();
  const given = Buffer.from(parts.v1 ?? "", "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response("bad signature", { status: 400 });

  const event = JSON.parse(payload) as { type: string; data: { object: { metadata?: { order_number?: string }; payment_status?: string; payment_intent?: string; id: string } } };
  if (event.type === "checkout.session.completed" && event.data.object.payment_status === "paid") {
    const number = event.data.object.metadata?.order_number;
    const order = number ? await getOrder({ number }) : null;
    if (order && order.paymentStatus !== "paid") await markPaid(order.id, event.data.object.payment_intent ?? event.data.object.id);
  }
  return Response.json({ received: true });
}
