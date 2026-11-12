// Full-platform end-to-end test against a running production server with fresh demo data.
//   CRON_SECRET=e2e-cron VINX_WEBHOOK_SECRET=e2e-hook STRIPE_WEBHOOK_SECRET=whsec_e2e npm start   (fresh ./data)
//   BASE_URL=http://localhost:3000 node tests/e2e/platform.mjs
import { createHmac } from "node:crypto";
import { chromium } from "playwright";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const CRON = process.env.CRON_SECRET ?? "e2e-cron";
const HOOK = process.env.VINX_WEBHOOK_SECRET ?? "e2e-hook";
let failed = 0, passed = 0;
const ok = (cond, msg, detail = "") => { if (cond) { passed++; console.log("✓", msg); } else { failed++; console.error("✗", msg, detail); } };
const section = (s) => console.log(`\n── ${s}`);
const chf = (s) => Number(String(s).replace(/[^\d.]/g, ""));

const browser = await chromium.launch();
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/caret-color|Failed to load resource/.test(m.text()) && page.errors.push(m.text()));
  return page;
};
const login = async (page, path, email, password, urlRe) => {
  if (path) await page.goto(B + path);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await Promise.all([page.waitForURL(urlRe), page.click("form button[type=submit]")]);
};

// ─────────────────────────────────────────────────────────────────────────
section("Public storefront (B2C, separate channel)");
const guest = await newPage();
for (const p of ["/", "/shop", "/producers", "/producers?view=az", "/trade", "/story", "/contact", "/page/impressum", "/sitemap.xml", "/robots.txt"]) {
  const r = await guest.goto(B + p);
  ok(r?.status() === 200, `GET ${p}`, r?.status());
}
await guest.goto(B + "/shop");
ok(await guest.locator("article").filter({ hasText: "CHF" }).first().isVisible(), "consumer prices are public");
const cardCount = await guest.locator("article").count();
ok(cardCount === 24, "shop paginates 24 per page", cardCount);
await guest.goto(B + "/shop?category=olivenoel");
ok(await guest.getByText("Aktion Olivenöl −10 %").first().isVisible(), "global promotion condition visible to consumers");
await guest.goto(B + "/producers?region=campania");
ok(await guest.locator("h2", { hasText: "Kampanien" }).isVisible(), "origin map: region selection");
ok((await guest.locator('svg[role=group] a[aria-current="true"]').count()) === 1, "origin map: selected region highlighted");
await guest.goto(B + "/producers?kind=spirit");
ok((await guest.locator("svg[role=group] a[aria-label]").count()) >= 1, "origin map: filter by product kind (spirits)");
await guest.goto(B + "/shop?region=campania");
ok(/Kampanien/.test(await guest.locator("h1").innerText()), "shop: region filter from map");
const regionCount = await guest.locator("article").count();
ok(regionCount === 11, "shop: 11 products from Campania", regionCount);
// dark mode toggle persists
await guest.goto(B + "/");
await guest.click('button[aria-label="Hell/Dunkel"] >> nth=0');
const theme1 = await guest.evaluate(() => document.documentElement.dataset.theme);
await guest.reload();
ok((await guest.evaluate(() => document.documentElement.dataset.theme)) === theme1, `dark mode persists across reload (${theme1})`);

section("Consumer checkout");
const consumer = await newPage();
await login(consumer, "/login", "kunde@demo.ch", "kunde-demo-1234", /account/);
await consumer.goto(B + "/product/olio-evo-tenuta-arcamone-dop-bio");
await consumer.click("form[action='/cart'] button[type=submit]");
await consumer.waitForTimeout(600);
await consumer.goto(B + "/order-list");
ok((await consumer.locator("main li").count()) === 1, "consumer: product in order list");
await consumer.fill("input[name=code]", "BENVENUTO10");
await consumer.click("button:has-text('Einlösen')");
await consumer.waitForTimeout(500);
await consumer.goto(B + "/checkout");
await consumer.check("input[name=terms]");
if (await consumer.locator("input[name=age]").count()) await consumer.check("input[name=age]");
await Promise.all([consumer.waitForURL(/checkout\/done/), consumer.click("aside button[type=submit]")]);
ok(true, "consumer: order placed");
ok((await consumer.goto(B + "/portal")).url().includes("/portal") && (await consumer.getByText("Kein Zugang zum B2B-Portal").isVisible()), "consumer: portal denied with explanation");

