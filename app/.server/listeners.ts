import { eq } from "drizzle-orm";
import { formatMoney } from "~/lib/money";
import { getT } from "~/lib/i18n";
import { isLocale } from "~/lib/localized";
import { getDb, schema } from "./db";
import { on } from "./events";
import { esc, layout, sendMail } from "./mail";
import { getOrder } from "./orders";
import { getSettings, getScopedSettings } from "./settings";
import { storefrontById } from "./storefronts";
import { customerPayload, enqueue, orderPayload, processOutbox } from "./vinx/sync";

/** Wiring between modules. Imported lazily by events.emit(). */

let flushing = false;
async function flushSoon() {
  // Serverless (Vercel, Netlify, Lambda): work after the response may be frozen → deliver inline, bounded.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY) {
    await Promise.race([processOutbox(undefined, 5).catch(console.error), new Promise((r) => setTimeout(r, 8_000))]);
    return;
  }
  if (flushing) return;
  flushing = true;
  // Deliver to ERP right after the response; the scheduled job retries anything left.
  setTimeout(() => processOutbox(undefined, 10).catch(console.error).finally(() => (flushing = false)), 50);
}

on("order.placed", async ({ orderId }) => {
  const { vinx } = await getSettings("vinx");
  if (vinx.enabled && vinx.pushOrders) {
    const payload = await orderPayload(orderId);
    // vinX Online/Basket knows only calculate | order → quote requests stay in the shop unless configured
    if (payload.order.kind === "request" && vinx.requestsToErp === "skip") return;
    await enqueue("order", orderId, payload);
    await flushSoon();
  }
});

on("order.placed", async ({ orderId }) => {
  const order = await getOrder({ id: orderId });
  if (!order) return;
  const { brand, shop } = await getScopedSettings((await storefrontById(order.storefrontId))?.slug, "brand", "shop");
  const t = getT(isLocale(order.locale) ? order.locale : shop.defaultLocale);
  const money = (c: number) => formatMoney(c, order.currency, order.locale);
  const rows = order.items.map((i) => `<tr><td style="padding:6px 0">${i.qty}×</td><td>${esc(i.name)}<br><small style="color:#888">${esc(i.sku)}</small></td><td align="right">${order.kind === "request" ? "" : money(i.lineGross)}</td></tr>`).join("");
  const totals = order.kind === "request" ? "" : `<p style="text-align:right;font-size:17px"><strong>${t("cart.grandTotal")}: ${money(order.totalGross)}</strong></p>`;
  const bank = order.paymentMethod === "prepayment" && shop.payments.prepayment.iban
    ? `<p style="background:${brand.colors.muted};padding:14px">${esc(shop.payments.prepayment.holder)}<br>IBAN ${esc(shop.payments.prepayment.iban)}<br>${t("done.reference")}: ${esc(order.number)}</p>` : "";
  const title = t("done.title");
  const intro = order.kind === "request" ? t("done.requestText", { number: order.number }) : t("done.orderText", { number: order.number, email: order.email });
  const html = layout(brand, title, `<p>${esc(intro)}</p><table width="100%" style="border-collapse:collapse;font-size:14px">${rows}</table>${totals}${bank}`);
  await sendMail(order.email, `${brand.name} · ${order.number}`, html);
  if (shop.notifyEmail) await sendMail(shop.notifyEmail, `[${order.isTrade ? "B2B" : "B2C"}] ${order.kind} ${order.number}`, html, order.email);
});

async function pushCustomer(userId: number, previousEmail?: string) {
  const { vinx } = await getSettings("vinx");
  if (!vinx.enabled || !vinx.pushCustomers) return;
  const payload = await customerPayload(userId);
  if (payload) {
    if (previousEmail && previousEmail.toLowerCase() !== payload.email.toLowerCase()) payload.previousEmail = previousEmail;
    await enqueue("customer", userId, payload);
    await flushSoon();
  }
}
on("customer.registered", ({ userId }) => pushCustomer(userId));
on("customer.updated", ({ userId, previousEmail }) => pushCustomer(userId, previousEmail));
on("trade.approved", async ({ userId }) => {
  await pushCustomer(userId);
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  const { brand } = await getScopedSettings((await storefrontById(user?.storefrontId))?.slug, "brand");
  if (user) {
    const t = getT(isLocale(user.locale) ? user.locale : "de");
    await sendMail(user.email, `${brand.name} · ${t("account.tradeApproved", { group: "" }).replace(/ · $/, "")}`, layout(brand, t("account.tradeApproved", { group: "" }).replace(/ · $/, ""), `<p>${esc(t("auth.tradeText"))}</p>`));
  }
});
on("trade.applied", async ({ email }) => {
  const { brand, shop } = await getSettings("brand", "shop");
  if (shop.notifyEmail) await sendMail(shop.notifyEmail, `[B2B] ${email}`, layout(brand, "B2B", `<p>${esc(email)}</p>`));
});

/**
 * Status e-mails to the customer (Admin › Einstellungen › Versand: which statuses), once per status and order —
 * whether the status comes from the admin, a bulk action, a Post label or the ERP sync. Shipped mails carry the tracking link.
 */
on("order.status", async ({ orderId, status }) => {
  const order = await getOrder({ id: orderId });
  if (!order || order.kind === "request" || order.notified.includes(status)) return;
  const { brand, shop } = await getScopedSettings((await storefrontById(order.storefrontId))?.slug, "brand", "shop");
  if (!(shop.fulfillment.notify as string[]).includes(status)) return;
  const db = await getDb();
  await db.update(schema.orders).set({ notified: [...order.notified, status] }).where(eq(schema.orders.id, orderId));
  const { trackingUrl, carrierLabel } = await import("./shipping");
  const t = getT(isLocale(order.locale) ? order.locale : shop.defaultLocale);
  const key = status as "confirmed" | "processing" | "shipped" | "completed" | "cancelled";
  const title = t(`mail.status.${key}`, { number: order.number });
  const url = trackingUrl(shop, order.carrier, order.trackingNumber);
  const tracking = status === "shipped" && order.trackingNumber
    ? `<p style="background:${brand.colors.muted};padding:14px">${esc(t("mail.carrier", { carrier: carrierLabel(shop, order.carrier) }))}<br>${esc(t("mail.trackingNumber"))}: <strong>${esc(order.trackingNumber)}</strong></p>${url ? `<p style="margin:24px 0"><a href="${esc(url)}" style="background:${brand.colors.primary};color:${brand.colors.primaryForeground};padding:12px 22px;text-decoration:none;display:inline-block">${esc(t("mail.track"))}</a></p>` : ""}`
    : "";
  const html = layout(brand, title, `<p>${esc(t(`mail.statusText.${key}`, { number: order.number }))}</p>${tracking}`);
  await sendMail(order.email, `${brand.name} · ${title}`, html);
});
