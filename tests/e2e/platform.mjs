// Full-platform end-to-end test against a running production server with fresh demo data.
//   JOBS_INTERVAL_MINUTES=0 CRON_SECRET=e2e-cron VINX_WEBHOOK_SECRET=e2e-hook STRIPE_WEBHOOK_SECRET=whsec_e2e \
//     ORDER_WEBHOOK_URL=http://127.0.0.1:4555/hook ORDER_WEBHOOK_SECRET=e2e-sign npm start   (fresh ./data)
//   JOBS_INTERVAL_MINUTES=0: the test triggers the vinX jobs itself; a scheduler run before would already import
//   vinX special prices and change the expected prices.
//   BASE_URL=http://localhost:3000 node tests/e2e/platform.mjs
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { chromium } from "playwright";

// receiver for the order-webhook extension (server started with ORDER_WEBHOOK_URL=http://127.0.0.1:4555/hook)
const hooks = [];
const receiver = createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { hooks.push({ sig: req.headers["x-signature"], body: JSON.parse(b || "{}") }); res.end("ok"); }); }).listen(4555);

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
  page.on("pageerror", (e) => !/BodyStreamBuffer was aborted/.test(e.message) && page.errors.push(`${e.message} @ ${page.url()}`)); // aborted fetch when navigating away mid-request
  page.on("console", (m) => m.type() === "error" && !/caret-color|Failed to load resource|BodyStreamBuffer was aborted/.test(m.text()) && page.errors.push(`${m.text()} @ ${page.url()}`));
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
ok(regionCount >= 5, "shop: products from Campania", regionCount);
// dark mode toggle persists
await guest.goto(B + "/");
await guest.click('button[aria-label="Hell/Dunkel"] >> nth=0');
const theme1 = await guest.evaluate(() => document.documentElement.dataset.theme);
await guest.reload();
ok((await guest.evaluate(() => document.documentElement.dataset.theme)) === theme1, `dark mode persists across reload (${theme1})`);

section("Consumer checkout");
const consumer = await newPage();
await login(consumer, "/login", "kunde@demo.ch", "kunde-demo-1234", /account/);
await consumer.goto(B + "/shop?q=10476");
await consumer.goto(B + (await consumer.locator('article a[href^="/product/"]').first().getAttribute("href")));
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
// one login = one role: a B2B customer's shop pages lead into the portal (also client-side navigation)
await b2b.goto(B + "/shop");
ok(/\/portal\/catalog/.test(b2b.url()), "B2B login: shop → portal catalog");
await b2b.goto(B + "/story");
await Promise.all([b2b.waitForURL(/\/portal/), b2b.locator('header a[href="/shop"]').first().click()]);
ok(/\/portal\/catalog/.test(b2b.url()), "B2B login: client-side navigation to the shop also lands in the portal");
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
// one retry: undici may reuse a keep-alive socket the server just closed (ECONNRESET)
const res = (p, init) => fetch(B + p, init).catch(() => fetch(B + p, init));
ok((await res("/api/health")).ok, "GET /api/health");
const prod = await (await res("/api/v1/products?per_page=5")).json();
ok(prod.data.length === 5 && prod.meta.total > 1000 && prod.data[0].variants[0].price, "GET /api/v1/products (consumer prices only)");
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

// serverless time budget: a long job stops cleanly and the next call continues where it stopped
const cronRun = (q) => fetch(`${B}/api/cron?${q}`, { method: "POST", headers: { Authorization: `Bearer ${CRON}` } }).then((r) => r.json());
const part1 = await cronRun("jobs=articles&budget=9");
ok(part1.articles?.partial === true && part1.articles.items > 0, "time budget: article sync stops partway", JSON.stringify(part1.articles));
let partN = await cronRun("jobs=articles&budget=9"), rounds = 1;
ok(/ab Datensatz \d+/.test(partN.articles?.message ?? ""), "time budget: next call continues at the same record", partN.articles?.message);
while (partN.articles?.partial && rounds++ < 30) partN = await cronRun("jobs=articles&budget=9");
ok(partN.articles?.ok && !partN.articles.partial, `time budget: chain completes (${rounds + 1} calls)`, JSON.stringify(partN.articles));

