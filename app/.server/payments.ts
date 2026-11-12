import { createHmac, timingSafeEqual } from "node:crypto";
import { redirect } from "react-router";
import type { ShopContext } from "./context";
import { getOrder, markPaid } from "./orders";

/**
 * Payment providers (pluggable). Each provider:
 *   available(ctx)  – enabled in Admin › Einstellungen and its secrets present (env only)
 *   start(...)      – redirect to the provider's hosted payment page (PCI scope stays with the provider)
 *   webhook(req)    – verify the notification and mark the order paid → POST /api/payments/<code>
 *
 * Built in: invoice, prepayment, Stripe, Mollie, Datatrans (CH), Payrexx (CH: TWINT, PostFinance, cards).
 * Add another (Saferpay, wallee / PostFinance Checkout …) by implementing `PaymentProvider` and calling `registerProvider()`.
 */
export type PaymentOrder = { id: number; number: string; token: string; email: string; totalGross: number; currency: string };
export type PaymentProvider = {
  code: string;
  available(ctx: ShopContext): boolean;
  start(ctx: ShopContext, order: PaymentOrder, origin: string): Promise<Response | null>;
  webhook?(request: Request): Promise<Response>;
};

const providers = new Map<string, PaymentProvider>();
export const registerProvider = (p: PaymentProvider) => void providers.set(p.code, p);
export const availablePayments = (ctx: ShopContext) => [...providers.values()].filter((p) => p.available(ctx)).map((p) => p.code);
export const getProvider = (code: string) => providers.get(code);

const env = (k: string) => process.env[k] ?? "";
const doneUrl = (origin: string, o: PaymentOrder) => `${origin}/checkout/done/${o.number}?t=${o.token}`;
const amount = (cents: number) => (cents / 100).toFixed(2);
async function paid(number: string | undefined | null, ref: string) {
  const order = number ? await getOrder({ number }) : null;
  if (order && order.paymentStatus !== "paid") await markPaid(order.id, ref);
}
function fail(provider: string, origin: string, o: PaymentOrder, message: unknown) {
  console.error(`[payments:${provider}]`, message);
  return redirect(`${doneUrl(origin, o)}&payment=failed`);
}
const safeEq = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

/* ── Offline ─────────────────────────────────────────────────────────── */

registerProvider({
  code: "invoice",
  available: (ctx) => ctx.shop.payments.invoice.enabled && (ctx.isTrade || !ctx.shop.payments.invoice.tradeOnly),
  start: async () => null,
});

registerProvider({
  code: "prepayment",
  available: (ctx) => ctx.shop.payments.prepayment.enabled,
  start: async () => null,
});

/* ── Stripe (Checkout Session) ───────────────────────────────────────── */