// ─────────────────────────────────────────────────────────────────────────
section("B2B portal + conditions (Marco · Gastronomie)");
const b2b = await newPage();
await b2b.goto(B + "/portal/catalog");
ok(b2b.url().includes("/portal/login"), "portal requires login");
await login(b2b, null, "gastro@demo.ch", "gastro-demo-1234", /\/portal\/catalog/);
ok(true, "portal login → back to requested page");
await b2b.goto(B + "/account");
ok(b2b.url().includes("/portal/orders"), "separate channels: /account → portal");

const priceOf = async (sku) => {
  await b2b.goto(B + `/portal/catalog?q=${sku}`);
  const row = b2b.locator("tr", { hasText: sku }).first();
  return { price: chf(await row.locator("td").nth(4).innerText()), text: await row.innerText() };
};
// special price (customer · variant, fixed net, netto → no further discounts)
const sassella = await priceOf("10679");
ok(sassella.price === 29.5 && /Spezialpreis/.test(sassella.text), "special price 10679 = CHF 29.50 net", sassella.text);
// customer discount 8 % on discount group SPIRITUOSEN (on top of gastro tier price)
const gin = await priceOf("11112");
ok(/Kundenrabatt 8 %/.test(gin.text), "customer discount 8 % on spirits", gin.text);
// group discount 3 % on wine
const taurasi = await priceOf("10658");
ok(/Gastro-Rabatt Wein 3 %/.test(taurasi.text), "group discount 3 % on wine", taurasi.text);
// promotion on olive oil applies on top (onNetPrices)
const oil = await priceOf("10476");
ok(/Aktion Olivenöl −10 %/.test(oil.text), "promotion −10 % on olive oil for B2B", oil.text);

// order list: quantity discount (Felicetti ≥ 24) + free goods (12 for 11 on red wine)
await b2b.goto(B + "/portal/quick-order");
await b2b.fill("textarea[name=paste]", "7739\t24\n10683;12\n11112 2");
await Promise.all([b2b.waitForURL(/portal\/order-list/), b2b.click("form button[type=submit] >> text=/Bestellliste/")]);
await b2b.locator("main li").first().waitFor();
const lines = await b2b.locator("main li").allInnerTexts();
const line = (sku) => lines.find((l) => l.includes(sku)) ?? "";
ok(/Mengenrabatt ab 24 Stk\. 5 %/.test(line("7739")), "quantity discount from 24 units (Felicetti)", line("7739"));
ok(/12 für 11/.test(line("10683")) && /1 gratis/.test(line("10683")), "free goods 12 for 11 → 1 free", line("10683"));
ok(/Kundenrabatt 8 %/.test(line("11112")), "customer discount in order list", line("11112"));
await b2b.goto(B + "/portal/checkout");
await b2b.check("input[name=terms]");
if (await b2b.locator("input[name=age]").count()) await b2b.check("input[name=age]");
await Promise.all([b2b.waitForURL(/portal\/checkout\/done/), b2b.click("aside button[type=submit]")]);
ok(true, "B2B order placed through the portal");
await b2b.goto(B + "/portal");
const dash = await b2b.locator("main section").first().innerText();
ok(/UMSATZ[\s\S]*?CHF\s[1-9]/i.test(dash), "portal dashboard shows revenue", dash.replace(/\s+/g, " ").slice(0, 200));

// ─────────────────────────────────────────────────────────────────────────
section("Admin");
const admin = await newPage();
await login(admin, "/login", "admin@example.com", "admin-demo-1234", /admin/);
for (const p of ["/admin", "/admin/orders", "/admin/products", "/admin/customers", "/admin/conditions", "/admin/design", "/admin/content", "/admin/settings", "/admin/integrations"]) {
  const r = await admin.goto(B + p);
  ok(r?.status() === 200, `GET ${p}`, r?.status());
}
await admin.goto(B + "/admin/orders");
ok((await admin.locator("tbody tr").count()) >= 2, "admin sees both new orders");
// create a platform condition and see it in the portal
await admin.goto(B + "/admin/conditions");
const before = await admin.locator("tbody tr").count();
await admin.selectOption("select[name=type]", "customer_discount");
await admin.selectOption("select[name=scope]", { label: "Trattoria Demo GmbH" });
await admin.selectOption("select[name=targetType]", "variant");
await admin.fill("input[name='target.variant']", "10074");
await admin.fill("input[name=value]", "15");
await admin.fill("input[name=label]", "E2E Rabatt 15 %");
await admin.click("button:has-text('Kondition anlegen')");
await admin.waitForTimeout(800);
ok((await admin.locator("tbody tr").count()) === before + 1, "admin: condition created");
const pasta = await priceOf("10074");
ok(/E2E Rabatt 15 %/.test(pasta.text), "new condition is live in the portal", pasta.text);