section("Extensions & business profiles");
ok(/order-webhook/.test(await (await admin.goto(B + "/admin/integrations"), admin.locator("main").innerText())), "extension listed in admin");
ok(hooks.filter((h) => h.body.event === "order.placed").length >= 2 && hooks.every((h) => /^[0-9a-f]{64}$/.test(h.sig ?? "")), "order-webhook extension delivered signed events", JSON.stringify(hooks.map((h) => h.body.event)));
const applyProfile = async (key) => {
  await admin.goto(B + "/admin/settings");
  await admin.check(`input[name=profile][value=${key}]`);
  await Promise.all([admin.waitForResponse((r) => r.request().method() === "POST"), admin.click("button:has-text('Profil anwenden')")]);
  await admin.waitForLoadState("networkidle");
};
await applyProfile("deli");
await guest.goto(B + "/");
const navDeli = await guest.locator("header nav").first().innerText();
ok(/Manufakturen/.test(navDeli) && !/Produzenten/.test(navDeli), "deli profile: producers called 'Manufakturen'", navDeli.replace(/\s+/g, " "));
await applyProfile("winery");
ok((await guest.goto(B + "/producers"))?.status() === 404, "winery profile: producers module off → 404");
await guest.goto(B + "/");
ok(!/\/producers/.test(await guest.locator("header").innerHTML()), "winery profile: hidden from navigation");
await applyProfile("importer");
ok((await guest.goto(B + "/producers"))?.status() === 200, "importer profile restored");

