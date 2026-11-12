import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("~/.server/orders", () => ({ getOrder: vi.fn(async () => null), markPaid: vi.fn() }));
const { handleWebhook } = await import("~/.server/payments");

beforeAll(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.DATATRANS_HMAC_KEY = "a1b2c3d4";
});

const post = (body: string, headers: Record<string, string> = {}) => new Request("http://x/api/payments/x", { method: "POST", body, headers });

describe("payment webhooks", () => {
  it("unknown provider → 404", async () => {
    expect((await handleWebhook("nope", post("{}"))).status).toBe(404);
  });

  it("Stripe: rejects bad / stale signatures, accepts a valid one", async () => {
    const body = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_1", payment_status: "paid", metadata: { order_number: "DS-1" } } } });
    expect((await handleWebhook("stripe", post(body, { "Stripe-Signature": `t=${Math.floor(Date.now() / 1000)},v1=00` }))).status).toBe(400);
    expect((await handleWebhook("stripe", post(body, { "Stripe-Signature": "t=1000,v1=00" }))).status).toBe(400);
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", "whsec_test").update(`${t}.${body}`).digest("hex");
    expect((await handleWebhook("stripe", post(body, { "Stripe-Signature": `t=${t},v1=${v1}` }))).status).toBe(200);
  });

  it("Datatrans: HMAC-SHA256 over timestamp + body with hex key", async () => {
    const body = JSON.stringify({ transactionId: "tx1", refno: "DS-1", status: "settled" });
    const t = String(Date.now());
    const s0 = createHmac("sha256", Buffer.from("a1b2c3d4", "hex")).update(t + body).digest("hex");
    expect((await handleWebhook("datatrans", post(body, { "Datatrans-Signature": `t=${t},s0=00` }))).status).toBe(400);
    expect((await handleWebhook("datatrans", post(body, { "Datatrans-Signature": `t=${t},s0=${s0}` }))).status).toBe(200);
  });

  it("Mollie: only well-formed payment ids are looked up", async () => {
    const form = new URLSearchParams({ id: "evil" });
    const r = await handleWebhook("mollie", new Request("http://x", { method: "POST", body: form, headers: { "Content-Type": "application/x-www-form-urlencoded" } }));
    expect(r.status).toBe(400);
  });
});
