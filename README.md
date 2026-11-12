# Wine & Speciality Import Shop — Blueprint

A modular B2C + B2B shop for an importer of wine and Italian food specialities. It connects to the **vinX** wine ERP and is built to run on almost any host:

- **No build step and no Composer**: plain PHP 8.1+, vanilla JS and CSS.
- **Shared hosting works**: Hostpoint, Infomaniak, cyon, Metanet, Plesk and cPanel. Upload the files and open the site; the database installs itself on the first request.
- **Also runs** on a VPS (nginx/Apache), in Docker, or on any container platform.
- **Database**: SQLite with zero configuration, or MySQL/MariaDB (what shared hosts provide). PostgreSQL works too.

```bash
php bin/console serve 8080        # → http://localhost:8080  (auto-installs demo data)
php tests/run.php                 # 31 checks: pricing, VAT, cart, vinX mapping, sync, outbox
```

The demo logins are created on first run:

| Role | Login |
|---|---|
| Admin | `admin@example.com` / password in `storage/ADMIN_PASSWORD.txt` (or set `ADMIN_PASSWORD`) |
| Retail customer | `kunde@example.com` / `kunde-demo` |
| B2B (restaurant) | `b2b@example.com` / `b2b-demo` |

> All producers and products in the demo data are **fictional placeholders**. Real catalog data comes from vinX through the sync.

---

## Features

**Storefront (B2C)**
- Catalog of wines, food specialities and spirits. Filters: style/colour, region, producer, vintage, price, grape, organic, in stock. Full-text search and sorting.
- Product pages with tasting notes, food pairing, producer story, facts table, schema.org JSON-LD, price per 75 cl, and "add a case of 6" in one click.
- Producer pages with their own portraits.
- AJAX mini-cart drawer, quantity steppers, wishlist and voucher codes.
- Checkout with guest or account, separate delivery address, and live shipping totals.
- **Swiss rules built in:** VAT 8.1 % for wine and 2.6 % for food on the same order, totals rounded to 5 Rappen, CHF formatting like `1'234.50`, age gate plus an age confirmation at checkout, and UID validation (CHE-xxx.xxx.xxx).
- Four languages: **DE / FR / IT / EN** (UI strings and catalog content), with hreflang and sitemap.
- Order confirmation emails (log, `mail()` or SMTP driver).
- Self-hosted fonts and no third-party trackers, which helps with Swiss nDSG / GDPR.

**Trade portal (B2B)**
- Online application with company and UID, approved manually in admin. Customer groups: *Fachhandel* (retail trade) and *Gastronomie* (restaurants).
- Net price display, **group price lists and quantity breaks** (from vinX), and a group discount as fallback.
- **Quick order** by SKU with live lookup, or **paste straight from Excel**.
- "Frequently ordered" reorder table, one-click reorder of any past order, and a **CSV price list** export (opens directly in Excel).
- Pay by invoice, PO reference, preferred delivery date, own-fleet delivery method, and a minimum order value per group.

**Payments** (pluggable): invoice, bank transfer in advance, and **Stripe Checkout** (cards, Apple Pay / Google Pay, TWINT), with a signed webhook. Payrexx, Datatrans, PostFinance and others can be added by implementing one interface.

**Admin**: dashboard KPIs and a revenue chart, order management (status, mark as paid, vinX transfer state), product editor (multilingual, with fields owned by vinX marked), customers with B2B approval, vouchers, and a vinX control panel.

**vinX ERP integration**: see [docs/VINX.md](docs/VINX.md)
- Three drivers: `rest` (web API), `file` (CSV/XML exchange folder via SFTP — the most robust option on shared hosting) and `mock` (demo/testing).
- Import of articles (delta or full), stock and price lists. Field mapping is configuration, not code.
- Orders and new customers are pushed through a **persistent outbox with retries and exponential backoff**, so no order is lost while the ERP is offline.
- Inbound signed webhook for real-time stock, article and order-status updates.
- Scheduling by cron (`bin/console vinx:sync`) or web-cron (`/cron.php?key=…`) for hosts without CLI access.

**Headless option**: a read-only JSON API (`/api/v1/products`, `/categories`, `/health`) with CORS, so you can also run a front end on Cloudflare Workers, Vercel and similar.

---

## Architecture (short)

```
public/            index.php (front controller), cron.php, assets (css/js/fonts)
app/Core/          kernel: router, request/response, DB, views, i18n, auth, mailer, events, installer
app/Shop/          domain: Catalog, Pricing, Cart, Shipping, OrderService, Payment/*
app/Modules/       features — each registers routes, services, listeners, admin menu
  Content Catalog Cart Checkout Account B2B Vinx Api Admin
app/views/         plain-PHP templates; override any of them in app/views/theme/
app/lang/          de / fr / it / en
config/            config.example.php → copy to config.php or use .env
database/          schema.sql (portable SQLite/MySQL), seed.php
bin/console        install, vinx:sync, vinx:push, user:admin, serve
tests/run.php      dependency-free test suite
```

To turn a feature off, remove its module from `config['modules']`. To add one, write a class that implements `App\Core\Module`. Modules talk to each other through events (`order.placed`, `customer.registered`, `b2b.approved`, `order.paid`, …). More detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Re-branding

All brand colours, fonts, radii and spacing are CSS variables at the top of `public/assets/css/app.css`. Name, tagline, address and contact details are in config. Texts are in `app/lang/*.php`. To change any template without touching the core, copy it to `app/views/theme/…`.

> The two reference sites (desimoni.ch and the workers.dev test page) could not be reached from the build environment. The current look is a neutral premium wine-shop design; adjust the `:root` tokens and logo to match the brand.

## Deploy

See [docs/DEPLOY.md](docs/DEPLOY.md) for shared hosting (FTP), VPS with nginx, Docker, and notes on Cloudflare.