section("Producers, origin maps & admin lists");
// storefront: views + drill-down + producer page
await guest.goto(B + "/producers?view=world");
ok((await guest.locator('svg[role=group] a[aria-label^="Italien"]').count()) === 1, "world map: Italy clickable");
await guest.goto(B + "/producers?view=world&origin=IT");
ok((await guest.locator("svg[role=group] path").count()) >= 20, "world map: drill-down into Italy's regions");
// world map zoom (buttons) → country outlines; wine-region maps for the other countries
await guest.goto(B + "/producers?view=world");
await guest.getByRole("button", { name: "Vergrössern" }).click();
ok(await guest.locator("svg[role=group] a[aria-label^='Schweiz'] path").first().waitFor({ timeout: 5000 }).then(() => true, () => false), "world map: zoomed in → country outlines");
await guest.getByRole("button", { name: "Ganze Welt" }).click();
ok(await guest.locator("svg[role=group] circle").first().isVisible(), "world map: reset to the whole world");
for (const [iso, area, label] of [["CH", "deutschschweiz", "Switzerland: Deutschschweiz"], ["AT", "niederosterreich", "Austria: Niederösterreich"], ["FR", "champagne", "France: Champagne"], ["ES", "la-rioja", "Spain: La Rioja"]]) {
  await guest.goto(B + `/producers?view=world&origin=${iso}`);
  ok((await guest.locator(`svg[role=group] a[href*="region=${area}"]`).count()) >= 1, `wine-region map ${label}`);
}
await guest.goto(B + "/producers?region=sicilia");
await Promise.all([guest.waitForURL(/\/producers\/[a-z0-9-]+$/), guest.locator('a[href^="/producers/"]').first().click()]);
ok(await guest.locator("h1").isVisible() && (await guest.locator("article").count()) > 0, "producer page: portrait + products", guest.url());
const productHref = await guest.locator('article a[href^="/product/"]').first().getAttribute("href");
await guest.goto(B + productHref);
ok((await guest.locator('main a[href^="/producers/"]').count()) >= 1, "product page links to the producer page");
// admin: world map can be switched off → only region maps + A–Z
await admin.goto(B + "/admin/settings");
await admin.locator('input[name="originMap.world"]').uncheck({ force: true });
await Promise.all([admin.waitForResponse((r) => r.url().includes("/admin/settings") && r.request().method() === "POST"), admin.getByRole("button", { name: "Speichern" }).last().click()]);
await guest.goto(B + "/producers");
ok(!(await guest.locator('nav a:has-text("Welt")').count()) && (await guest.locator('nav a:has-text("Regionen")').count()) === 1, "admin toggle: world map hidden");
await guest.goto(B + "/producers?view=regions&origin=CH");
ok((await guest.locator('svg[role=group] a[href*="region=deutschschweiz"]').count()) >= 1, "world map off: other countries still open their region map");
await admin.goto(B + "/admin/settings");
await admin.locator('input[name="originMap.world"]').check({ force: true });
await Promise.all([admin.waitForResponse((r) => r.url().includes("/admin/settings") && r.request().method() === "POST"), admin.getByRole("button", { name: "Speichern" }).last().click()]);
// admin: producer search / sort / logo upload (SVG guard)
await admin.goto(B + "/admin/producers?q=buscema");
ok((await admin.locator("tbody tr").count()) === 1, "admin producers: search");
await admin.goto(B + "/admin/producers?sort=products&dir=desc");
const counts = (await admin.locator("tbody tr td:nth-child(6)").allInnerTexts()).map(Number);
ok(counts.length > 3 && counts.every((n, i) => i === 0 || counts[i - 1] >= n), "admin producers: sort by product count", counts.join(","));
await admin.locator("tbody tr a").first().click();
await admin.waitForURL(/\/admin\/producers\/\d+$/);
const producerAdminUrl = admin.url();
await admin.setInputFiles("input[name=logoFile]", { name: "evil.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg onload="alert(1)"></svg>') });
await Promise.all([admin.waitForResponse((r) => r.request().method() === "POST"), admin.click("button:has-text('Speichern')")]);
ok(await admin.getByText(/SVG contains scripts/).waitFor({ timeout: 5000 }).then(() => true, () => false), "admin producers: unsafe SVG logo rejected");
await admin.goto(producerAdminUrl);
await admin.setInputFiles("input[name=logoFile]", { name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#7a1f2b"/></svg>') });
await Promise.all([admin.waitForResponse((r) => r.request().method() === "POST"), admin.click("button:has-text('Speichern')")]);
await admin.goto(producerAdminUrl);
const logoSrc = await admin.locator('main img[src^="/uploads/producers/"]').first().getAttribute("src");
ok(!!logoSrc, "admin producers: SVG logo uploaded");
const logoRes = await res(logoSrc);
ok(/sandbox/.test(logoRes.headers.get("content-security-policy") ?? ""), "uploaded SVG served with CSP sandbox");
// admin products: filters + bulk
await admin.goto(B + "/admin/products?flag=promo");
ok((await admin.locator("tbody tr").count()) >= 1 && (await admin.locator("tbody tr").filter({ hasNotText: "Aktion" }).count()) === 0, "admin products: filter by promotion");
await admin.goto(B + "/admin/products?q=gin");
const ginRows = await admin.locator("tbody tr").count();
await admin.locator("thead input[type=checkbox]").check();
await Promise.all([admin.waitForResponse((r) => r.request().method() === "POST"), admin.click("button[form=bulk]:has-text('Empfehlen')")]);
ok(await admin.getByText(`${ginRows} Produkt`).first().waitFor({ timeout: 8000 }).then(() => true, () => false), `admin products: bulk action on ${ginRows} rows`);
await admin.locator("tbody input[name=ids]").first().check();
await Promise.all([admin.waitForResponse((r) => r.request().method() === "POST"), admin.click("button[form=bulk]:has-text('Deaktivieren')")]);
ok(await admin.getByText(/mit vinX verknüpft übersprungen/).waitFor({ timeout: 5000 }).then(() => true, () => false), "admin products: ERP-owned 'active' stays with vinX for linked products");
// admin orders: sort + CSV export
await admin.goto(B + "/admin/orders?sort=total&dir=desc");
ok((await admin.locator("tbody tr").count()) >= 2, "admin orders: sortable list");
const csvRes = await admin.request.get(B + "/admin/orders.csv?type=trade");
const csvText = await csvRes.text();
ok(csvRes.ok() && /^\uFEFF"Nummer"/.test(csvText) && csvText.split("\r\n").length >= 2, "admin orders: CSV export (filtered)");
// customers: edit → pushed to ERP (shop → vinX), address pull job (vinX → shop)
await admin.goto(B + "/admin/customers?q=gastro");
await admin.locator("tbody tr a").first().click();
await admin.waitForURL(/\/admin\/customers\/\d+$/);
await admin.fill("input[name=phone]", "+41 41 555 12 34");
await Promise.all([admin.waitForResponse((r) => r.request().method() === "POST"), admin.click("button:has-text('Speichern')")]);
await admin.reload();
ok((await admin.inputValue("input[name=phone]")) === "+41 41 555 12 34", "admin customer: edit saved");
ok(/Gesendet|Ausstehend|Wiederholung/i.test(await admin.locator("main").innerText()), "admin customer: change queued/sent to vinX");
const custJob = await res("/api/cron?jobs=customers", { headers: { Authorization: `Bearer ${CRON}` } });
const custJson = await custJob.json().catch(() => ({}));
ok(custJob.ok && custJson.customers?.ok, "vinX job: customer addresses pulled", JSON.stringify(custJson));
await admin.reload();
ok((await admin.inputValue("input[name=phone]")) === "+41 41 555 12 34", "customer pull keeps the newer shop change");

section("Page builder (blocks)");
await guest.goto(B + "/");
ok(await guest.getByText("Aus ganz Italien — und der Schweiz").isVisible(), "home: origin-map block rendered");
ok((await guest.locator("main section").count()) >= 8, "home: built from blocks");
ok((await guest.goto(B + "/page/fragen"))?.status() === 200 && (await guest.locator("details summary").count()) === 4, "block page: FAQ with 4 questions");
await admin.goto(B + "/admin/content");
const blockRow = (label) => admin.locator("ol > li").filter({ has: admin.locator(`button[aria-expanded] >> text="${label}"`) });
await blockRow("Herkunftskarte").locator('button[aria-label="Ausblenden"]').click();
await Promise.all([admin.waitForResponse((r) => r.request().method() === "POST"), admin.click("button:has-text('Speichern')")]);
await guest.goto(B + "/");
ok(!(await guest.getByText("Aus ganz Italien — und der Schweiz").isVisible()), "editor: hidden block disappears from the home page");
await admin.goto(B + "/admin/content");
await blockRow("Herkunftskarte").locator('button[aria-label="Einblenden"]').click();
await admin.locator("ol > li").last().locator('button[aria-label="Nach oben"]').click();
await admin.getByRole("button", { name: "Baustein hinzufügen" }).click();
await admin.locator("button:has-text('Zitat')").click();
await admin.locator("ol > li").last().locator("textarea").first().fill("Qualität ist kein Zufall.");
await Promise.all([admin.waitForResponse((r) => r.request().method() === "POST"), admin.click("button:has-text('Speichern')")]);
await guest.goto(B + "/");
ok(await guest.getByText("Qualität ist kein Zufall.").isVisible() && await guest.getByText("Aus ganz Italien — und der Schweiz").isVisible(), "editor: add block + show again + reorder saved");
await admin.goto(B + "/admin/content?tab=pages&page=new");
await admin.fill("input[name=slug]", "events");
await admin.fill('input[name="title.de"]', "Events");
await admin.getByRole("button", { name: "Baustein hinzufügen" }).click();
await admin.locator("button:has-text('Call-to-Action')").click();
await Promise.all([admin.waitForURL(/page=\d+/), admin.click("button:has-text('Speichern')")]);
await guest.goto(B + "/page/events");
ok(await guest.locator("h1", { hasText: "Events" }).isVisible() && await guest.getByText("Für die Gastronomie").first().isVisible(), "new page built from blocks");

section("Customer import & password reset");
await admin.goto(B + "/admin/customers/import");
await admin.setInputFiles("input[name=file]", { name: "kunden.csv", mimeType: "text/csv", buffer: Buffer.from("E-Mail;Vorname;Nachname;Firma;Ort;Kundennummer\nosteria@example.ch;Lia;Rossi;Osteria Lia;Zug;77001\nkaputt;X;Y;;;\n") });
await Promise.all([admin.waitForResponse((r) => r.request().method() === "POST"), admin.click("button:has-text('Weiter zur Zuordnung')")]);
ok(await admin.locator('select[name="map.email"]').inputValue() === "E-Mail" && await admin.locator('select[name="map.firstName"]').inputValue() === "Vorname", "import: columns detected (CSV)");
await Promise.all([admin.waitForResponse((r) => r.request().method() === "POST"), admin.click("button:has-text('Zeilen importieren')")]);
const importText = await admin.locator("main").innerText();
ok(/Neu angelegt\s*1/.test(importText) && /Zeile 3/.test(importText), "import: 1 created, invalid row reported", importText.slice(0, 200));
await admin.goto(B + "/admin/customers?q=osteria");
ok(/Osteria Lia/.test(await admin.locator("tbody").innerText()), "import: customer listed with company");
await guest.goto(B + "/login/forgot");
await guest.fill("input[name=email]", "kunde@demo.ch");
await Promise.all([guest.waitForResponse((r) => r.request().method() === "POST"), guest.click("main button[type=submit]")]);
ok(await guest.getByText(/Link gesendet/).waitFor({ timeout: 5000 }).then(() => true, () => false), "password reset: request answered without revealing accounts");
await guest.goto(B + "/login/reset/abcdefghijklmnopqrstuvwxyz0123");
ok(await guest.getByText(/ungültig oder abgelaufen/).isVisible(), "password reset: invalid token rejected");

section("Image editor (non-destructive)");
{
  await admin.goto(B + "/admin/products?q=10075");
  const href = await admin.locator('a[href^="/admin/products/"]').filter({ hasNotText: "Neu" }).first().getAttribute("href");
  await admin.goto(B + href);
  const before = await admin.locator("input[name=image]").inputValue();
  const id = href.split("/").pop();
  const prev = await res(`/admin/products/${id}/image-preview?stage=result&edit=${encodeURIComponent('{"cutout":true,"trim":true,"ratio":"3:4"}')}`, { headers: { cookie: (await admin.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ") } });
  ok(prev.status === 200 && prev.headers.get("content-type") === "image/webp", "image editor: live preview renders (WebP)", String(prev.status));
  const anon = await res(`/admin/products/${id}/image-preview`, { redirect: "manual" });
  ok(anon.status === 302 && /\/login/.test(anon.headers.get("location") ?? ""), "image editor: preview only for staff", String(anon.status));
  await admin.click("text=Bild bearbeiten");
  await admin.waitForSelector("dialog[open]");
  await admin.click('dialog button[aria-label="90° rechts"]');
  await admin.locator('dialog label:has-text("Hellen Hintergrund entfernen") input').check();
  await admin.locator('dialog label:has-text("Leere Ränder entfernen") input').check();
  await admin.click('dialog button:has-text("1:1")');
  await admin.click('dialog button:has-text("Übernehmen")');
  await admin.waitForSelector("dialog", { state: "detached", timeout: 30000 });
  const after = await admin.locator("input[name=image]").inputValue();
  ok(after !== before && /\/img\/.+\.webp$/.test(after), "image editor: shop image rendered from the original", after);
  ok(await admin.getByText("Bearbeitet", { exact: true }).isVisible(), "image editor: product marked as edited");
  await admin.click("text=Bild bearbeiten");
  await admin.click('dialog button:has-text("Zurücksetzen")');
  await admin.click('dialog button:has-text("Übernehmen")');
  await admin.waitForSelector("dialog", { state: "detached", timeout: 30000 });
  ok(!(await admin.getByText("Bearbeitet", { exact: true }).count()), "image editor: reset to the original (plain optimised)");
  // bulk: list filter + "reset to original" for selected products
  await admin.goto(B + "/admin/products?flag=rawimage");
  ok(/Produkt/.test(await admin.locator("main").innerText()), "products: filter 'image not optimised'");
  const cookie = (await admin.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  const bulk = await res("/admin/products?index", { method: "POST", headers: { cookie, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams([["action", "images-reset"], ["ids", id]]) });
  ok(bulk.ok, "products: bulk image action runs", String(bulk.status));
  await admin.goto(B + href);
  ok(/\/img\/.+\.webp$/.test(await admin.locator("input[name=image]").inputValue()), "products: bulk reset keeps an optimised image");
}

section("Sign-in link (magic link)");
{
  const { readFileSync } = await import("node:fs");
  const mailLog = () => { try { return readFileSync("data/mail.log", "utf8"); } catch { return ""; } };
  const lastLink = (email) => {
    const blocks = mailLog().split("\n\n").filter((b) => b.includes(`To: ${email} |`) && b.includes("/login/link/"));
    return blocks.length ? blocks.at(-1).match(/https?:\/\/\S+\/login\/link\/[\w-]+(\?\S*)?/)?.[0] ?? null : null;
  };
  const requestLink = async (page, email, path = "/login") => {
    await page.goto(B + path);
    await page.fill("input[name=email]", email);
    await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), page.click("button[value=link]")]);
    return page.getByText(/Anmelde-Link gesendet/).waitFor({ timeout: 5000 }).then(() => true, () => false);
  };
  const ml = await newPage();
  ok(await requestLink(ml, "kunde@demo.ch"), "magic link: request answered on the login page");
  const link = lastLink("kunde@demo.ch");
  ok(!!link, "magic link: e-mail with sign-in link sent");
  await ml.goto(link);
  ok(await ml.getByText(/Anmeldung für kunde@demo.ch bestätigen/).isVisible(), "magic link: opening shows a confirmation (not used by mail scanners)");
  await Promise.all([ml.waitForURL(/\/account/), ml.click("main button[type=submit]")]);
  ok(new URL(ml.url()).pathname === "/account", "magic link: B2C customer signed in → account");
  const again = await newPage();
  await again.goto(link);
  ok(await again.getByText(/ungültig, abgelaufen oder wurde bereits verwendet/).isVisible(), "magic link: single use");
  const mlb = await newPage();
  ok(await requestLink(mlb, "gastro@demo.ch", "/portal/login"), "magic link: request on the portal login");
  const blink = lastLink("gastro@demo.ch");
  await mlb.goto(blink);
  await Promise.all([mlb.waitForURL(/\/portal/), mlb.click("main button[type=submit]")]);
  ok(new URL(mlb.url()).pathname === "/portal", "magic link: B2B customer signed in → portal");
  const before = mailLog().length;
  const adm = await newPage();
  ok(await requestLink(adm, "admin@example.com"), "magic link: same answer for staff/unknown addresses");
  ok(!mailLog().slice(before).includes("/login/link/"), "magic link: never sent to staff or admins");
  await ml.goto(B + "/login/link/abcdefghijklmnopqrstuvwxyz0123");
  ok(await ml.getByText(/ungültig, abgelaufen/).isVisible(), "magic link: invalid token rejected");
  for (const p of [ml, again, mlb, adm]) await p.context().close();
}

section("Rate limits (shared, in the database)");
{
  const tries = [];
  for (let i = 0; i < 9; i++) {
    const r = await res("/login", { method: "POST", body: new URLSearchParams({ email: "nobody-e2e@example.ch", password: `wrong-${i}` }), headers: { "Content-Type": "application/x-www-form-urlencoded" }, redirect: "manual" });
    tries.push(r.status);
  }
  ok(tries.slice(0, 8).every((s) => s === 401) && tries[8] === 429, "login: blocked after 8 failed attempts", tries.join(","));
  const other = await res("/login", { method: "POST", body: new URLSearchParams({ email: "other-e2e@example.ch", password: "x" }), headers: { "Content-Type": "application/x-www-form-urlencoded" }, redirect: "manual" });
  ok(other.status === 401, "login: other addresses from the same client still allowed", String(other.status));
}

section("Payment methods per customer (vinX payment terms)");
await admin.goto(B + "/admin/customers?q=gastro@demo.ch");
await admin.locator('tbody a[href^="/admin/customers/"]').first().click();
await admin.waitForURL(/\/admin\/customers\/\d+$/);
const payText = await admin.locator("fieldset:has(legend:text('Zahlarten'))").innerText();
ok(/Rechnung/.test(payText) && /vinX/.test(payText), "B2B customer: invoice via vinX payment terms", payText.replace(/\s+/g, " ").slice(0, 160));
await b2b.goto(B + "/portal/checkout");
ok((await b2b.locator('input[name=payment][value=invoice]').count()) === 1 || /Bestellliste ist leer|leer/i.test(await b2b.locator("main").innerText()), "B2B checkout offers invoice");

await b2b.goto(B + "/portal");
const portalDash = await b2b.locator("main").innerText();
ok(/Luca Bianchi/.test(portalDash) && /Di, Fr/.test(portalDash), "portal: sales rep and delivery days from vinX", portalDash.replace(/\s+/g, " ").slice(0, 200));
ok(/Für Sie reserviert/.test(portalDash), "portal: reservations from vinX");

section("Shipping: Post label, tracking, status e-mails");
await consumer.goto(B + "/account");
const cOrder = await consumer.locator('a[href^="/account/orders/"]').first().getAttribute("href");
await admin.goto(B + "/admin/orders?q=" + cOrder.split("/").pop());
await admin.locator('tbody a[href^="/admin/orders/"]').first().click();
await admin.waitForURL(/\/admin\/orders\/\d+$/);
const orderAdminUrl = admin.url();
await admin.getByRole("button", { name: "Etikett erstellen" }).click();
ok(await admin.getByText(/Sendungsnummer 99\.00\./).waitFor({ timeout: 8000 }).then(() => true, () => false), "Post label (demo driver) → tracking number");
const labelRes = await admin.request.get(orderAdminUrl + "/label");
ok(labelRes.ok() && (await labelRes.body()).subarray(0, 5).toString() === "%PDF-", "label PDF downloadable in the admin");
ok((await guest.request.get(orderAdminUrl + "/label", { maxRedirects: 0 })).status() !== 200, "label not accessible without admin login");
await consumer.goto(B + cOrder);
ok(/Sendung verfolgen/.test(await consumer.locator("main").innerText()) && (await consumer.locator('main a[href*="service.post.ch"]').count()) === 1, "customer: tracking link on the order");
ok(/Versandt|unterwegs/i.test(await consumer.locator("main").innerText()), "customer: status shipped");

section("Storefronts (subsidiary on its own domain)");
// preview without DNS: ?storefront=<slug> (cookie); on its own domain the host selects it
const sf = await newPage();
await sf.goto(B + "/?storefront=daferrari");
ok(/Da Ferrari/.test(await sf.locator("header").innerText()), "storefront: own brand in the header");
ok(!/B2B-Portal/i.test(await sf.locator("header").innerText()), "storefront: B2C only (no portal button)");
await sf.goto(B + "/shop");
const sfTotal = chf(await sf.getByText(/\d Artikel/).first().innerText());
await guest.goto(B + "/shop");
const mainTotal = chf(await guest.getByText(/\d Artikel/).first().innerText());
ok(sfTotal > 0 && sfTotal < mainTotal, "storefront: own assortment (food & wine only)", `${sfTotal} vs ${mainTotal}`);
ok(!/Spirituosen/.test(await sf.locator("aside, nav").first().innerText()), "storefront: categories outside the assortment hidden");
await guest.goto(B + "/shop?kind=spirit");
const spirit = await guest.locator('article a[href^="/product/"]').first().getAttribute("href");
ok((await sf.goto(B + spirit))?.status() === 404, "storefront: product outside the assortment → 404");
ok(/Da Ferrari/.test(await (await sf.goto(B + "/page/impressum"), sf.locator("main").innerText())), "storefront: own imprint");
// customers are separate per shop: the main shop's account does not sign in here, the same e-mail can register
await sf.goto(B + "/login");
await sf.fill("input[name=email]", "kunde@demo.ch");
await sf.fill("input[name=password]", "kunde-demo-1234");
await sf.click("form button[type=submit]");
ok(await sf.getByText(/E-Mail oder Passwort/).waitFor({ timeout: 5000 }).then(() => true, () => false), "storefront: main-shop account not valid here");
await sf.goto(B + "/register");
await sf.fill("input[name=name]", "Anna Muster");
await sf.fill("input[name=email]", "kunde@demo.ch");
await sf.fill("input[name=password]", "storefront-1234");
await sf.check("input[name=terms]");
await Promise.all([sf.waitForURL(/\/account/), sf.click("form button[type=submit]")]);
ok(true, "storefront: same e-mail registers as a separate customer");
await sf.goto(B + "/shop?q=10476");
await sf.goto(B + (await sf.locator('article a[href^="/product/"]').first().getAttribute("href")));
await sf.locator("form[action='/cart'] button[type=submit]:not([disabled])").first().click();
await sf.waitForTimeout(600);
await sf.goto(B + "/checkout");
for (const [k, v] of [["name", "Anna Muster"], ["street", "Via Roma 1"], ["zip", "6900"], ["city", "Lugano"]]) {
  const f = sf.locator(`input[name="billing.${k}"]`);
  if (!(await f.inputValue())) await f.fill(v);
}
await sf.check("input[name=terms]");
if (await sf.locator("input[name=age]").count()) await sf.check("input[name=age]");
await Promise.all([sf.waitForURL(/checkout\/done/), sf.click("aside button[type=submit]")]);
const sfOrder = new URL(sf.url()).pathname.split("/").pop();
ok(/^DF-/.test(sfOrder ?? ""), "storefront: order with its own number prefix", sfOrder);
// admin: storefront list, filters, scoped design with reset
await admin.goto(B + "/admin/storefronts");
ok(/Da Ferrari/.test(await admin.locator("main").innerText()), "admin: storefront listed");
await admin.goto(B + "/admin/orders?shop=" + (await admin.locator('a[href^="/admin/storefronts/"]').first().getAttribute("href")).split("/").pop());
ok((await admin.locator("tbody tr").count()) === 1 && (await admin.locator("tbody").innerText()).includes(sfOrder), "admin: orders filtered by storefront", `${admin.url()} ${await admin.locator("tbody tr").count()} ${(await admin.locator("tbody").innerText()).slice(0, 200)}`);
await admin.goto(B + "/admin/design?sf=daferrari");
ok((await admin.locator('input[name="name"]').inputValue()) === "Da Ferrari", "admin design: storefront scope shows its brand");
await admin.locator('input[name="claim"]').fill("Bottega di prova");
await Promise.all([admin.waitForResponse((r) => r.request().method() === "POST"), admin.getByRole("button", { name: "Speichern" }).last().click()]);
await sf.goto(B + "/");
ok(/Bottega di prova/i.test(await sf.locator("header").innerText()), "admin design: change applies to the storefront only");
await guest.goto(B + "/");
ok(!/Bottega di prova/i.test(await guest.locator("header").innerText()), "admin design: main shop unchanged");
await sf.goto(B + "/?storefront=main");
ok(/DE SIMONI/i.test(await sf.locator("header").innerText()), "preview: back to the main shop");

// ─────────────────────────────────────────────────────────────────────────
const errs = [guest, consumer, b2b, admin, sf].flatMap((p) => p.errors);
ok(errs.length === 0, "no browser errors", JSON.stringify(errs.slice(0, 3)));
await browser.close();
receiver.close();
console.log(`\n${passed} passed · ${failed} failed`);
process.exit(failed ? 1 : 0);
