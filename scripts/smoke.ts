export {};
// Quick server-layer smoke test against an in-memory PGlite.
process.env.DATABASE_URL = "pglite:memory";
const { getDb, schema } = await import("../app/.server/db");
const { buildShopContext } = await import("../app/.server/context");
const { searchProducts, categoryTree, productDetail, homeCollections } = await import("../app/.server/catalog");
const { cartSummary } = await import("../app/.server/cart");
const { placeOrder } = await import("../app/.server/orders");
const { runScheduled } = await import("../app/.server/vinx/sync");
const { sessionStorage } = await import("../app/.server/auth");
const { eq } = await import("drizzle-orm");

const db = await getDb();
const anon = await buildShopContext(new Request("http://x/"));
console.log("brand:", anon.brand.name, "| showPrices(anon):", anon.showPrices, "| locale:", anon.locale);
const res = await searchProducts(anon, { category: "wein" });
console.log("wines:", res.total, res.items[0]?.name, res.items[0]?.variants[0]);
console.log("tree:", (await categoryTree(anon)).filter((c) => !c.parentId).map((c) => `${c.name}(${c.total})`).join(", "));
const home = await homeCollections(anon);
console.log("promo:", home.promo.length);

const gastro = await db.query.users.findFirst({ where: eq(schema.users.email, "gastro@demo.ch") });
const s = await sessionStorage.getSession(); s.set("userId", gastro!.id);
const cookie = (await sessionStorage.commitSession(s)).split(";")[0];
const trade = await buildShopContext(new Request("http://x/", { headers: { Cookie: cookie } }));
console.log("trade:", trade.isTrade, trade.group, trade.showPrices);
const detail = await productDetail(trade, res.items[0].slug);
console.log("detail price:", detail?.card.variants[0].price);

const vids = res.items.slice(0, 2).map((p) => p.variants[0].id);
const sum = await cartSummary(trade, [{ variantId: vids[0], qty: 12 }, { variantId: vids[1], qty: 3 }], null, "delivery");
console.log("cart:", sum.totals.subtotalNet, sum.totals.totalGross, sum.totals.shippingCode, sum.totals.belowMinimum, sum.lines.map((l) => [l.sku, l.unitDisplay, l.tierApplied]));
const order = await placeOrder(trade, sum, { email: "gastro@demo.ch", billing: gastro!.billing!, shipping: null, paymentMethod: "invoice", poNumber: "PO-1" });
console.log("order:", order.number);
await new Promise((r) => setTimeout(r, 400));
console.log("sync:", JSON.stringify(await runScheduled()));
const o = await db.query.orders.findFirst({ where: eq(schema.orders.id, order.id) });
console.log("erp:", o?.erpStatus, o?.erpId);
const anonSum = await cartSummary(anon, [{ variantId: vids[0], qty: 2 }], null);
console.log("anon request mode:", anonSum.isRequest, anonSum.totals.totalGross);
process.exit(0);