registerProvider({
  code: "stripe",
  available: (ctx) => ctx.shop.payments.stripe.enabled && !!env("STRIPE_SECRET_KEY"),
  async start(ctx, o, origin) {
    const body = new URLSearchParams({
      mode: "payment",
      customer_email: o.email,
      client_reference_id: o.number,
      success_url: `${doneUrl(origin, o)}&paid=1`,
      cancel_url: `${origin}/checkout?cancelled=1`,
      "metadata[order_number]": o.number,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": o.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(o.totalGross),
      "line_items[0][price_data][product_data][name]": `${ctx.brand.name} · ${o.number}`,
    });
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`, "Content-Type": "application/x-www-form-urlencoded" }, body });
    const json = (await res.json()) as { url?: string; error?: { message: string } };
    return res.ok && json.url ? redirect(json.url, 303) : fail("stripe", origin, o, json.error?.message);
  },
  /** Signature v1 over "<t>.<payload>", 5 min tolerance. */
  async webhook(request) {
    const secret = env("STRIPE_WEBHOOK_SECRET");
    const payload = await request.text();
    if (!secret) return new Response("not configured", { status: 501 });
    const parts = Object.fromEntries((request.headers.get("Stripe-Signature") ?? "").split(",").map((kv) => kv.split("=") as [string, string]));
    const ts = Number(parts.t);
    if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) return new Response("stale", { status: 400 });
    if (!safeEq(Buffer.from(parts.v1 ?? "", "hex"), createHmac("sha256", secret).update(`${ts}.${payload}`).digest())) return new Response("bad signature", { status: 400 });
    const event = JSON.parse(payload) as { type: string; data: { object: { metadata?: { order_number?: string }; payment_status?: string; payment_intent?: string; id: string } } };
    if (event.type === "checkout.session.completed" && event.data.object.payment_status === "paid") await paid(event.data.object.metadata?.order_number, event.data.object.payment_intent ?? event.data.object.id);
    return Response.json({ received: true });
  },
});

/* ── Mollie (Payments API v2) ────────────────────────────────────────── */

registerProvider({
  code: "mollie",
  available: (ctx) => ctx.shop.payments.mollie.enabled && !!env("MOLLIE_API_KEY"),
  async start(ctx, o, origin) {
    const res = await fetch("https://api.mollie.com/v2/payments", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("MOLLIE_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: { currency: o.currency, value: amount(o.totalGross) },
        description: `${ctx.brand.name} · ${o.number}`,
        redirectUrl: `${doneUrl(origin, o)}&paid=1`,
        cancelUrl: `${origin}/checkout?cancelled=1`,
        webhookUrl: `${origin}/api/payments/mollie`,
        locale: { de: "de_CH", fr: "fr_CH", it: "it_IT", en: "en_US" }[ctx.locale] ?? "de_CH",
        metadata: { order_number: o.number },
        ...(ctx.shop.payments.mollie.methods.length ? { method: ctx.shop.payments.mollie.methods } : {}),
      }),
    });
    const json = (await res.json()) as { _links?: { checkout?: { href: string } }; detail?: string };
    return res.ok && json._links?.checkout ? redirect(json._links.checkout.href, 303) : fail("mollie", origin, o, json.detail);
  },
  /** Mollie posts only `id`; the status is fetched back from the API (that is the verification). */
  async webhook(request) {
    const id = String((await request.formData()).get("id") ?? "");
    if (!/^tr_\w+$/.test(id) || !env("MOLLIE_API_KEY")) return new Response("bad request", { status: 400 });
    const res = await fetch(`https://api.mollie.com/v2/payments/${id}`, { headers: { Authorization: `Bearer ${env("MOLLIE_API_KEY")}` } });
    if (!res.ok) return new Response("unknown payment", { status: 404 });
    const p = (await res.json()) as { status: string; metadata?: { order_number?: string } };
    if (p.status === "paid") await paid(p.metadata?.order_number, id);
    return new Response("ok");
  },
});

/* ── Datatrans (CH · Redirect / Lightbox API) ────────────────────────── */

