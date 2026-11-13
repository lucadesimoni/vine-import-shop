import { eq } from "drizzle-orm";
import type { Shop } from "~/lib/settings";
import { getDb, schema } from "./db";
import { setOrderStatus } from "./orders";
import { getScopedSettings } from "./settings";
import { storefrontById } from "./storefronts";

/**
 * Shipping: tracking links per carrier (Admin › Einstellungen › Versand & Benachrichtigungen) and
 * Swiss Post labels through the Digital Commerce API "Barcode" (POST /barcode/v1/generateAddressLabel):
 * the label PDF carries the Post tracking number (identCode), which is stored on the order and sent to the customer.
 *
 *   POST_CLIENT_ID / POST_CLIENT_SECRET  OAuth2 client credentials (scope DCAPI_BARCODE_READ), from the Post developer portal
 *   franking licence, sender address, services (PRI = A-Post, ECO = B-Post), label size: admin settings
 *
 * Without credentials the demo driver produces a specimen label with a test number, so the flow can be tried end to end.
 */
const POST_API = process.env.POST_API_URL ?? "https://dcapi.apis.post.ch/barcode/v1";
const POST_TOKEN_URL = process.env.POST_TOKEN_URL ?? "https://api.post.ch/OAuth/token";

export function trackingUrl(shop: Pick<Shop, "fulfillment">, carrier: string | null | undefined, code: string | null | undefined) {
  if (!carrier || !code) return null;
  const c = shop.fulfillment.carriers.find((x) => x.code === carrier);
  return c?.trackingUrl ? c.trackingUrl.replace("{code}", encodeURIComponent(code)) : null;
}
export const carrierLabel = (shop: Pick<Shop, "fulfillment">, carrier: string | null | undefined) => shop.fulfillment.carriers.find((x) => x.code === carrier)?.label ?? carrier ?? "";

export const postConfigured = () => !!process.env.POST_CLIENT_ID && !!process.env.POST_CLIENT_SECRET;

let token: { value: string; until: number } | null = null;
async function postToken() {
  if (token && token.until > Date.now() + 30_000) return token.value;
  const res = await fetch(POST_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.POST_CLIENT_ID!, client_secret: process.env.POST_CLIENT_SECRET!, scope: "DCAPI_BARCODE_READ" }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Post-Login fehlgeschlagen (${res.status})`);
  const j = (await res.json()) as { access_token: string; expires_in?: number };
  token = { value: j.access_token, until: Date.now() + (j.expires_in ?? 600) * 1000 };
  return token.value;
}

type Address = { company?: string; name: string; street: string; zip: string; city: string; country: string };

/** Request body for generateAddressLabel (field names as in the Swiss Post Barcode API). */
export function postLabelRequest(cfg: Shop["fulfillment"]["post"], order: { number: string; locale: string }, to: Address, weightG: number) {
  const lang = (["de", "fr", "it", "en"].includes(order.locale) ? order.locale : "de").toUpperCase();
  const [name1, name2] = to.company ? [to.company, to.name] : [to.name, undefined];
  return {
    language: lang,
    frankingLicense: cfg.frankingLicense,
    ppFranking: false,
    customer: { name1: cfg.sender.name1, ...(cfg.sender.name2 ? { name2: cfg.sender.name2 } : {}), street: cfg.sender.street, zip: cfg.sender.zip, city: cfg.sender.city, country: "CH" },
    customerSystem: "vine-import-shop",
    labelDefinition: { labelLayout: cfg.labelLayout, printAddresses: "RECIPIENT_AND_CUSTOMER", imageFileType: "PDF", imageResolution: 300, printPreview: false },
    sendingID: order.number,
    item: {
      itemID: order.number,
      recipient: { name1: name1.slice(0, 35), ...(name2 ? { name2: name2.slice(0, 35) } : {}), street: to.street.slice(0, 35), zip: to.zip, city: to.city.slice(0, 35), country: (to.country || "CH").toUpperCase() },
      attributes: { przl: cfg.services.length ? cfg.services : ["PRI"], weight: weightG },
    },
  };
}

/** Create a Swiss Post label for an order → tracking number + PDF stored on the order, status "shipped" (mail to the customer). */
export async function createPostLabel(orderId: number, weightG?: number) {
  const db = await getDb();
  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
  if (!order) throw new Error("Bestellung nicht gefunden");
  const { shop } = await getScopedSettings((await storefrontById(order.storefrontId))?.slug, "shop");
  const cfg = shop.fulfillment.post;
  const to = (order.shipping ?? order.billing) as Address;
  if ((to.country || "CH").toUpperCase() !== "CH" && (to.country || "CH").toUpperCase() !== "LI") throw new Error("Post-Etiketten nur für Inlandsendungen (CH/LI)");
  // weight: entered in the admin, else from the articles (vinX Article.weight), else the default
  const items = await db.select({ qty: schema.orderItems.qty, w: schema.variants.weightG }).from(schema.orderItems).leftJoin(schema.variants, eq(schema.variants.id, schema.orderItems.variantId)).where(eq(schema.orderItems.orderId, orderId));
  const fromArticles = items.length && items.every((i) => i.w) ? items.reduce((a, i) => a + i.qty * i.w!, 0) : null;
  const weight = weightG ?? fromArticles ?? cfg.defaultWeight;
  let identCode: string, pdf: string;
  if (postConfigured()) {
    if (!cfg.frankingLicense || !cfg.sender.name1 || !cfg.sender.zip) throw new Error("Frankierlizenz und Absender in den Einstellungen erfassen");
    const res = await fetch(`${POST_API}/generateAddressLabel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await postToken()}` },
      body: JSON.stringify(postLabelRequest(cfg, order, to, weight)),
      signal: AbortSignal.timeout(20000),
    });
    const j = (await res.json().catch(() => ({}))) as { item?: { identCode?: string; label?: string[]; errors?: { message?: string }[] | { message?: string } } };
    const errors = j.item?.errors ? (Array.isArray(j.item.errors) ? j.item.errors : [j.item.errors]) : [];
    if (!res.ok || !j.item?.identCode || !j.item.label?.length) throw new Error(`Post: ${errors.map((e) => e.message).filter(Boolean).join("; ") || `HTTP ${res.status}`}`);
    identCode = j.item.identCode;
    pdf = j.item.label[0];
  } else {
    // demo driver: specimen label with a test number (clearly marked)
    const { minimalPdf } = await import("./vinx/mock");
    identCode = `99.00.${String(100000 + (order.id % 900000)).padStart(6, "0")}.${String(order.id).padStart(8, "0")}`;
    const bytes = minimalPdf(["SPECIMEN - Demo-Etikett (keine echte Sendung)", `${cfg.services.join("+") || "PRI"} · ${weight} g`, identCode, "", to.company ?? "", to.name, to.street, `${to.zip} ${to.city}`, "", `Absender: ${cfg.sender.name1 || "Shop"}`]);
    pdf = Buffer.from(bytes).toString("base64");
  }
  await db.update(schema.orders).set({ carrier: "post", trackingNumber: identCode, shippingLabel: pdf, updatedAt: new Date() }).where(eq(schema.orders.id, orderId));
  await setOrderStatus(orderId, "shipped");
  return { identCode, demo: !postConfigured() };
}
