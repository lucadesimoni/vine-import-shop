# White-label Wine & Food Import Shop — B2B + B2C, vinX-integrated

A modern, fully white-labelled commerce platform for wine and speciality importers: a **B2B-first wholesale shop** (gastronomy and retail) that can also sell to consumers. It integrates with the Swiss wine ERP **vinX** through its official REST3 Shop API.

The repository ships with a **demo profile for De Simoni AG** (Kriens, since 1917). The brand, texts and product sample come from their test site, and all prices are placeholders. No brand is hard-coded: name, logo, colours, fonts, shapes, texts, languages, sales model, shipping and payments are all edited in **Admin**.

```bash
npm install
cp .env.example .env
npm run dev            # http://localhost:5173 — creates an embedded DB + demo data on first start
```

| Demo login | |
|---|---|
| Admin | `admin@example.com` / `admin-demo-1234` |
| Gastro customer (B2B, approved) | `gastro@demo.ch` / `gastro-demo-1234` |
| Private customer | `kunde@demo.ch` / `kunde-demo-1234` |

## Stack — and why

| Layer | Choice | Reason |
|---|---|---|
| Framework | **React Router 8** (framework mode, the Remix lineage) + **React 19** + **Vite 8** | Server-rendered, which shop SEO and first load need. Loaders and actions keep forms working without JavaScript. Stable adapters for Node, Docker, Vercel, Netlify and Cloudflare. Shopify's commerce framework (Hydrogen) is built on it. |
| Language | **TypeScript 7** (strict) | Shared types from the database to the UI. Missing translation keys fail the build. |
| Styling | **Tailwind CSS 4** on a semantic **design-token layer** | Every colour, font, radius and shadow is a CSS variable fed by the brand settings. One component kit serves both storefront and admin. |
| Data | **PostgreSQL** via **Drizzle ORM**, or embedded **PGlite** | One schema everywhere. Production uses any Postgres (managed, serverless or self-hosted). Demo and small installs run an embedded database with zero setup. Migrations apply automatically. |
| Validation | **Zod 4** | Settings, forms, ERP payloads. |
| Auth | Signed cookie sessions + scrypt | No external dependency; roles `customer` / `staff` / `admin`; trade approval workflow. |
| i18n | Typed dictionaries (DE/IT/FR/EN) + localized content in the DB | Languages are switched on per shop in admin. |
| ERP | vinX REST3 client, CSV exchange, mock | See [docs/VINX.md](docs/VINX.md). |

Commands: `npm test` (22 unit tests), `npm run e2e` (end-to-end browser smoke test of shop, B2B and admin), `npm run typecheck`, `npm run build`.

## Features

**Storefront.** Editorial home page (hero, categories, promotions carousel, product spotlight, story, brands, values), catalogue with category tree, producer facets, search (name, producer, region, article number) and sorting, product pages with **variants** (vintage and size, one article number each, as in vinX), stock levels, tier-price tables and schema.org data. Also producers A–Z, story/timeline, contact, editable legal pages, sitemap, robots and hreflang.

**Sales channels (Admin → Einstellungen → Kanäle & Domains):**

| Mode | Storefront | B2B portal (`/portal`) |
|---|---|---|
| `combined` | one shop for everyone; trade customers see their conditions | additional, for approved trade customers |
| `separate` *(demo)* | B2C / direct-sales shop with consumer prices only | trade customers order here, at their own prices |
| `portal-only` | shop pages lead into the portal (pure wholesale) | the only channel |
| `shop-only` | trade customers use account + quick order in the shop | disabled |

- Each channel can have **its own domain** (for example `shop.example.ch` and `b2b.example.ch`), served from the same installation. Requests are redirected to the right domain, and `/` on the portal domain opens the portal. Set `COOKIE_DOMAIN=.example.ch` to share one login across subdomains.
- **The portal** is an app-style workspace with:
  - a dashboard (KPIs, recent orders with reorder, frequently ordered items, the customer's conditions, contact and downloads);
  - a dense **order-grid catalogue**, where quantities for many articles are entered at once;
  - quick order, order list, checkout, order history and the price list.
  - The cart, checkout and order modules are shared with the storefront, so the logic exists only once.

**Customer prices: pluggable price source** (`app/.server/price-sources.ts`, setting `shop.priceSource`):

- `platform` (default): the shop's own price lists per customer group, with quantity tiers and a group-discount fallback. They are maintained in the admin, by CSV/API import, or filled by any ERP sync.
- `vinx`: live prices per customer from vinX (`Calculated/ProductInfo` with the customer's address id), including conditions and promotions, cached for 5 minutes. On timeout or error the shop falls back to the platform lists.
- Another ERP adds itself with `registerPriceSource({ id, label, resolve })`.

**Selling models (per shop):**

- Storefront prices visible to *everyone*, *signed-in customers* or *approved trade customers only*. The portal always shows the customer's own prices.
- When prices are hidden, the shop shows "price on request" and checkout becomes a **quote request**, which is sent to vinX as a basket with `action=quote`.
- Consumer checkout and guest checkout can each be switched on or off.

**B2B.**

- Online application with company and UID number, approved by staff in admin.
- Customer groups with **net prices**, **quantity tiers** (from vinX price lists), a group-discount fallback and a **minimum order value**.
- **Quick order** by article number or pasted straight from Excel, plus a "frequently ordered" list.
- One-click reorder and a **CSV price list** export.
- PO reference, preferred delivery date, own-route delivery and **pay by invoice**.
- For customers linked to a vinX address: **live vinX basket calculation** (customer conditions, promotions, deposits, LSVA truck toll, freight).

**Checkout.**

- Swiss VAT: 8.1 % and 2.6 % on the same order.
- Totals rounded to 5 Rappen, CHF formatting.
- Age confirmation for alcohol, vouchers, rule-based shipping.
- Payment by invoice, bank transfer, or Stripe (cards, Apple/Google Pay, TWINT).
- Branded order emails.

**Admin.**

- Dashboard with KPIs, 30-day revenue, low stock and vinX health.
- Orders with status, payment and ERP transfer state, including retry.
- Products: multilingual texts, images, visibility; fields owned by vinX are locked.
- Customers: trade approval, group, vinX address number.
- **Design & brand**: live preview of colours, fonts, radius, button style, logos, contact and opening hours.
- **Content**: hero, home sections, B2B page, story, legal pages.
- **Settings**: sales model, languages, customer groups, tax, stock display, payments, shipping.
- **vinX**: connection, mapping, jobs, CSV upload, outbox, log.

More: [Architecture](docs/ARCHITECTURE.md) · [vinX integration](docs/VINX.md) · [Deployment](docs/DEPLOY.md) · [White-labelling](docs/WHITELABEL.md)
