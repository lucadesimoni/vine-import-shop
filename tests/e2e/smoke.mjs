// End-to-end smoke test against a running server (default http://localhost:3000):
//   npm run build && npm start &   then   npm run e2e
// Covers: storefront pages, B2B login, quick order, checkout (request/order), admin pages.
import { chromium } from "playwright";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const ok = (cond, msg) => { if (!cond) { console.error("✗", msg); process.exitCode = 1; } else console.log("✓", msg); };

for (const path of ["/", "/shop", "/producers", "/trade", "/story", "/contact", "/order-list", "/login"]) {
  const res = await page.goto(B + path);
  ok(res?.status() === 200, `GET ${path}`);
}
await page.goto(B + "/shop");
ok(await page.getByText(/Preis auf Anfrage|Price on request/).first().isVisible(), "guests see 'price on request'");

await page.goto(B + "/login");
await page.fill("input[name=email]", "gastro@demo.ch");
await page.fill("input[name=password]", "gastro-demo-1234");
await Promise.all([page.waitForURL(/account/), page.click("form button[type=submit]")]);
ok(true, "B2B login");

await page.goto(B + "/account/quick-order");
await page.fill("textarea[name=paste]", "10679\t24\n10658;12\n7739 60");
await Promise.all([page.waitForURL(/order-list/), page.click("form button[type=submit] >> text=/Bestellliste|order list/i")]);
await page.locator("li").filter({ hasText: "10679" }).first().waitFor({ timeout: 10_000 }).catch(() => {});
ok((await page.locator("li").filter({ hasText: "10679" }).count()) > 0, "quick order → order list");

await page.goto(B + "/checkout");
await page.check("input[name=terms]");
if (await page.locator("input[name=age]").count()) await page.check("input[name=age]");
await Promise.all([page.waitForURL(/checkout\/done/), page.click("aside button[type=submit]")]);
ok(true, "checkout completed");

await page.goto(B + "/logout").catch(() => {});
await page.context().clearCookies();
await page.goto(B + "/login");
await page.fill("input[name=email]", process.env.ADMIN_EMAIL ?? "admin@example.com");
await page.fill("input[name=password]", process.env.ADMIN_PASSWORD ?? "admin-demo-1234");
await Promise.all([page.waitForURL(/admin/), page.click("form button[type=submit]")]);
for (const p of ["/admin", "/admin/orders", "/admin/products", "/admin/customers", "/admin/design", "/admin/content", "/admin/settings", "/admin/integrations"]) {
  const res = await page.goto(B + p);
  ok(res?.status() === 200, `GET ${p}`);
}
ok(errors.length === 0, `no browser errors ${errors.length ? JSON.stringify(errors) : ""}`);
await browser.close();