section("Integrations (vinX driver: mock, Shop API v2.0 record shapes)");
await admin.goto(B + "/admin/integrations");
for (const [intent, label] of [["ping", "Verbindung testen"], ["articles", "Artikel"], ["stock", "Lagerbestand"], ["prices", "Preislisten"], ["conditions", "Spezialpreise"], ["outbox", "Bestellungen senden"]]) {
  await Promise.all([
    admin.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/integrations")),
    admin.locator(`form:has(input[name=intent][value=${intent}]) button[type=submit]`).first().click(),
  ]);
  await admin.waitForLoadState("networkidle");
  const notice = admin.locator("[class*=bg-success-soft], [class*=bg-danger-soft]").first();
  await notice.waitFor({ timeout: 15000 });
  const cls = await notice.getAttribute("class");
  const msg = await notice.innerText();
  ok(/success/.test(cls ?? ""), `vinX job: ${label} — ${msg.slice(0, 90)}`, msg);
}
await admin.goto(B + "/admin/conditions?source=vinx");
ok(/Spezialpreis/.test(await admin.locator("tbody").innerText()), "vinX SpecialPrices synced as conditions (source vinx)");
const taurasi2 = await priceOf("10658");
ok(taurasi2.price === 33.5, "synced vinX special price 10658 = CHF 33.50", taurasi2.text);

// APIs
const res = (p, init) => fetch(B + p, init);
ok((await res("/api/health")).ok, "GET /api/health");
const prod = await (await res("/api/v1/products?per_page=5")).json();
ok(prod.data.length === 5 && prod.meta.total === 56 && prod.data[0].variants[0].price, "GET /api/v1/products (consumer prices only)");
ok((await res("/api/cron", { method: "POST" })).status === 401, "cron rejects missing secret");
const cron = await res("/api/cron?jobs=outbox,stock", { method: "POST", headers: { Authorization: `Bearer ${CRON}` } });
ok(cron.ok, "cron runs with secret", cron.status);
const csv = new FormData();
csv.append("stock", new Blob(["ArtikelNr;Bestand\n10679;77\n"], { type: "text/csv" }), "lager.csv");
const imp = await res("/api/vinx/import", { method: "POST", headers: { Authorization: `Bearer ${CRON}` }, body: csv });
ok(imp.ok, "CSV import API (German headers)", imp.status);
const body = JSON.stringify({ event: "stock.updated", items: [{ sku: "10680", stock: 3 }] });
ok((await res("/api/vinx/webhook", { method: "POST", body, headers: { "X-Signature": "00" } })).status === 401, "webhook rejects bad signature");
const hook = await res("/api/vinx/webhook", { method: "POST", body, headers: { "X-Signature": createHmac("sha256", HOOK).update(body).digest("hex") } });
ok(hook.ok, "webhook accepts HMAC-signed stock update", hook.status);
const stripe = await res("/api/payments/stripe", { method: "POST", body: "{}", headers: { "Stripe-Signature": "t=1,v1=00" } });
ok(stripe.status >= 400, "stripe webhook rejects invalid signature", stripe.status);
await guest.goto(B + "/shop?q=10679");
ok(/77|Gut an Lager|An Lager/.test(await guest.locator("article").first().innerText()), "CSV stock import reflected in shop");

// ─────────────────────────────────────────────────────────────────────────
const errs = [guest, consumer, b2b, admin].flatMap((p) => p.errors);
ok(errs.length === 0, "no browser errors", JSON.stringify(errs.slice(0, 3)));
await browser.close();
console.log(`\n${passed} passed · ${failed} failed`);
process.exit(failed ? 1 : 0);