const dtHost = () => (env("DATATRANS_ENV") === "production" ? "datatrans.com" : "sandbox.datatrans.com");
registerProvider({
  code: "datatrans",
  available: (ctx) => ctx.shop.payments.datatrans.enabled && !!env("DATATRANS_MERCHANT_ID") && !!env("DATATRANS_PASSWORD"),
  async start(ctx, o, origin) {
    const res = await fetch(`https://api.${dtHost()}/v1/transactions`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${env("DATATRANS_MERCHANT_ID")}:${env("DATATRANS_PASSWORD")}`).toString("base64")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        currency: o.currency, refno: o.number, amount: o.totalGross, language: ctx.locale, autoSettle: true,
        ...(ctx.shop.payments.datatrans.methods.length ? { paymentMethods: ctx.shop.payments.datatrans.methods } : {}),
        redirect: { successUrl: `${doneUrl(origin, o)}&paid=1`, cancelUrl: `${origin}/checkout?cancelled=1`, errorUrl: `${doneUrl(origin, o)}&payment=failed` },
        webhook: { url: `${origin}/api/payments/datatrans` },
      }),
    });
    const json = (await res.json()) as { transactionId?: string; error?: { message: string } };
    return res.ok && json.transactionId ? redirect(`https://pay.${dtHost()}/v1/start/${json.transactionId}`, 303) : fail("datatrans", origin, o, json.error?.message);
  },
  /** Datatrans-Signature: t=<ts>,s0=hex(HMAC-SHA256(hexKey, ts + body)) */
  async webhook(request) {
    const key = env("DATATRANS_HMAC_KEY");
    const body = await request.text();
    if (!key) return new Response("not configured", { status: 501 });
    const sig = Object.fromEntries((request.headers.get("Datatrans-Signature") ?? "").split(",").map((kv) => kv.split("=") as [string, string]));
    if (!sig.t || !safeEq(Buffer.from(sig.s0 ?? "", "hex"), createHmac("sha256", Buffer.from(key, "hex")).update(sig.t + body).digest())) return new Response("bad signature", { status: 400 });
    const t = JSON.parse(body) as { transactionId: string; refno: string; status: string };
    if (t.status === "settled" || t.status === "transmitted" || t.status === "authorized") await paid(t.refno, t.transactionId);
    return new Response("ok");
  },
});

/* ── Payrexx (CH · TWINT, PostFinance, cards) ────────────────────────── */

function payrexxSigned(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const sig = createHmac("sha256", env("PAYREXX_API_SECRET")).update(qs).digest("base64");
  return `${qs}&ApiSignature=${encodeURIComponent(sig)}`;
}
const payrexxUrl = (path: string) => `https://api.payrexx.com/v1.0/${path}/?instance=${encodeURIComponent(env("PAYREXX_INSTANCE"))}`;
registerProvider({
  code: "payrexx",
  available: (ctx) => ctx.shop.payments.payrexx.enabled && !!env("PAYREXX_INSTANCE") && !!env("PAYREXX_API_SECRET"),
  async start(ctx, o, origin) {
    const params: Record<string, string> = {
      amount: String(o.totalGross), currency: o.currency, referenceId: o.number, purpose: `${ctx.brand.name} · ${o.number}`,
      successRedirectUrl: `${doneUrl(origin, o)}&paid=1`, failedRedirectUrl: `${doneUrl(origin, o)}&payment=failed`, cancelRedirectUrl: `${origin}/checkout?cancelled=1`,
      "fields[email][value]": o.email,
    };
    ctx.shop.payments.payrexx.methods.forEach((m, i) => (params[`pm[${i}]`] = m));
    const res = await fetch(payrexxUrl("Gateway"), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: payrexxSigned(params) });
    const json = (await res.json()) as { status: string; data?: { link: string }[]; message?: string };
    return json.status === "success" && json.data?.[0]?.link ? redirect(json.data[0].link, 303) : fail("payrexx", origin, o, json.message);
  },
  /** Webhook payload is not signed → confirm by reading the transaction back from the API. */
  async webhook(request) {
    const body = (await request.json().catch(() => null)) as { transaction?: { id: number } } | null;
    const id = body?.transaction?.id;
    if (!id || !env("PAYREXX_API_SECRET")) return new Response("bad request", { status: 400 });
    const res = await fetch(`${payrexxUrl(`Transaction/${id}`)}&${payrexxSigned({})}`);
    const json = (await res.json()) as { status: string; data?: { status: string; referenceId: string }[] };
    const t = json.data?.[0];
    if (json.status === "success" && t?.status === "confirmed") await paid(t.referenceId, String(id));
    return new Response("ok");
  },
});

/** POST /api/payments/:provider */
export async function handleWebhook(code: string, request: Request) {
  const p = getProvider(code);
  if (!p?.webhook) return new Response("unknown provider", { status: 404 });
  try {
    return await p.webhook(request);
  } catch (e) {
    console.error(`[payments:${code}] webhook`, e);
    return new Response("error", { status: 500 });
  }
}
