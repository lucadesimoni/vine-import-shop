# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/):

- **MAJOR**: breaking changes for operators or extensions (removed settings, changed extension API, data migrations that need manual steps).
- **MINOR**: new features and new settings. Backwards compatible; database migrations run automatically, with a backup taken first.
- **PATCH**: bug fixes, security fixes and visual polish only.

Every release is published on GitHub with a ready-to-run archive (`shop-<version>.tar.gz`) and a Docker image (`ghcr.io/<org>/<repo>:<version>`).
See [docs/UPDATING.md](docs/UPDATING.md) for how to update and roll back.

## [Unreleased]

### Security
- **Critical: admin actions without a login.** The staff check was only in the admin layout's loader. In React Router an action runs before the loaders, so an anonymous POST to an admin page could change data (product, customer, order, settings, design …) and was redirected to the login only afterwards. The check now runs as middleware on every request under `/admin` (loaders, actions, resource routes) before anything else: anonymous requests go to the login, customers get 403. A regression test in the end-to-end suite covers it. **Please update all installations.**

### Added
- Admin activity log (backend): after each successful admin action, the middleware records who did what and to which record (product name, order number, customer). Form values are never stored. Table `audit_log`, migration `0011`, kept 365 days.

## [1.18.0] - 2026-11-14

### Changed
- **Sitemap:** now includes the producer pages (those with visible products; 124 in the demo), `lastmod` for products and pages, and an `x-default` language variant. `robots.txt` also excludes `/portal` and `/api/`.
- **Language variants:** the canonical URL keeps `?lang=xx`. Before, the Italian page pointed to the German one and was treated as a duplicate.
- **Health check** (`/api/health`): the database must answer within 5 s, otherwise the endpoint returns 503 with the reason, so monitors (`shopctl`, uptime services) see the outage. It recovers by itself when the database is back. `Cache-Control: no-store`.
- **E-mails** carry a plain-text part next to the HTML (better delivery, readable in text-only clients).
- PostgreSQL notices from idempotent migrations ("already exists, skipping") are no longer logged.

## [1.17.0] - 2026-11-14

### Added
- Admin › Produkte: filters "Bild nicht optimiert" and "Bild von Hand bearbeitet"; bulk actions "Bildstandard anwenden" and "Bild auf Original zurücksetzen" for the selected products, within the time budget.

### Fixed
- World map: zooming out from a deep zoom could jump backwards for one frame and briefly set a negative view box (browser console error). The `requestAnimationFrame` timestamp can be earlier than the animation start; progress is now clamped.

## [1.16.0] - 2026-11-14

### Changed
- **Better product search** (shop, portal catalogue, quick order):
  - Every word must appear somewhere (name in all languages, producer, grape, region, appellation, country, article number), in any order. "grigio pinot" and "nebbiolo langhe" now find results.
  - Accents and apostrophes are folded: "rose" = "Rosé"; "santagata" and "sant agata" find Sant'Agata (before: 0 hits).
  - With no exact hit, one typo per word of 5+ letters is tolerated: "proseco", "nebiolo", "barbaresko".
  - Hits in the product name come first.

### Security
- Security headers are also sent on Vercel (`vercel.json`; `server.js` does not run there): `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` and a CSP with `frame-ancestors`, `base-uri` and `object-src`.

## [1.15.0] - 2026-11-14

### Security
- **Rate limits in the database** (table `rate_limits`, migration `0010`) instead of per-instance memory. They now hold on Vercel and with several containers, and keys are stored as SHA-256 hashes, so no IPs or e-mail addresses are kept.
  - Sign-in: 8 failures per client and address, 40 per client (password spraying), 30 per address (attack from many clients).
  - Sign-in link and password reset: 8 per client and 5 per address per hour, against mail flooding.
  - Registration, contact form and B2B application are limited per client and hour.
- **Client IP cannot be forged:** on Vercel it comes from `x-vercel-forwarded-for`; behind Caddy/nginx the last `X-Forwarded-For` entry (the one the proxy adds) is used. Before, the whole header counted and a client could change it freely.

### Changed
- **Fewer database round trips** (matters with a remote database such as Vercel ↔ Supabase). Product cards load products, variants and conditions in parallel, and producers, categories, tier prices and customer prices in parallel. The product page loads the product and both recommendation rows in one card query. Measured with 10 ms latency per query: product page 18 → 10 queries, 264 → 97 ms; home page 254 → 144 ms.
- `DB_TRACE=1` logs every SQL statement, to count round trips per page.

## [1.14.0] - 2026-11-14

### Added
- **Responsive content images** (`/media/img?src=…&w=…`): hero, category tiles, image blocks, story/B2B images and not yet optimised product photos.
  - They come as WebP in the right width per screen (`srcset`).
  - Rendered images are kept in a small in-memory cache, and CDNs may cache them for a year.
  - Only own images are resized: local paths and the configured S3/Supabase origin, so the endpoint is not an open image proxy.
  - On the demo home page (mobile), images drop from 4.3 MB to about 0.9 MB.
- **Search engines and link previews:**
  - Products carry complete schema.org data: one offer per format with the shop currency and availability, brand, category, GTIN from the ERP EAN, and breadcrumbs. Shops that hide prices from guests publish no prices.
  - The home page carries Organization (address, contact, social profiles) and a site search box.
  - Canonical URLs: products always point to the shop URL, also from the portal; the shop has one indexable URL per category; search results and further pages are `noindex, follow`.
  - Open Graph and Twitter tags on products, producers, shop and home.

## [1.13.0] - 2026-11-14

### Added
- **Product image editor** (Admin › Produkte › Bild bearbeiten), non-destructive:
  - The original stays in `products.image_source`; only the edit is stored (`image_edit`) and the shop image is rendered from it. "Zurücksetzen" always returns to the original.
  - Edits: quarter turns, mirror, straighten ±15° (corners are cropped automatically), and a crop frame with handles that keeps the ratio when one is chosen.
  - **Cut-out of light backgrounds** without AI or an external service: a flood fill from the image border with a soft edge, so white labels inside a bottle stay. Includes an adjustable tolerance.
  - Trimming of empty margins, a canvas in 1:1 / 3:4 / 4:5 / 2:3 with margin, transparent / white / any colour, and a soft shadow.
  - Live preview of the original with the crop frame and of the result on a checkerboard; a preview renders in 35–250 ms.
- **Image standard** (Admin › Einstellungen › Produktbilder): one format, margin and background for all product cards.
  - It applies automatically to new images (upload, ERP, optimizer job).
  - "Speichern & alle Produktbilder aufbereiten" and the job `images:harmonize` process all images without a manual edit; manual edits are never overwritten. The job is resumable within the time budget.
- Tests for image editing, the Supabase/Neon database URL, the storage drivers and the sign-in link (110 unit tests); the end-to-end test covers the image editor (151 checks).

## [1.12.1] - 2026-11-13

### Fixed
- **Accessibility, from a sweep of every page as guest, consumer, B2B customer and admin** (desktop and mobile, light and dark):
  - Every admin field now has a label for screen readers: multilingual fields per language, product image and producer logo (file and URL), shipping JSON, and the design preview.
  - An empty cart keeps the page's main heading.
  - The sweep found no console errors, server errors, horizontal overflow or images without alt text.
- **Language switch:** in the B2B portal and the mobile shop menu the language codes are upper case like everywhere else; Tailwind resets text-transform on buttons. The mobile menu now keeps the query string when the language changes and marks the active language for screen readers.
- **Admin overview:** without orders, the revenue chart shows a clear empty state instead of an empty frame.

## [1.12.0] - 2026-11-13

### Added
- **Vercel + Supabase (Zurich):** connect a Supabase project to the Vercel project and redeploy. Database, uploads and the image optimizer then work with no further settings.
  - `POSTGRES_URL` from the Vercel integration is used when `DATABASE_URL` is empty.
  - Integration-only URL parameters (`supa=…`, `pgbouncer=…`) are ignored, SSL is required for remote hosts, and the connection pool is sized for serverless.
  - New storage driver **`supabase`**, chosen automatically when `SUPABASE_URL` and a service key are present. It works with the new secret keys and the legacy `service_role` keys. The public bucket is created on first use.

### Fixed
- **PostgreSQL, several instances starting at once** (serverless): migrations and the first seed now run in one transaction with an advisory lock. Concurrent cold starts wait instead of migrating or seeding twice, and an interrupted first seed is rolled back completely instead of leaving a half-filled shop.
- On Vercel with PostgreSQL, a pending migration no longer fails on the missing `pg_dump`. The provider's backups are the rollback point.

## [1.11.0] - 2026-11-13

### Added
- **Shop host for customer installations** (`deploy/host`, guide `docs/HOSTING.md`). Many shops run on one server: Caddy (automatic HTTPS), one PostgreSQL (a database and a user per shop) and one container per shop, about 50 MB RAM each. The host is driven by one Bash script, `shopctl`, and systemd timers.
  - **New customer in one command:** `npm run customer:new` issues the licence key locally, then runs `shopctl new` over SSH: database, secrets, container, health check, HTTPS for all domains, admin login.
  - **Nightly backups:** database, uploads and `.env`, kept locally. Optionally an AES-256-encrypted copy goes to S3 / R2 / Swiss Backup; nothing is uploaded without a passphrase. Restore works from either copy.
  - **Automatic updates:** `UPDATE_POLICY` is minor, patch or off; major versions are never installed automatically. Each update takes a backup first and runs a health check. If the check fails, the database is restored, the old version is started and an alert mail is sent.
  - **Monitoring every 2 min:**
    - DOWN/UP mails, sent only when the state changes;
    - warnings for certificates, disk space and missing backups;
    - a password-protected static status page;
    - an optional heartbeat URL so an external service notices when the whole server is down.
  - `shopctl` also covers `list`, `domains`, `restore`, `logs`, `env`, `restart` and `rm`. `bootstrap.sh` sets up a fresh Debian/Ubuntu server.

### Fixed
- Docker image: includes `pg_dump`. Without it, the automatic backup before database migrations failed on PostgreSQL, and with it the update.

## [1.10.0] - 2026-11-13

### Added
- **Sign-in link (magic link)** for registered customers, B2C and B2B: "Login-Link per E-Mail" on the shop and portal login.
  - The link is valid 15 minutes and works once. Only a hash is stored, in separate columns, so a pending password-reset link stays valid.
  - Opening the link shows a confirm button; the link is used only on submit, so mail scanners cannot use it up.
  - B2B customers land in the portal, B2C customers in their account. Each storefront signs in only its own customers.
  - Never sent to staff or admins (password only). Same answer for unknown addresses; requests are rate-limited.
  - Translated into DE/IT/FR/EN. Migration `0008_magic_link`.

### Changed
- **Ownership made explicit:** the product is "Vine Import Shop", © Luca De Simoni (copyright holder and licensor), defined in one place, `app/lib/product.ts`.
  - The notice is shown in the admin sidebar and on Admin › System, next to the licence data.
  - It is written as a banner into every built JS file and added to `package.json` (`author`, `license: SEE LICENSE IN LICENSE`), README and NOTICE.
- **LICENSE reworked for selling:**
  - names the owner and the product; the software is licensed, not sold;
  - prohibits reverse engineering, licence-key circumvention and sharing keys;
  - confidentiality of source code;
  - customer data and `custom/` extensions belong to the licensee;
  - termination with data export; Swiss law.
- `docs/LICENSING.md`: checklist for the chain of title (employment or contract work, contributors, AI-assisted code, transfer to a company, trademark search).

## [1.9.0] - 2026-11-13

### Added
- **Serverless-ready jobs (Vercel):**
  - Each cron and admin job run has a time budget below the function limit: `JOB_BUDGET_SECONDS`, default 50 s on Vercel, 900 s elsewhere.
  - Jobs run by priority (orders → vinX, order status, stock, prices …). What does not fit is reported as `deferred`.
  - **Resumable:** article sync, stock, price lists, customer pull, receipts, customer import and images stop cleanly and continue at the same record in the next call. Each run makes progress.
  - Delta syncs keep the start of the first partial run, so nothing is missed. Price lists are written per complete article (sorted `$orderby=articleId`), never half.
  - Every vinX request has a timeout inside the budget.
  - Test it with `/api/cron?budget=<s>`.
- **Scheduler for every plan:** `.github/workflows/cron.yml` calls `/api/cron` every 15 min. Set the repository secrets `SHOP_URL` and `CRON_SECRET`. Vercel Cron stays daily, which is what the Hobby plan allows.

### Changed
- The image optimizer runs on Vercel only with S3 storage (files in `/tmp` would vanish).
- `docs/DEPLOY.md › Vercel`: cron options, time limits, database and function notes, backups, vinX IP allowlist.

## [1.8.0] - 2026-11-13

### Added
- **vinX Shop API v2.0 fully used: 57 of 57 endpoints** (see `docs/VINX.md`, checked against the official spec by the contract test).
  - **Product page:**
    - Allergens, ingredients and nutrition facts (`Ingredients`).
    - Classification (DOCG …), product cycle, acidity / residual sugar.
    - Set contents with links (`SellingSet`), substitute article for discontinued ones.
    - Bottle condition for rarities (`Condition`, stock per condition) and live prices per condition (`ProductInfoCondition`).
  - **Categories** come from the web groups (`ECommerceGroup`) when they are maintained.
  - **Weight** from the article goes into the Post label.
  - **Customers** (`SalesRepresentative`, `Tour`/`DeliveryDay`, `CustomerCategory`, `Chain`, `DistributionChannel`, `Salutation`, `SelectionCode`, `PlatformAssortment`, `Marketing`/`CustomerMarketing`):
    - The portal shows the sales rep and the delivery days. The B2B checkout offers only dates on the customer's tour days.
    - The admin shows the vinX master data of each customer.
    - Optional customer assortment.
  - **Contact persons** (`ContactPerson`, `Department`): one portal login each, with the same address, prices and payment terms.
  - **Portal:** open invoices with due and overdue status (`Receipt`, `ReceiptType`), «Für Sie reserviert» (`Reservation`).
  - **Tracking numbers** from vinX (`ShippingPackage`) go onto the order and into the shipping e-mail.
  - **New online addresses** are resolved to their vinX address id (`Online/OnlineAddress({id})`).
  - **Admin › vinX:** reference data (payment means, discount groups, special conditions, receipt types, warehouses, distribution channels, selections).

## [1.7.0] - 2026-11-13

### Added
- **Payment methods per customer.** The most specific rule wins:
  1. **The customer's own setting** (Admin › Kunden › Zahlarten).
  2. **vinX payment terms:** `Address.paymentConditionId` is synced, and «Zahlungsbedingung → Zahlarten» is mapped in Admin › vinX. Without a mapping, invoice is offered only to customers whose terms match the invoice condition.
  3. **Customer group** (Admin › Einstellungen › Kundengruppen).
  4. **Everything the shop offers.**
  - A rule never leaves a customer without a way to pay: advance or online payment always remains.
  - Invoice orders go to vinX with the customer's own payment terms.
  - The admin customer page shows the effective methods and where they come from.
  - Demo: the gastro customer has «Rechnung 30 Tage» in vinX → invoice; consumers → advance or online payment.

## [1.6.0] - 2026-11-13

### Added
- **Status e-mails to customers:** confirmed, in progress, shipped, completed, cancelled. You choose which in Admin › Einstellungen › Versand & Kundenbenachrichtigung.
  - Each status is sent once per order, in the order's language and with the brand of its shop. It doesn't matter whether the status comes from the admin, a bulk action, a Post label or the vinX sync.
  - The shipping mail carries the carrier, tracking number and a «Sendung verfolgen» button.
- **Shipping & tracking:**
  - Carriers with tracking-link templates (Post, Planzer, DHL, DPD, UPS, own delivery — editable).
  - On the order: carrier and tracking number, «Als versandt markieren».
  - Customers see the tracking link in their account and portal.
- **Swiss Post labels** (Digital Commerce API, Barcode `generateAddressLabel`):
  - One click on the order creates the label with its tracking number, sets «versandt» and informs the customer. The label PDF is downloadable in the admin only.
  - Configuration: franking licence, sender, services (A/B-Post, signature), label size, default weight. Credentials come from env `POST_CLIENT_ID` / `POST_CLIENT_SECRET`.
  - Without them, a clearly marked demo label is created.

### Changed
- **Product cards have a fixed rhythm:**
  - Category, title (max. 2 lines), producer · vintage · size, article number «+n Formate».
  - Prices and availability line up across each row, also on phones and with many formats.
## [1.5.0] - 2026-11-13

### Added
- **Image optimizer:** job «Produktbilder optimieren (WebP)», scheduled and runnable in Admin › vinX ERP.
  - Turns product photos (uploads, ERP/supplier URLs, demo files) into WebP at 1200 and 480 px under `img/`, locally or on S3, with long cache headers.
  - Shop pages load the matching size through `srcset`. New uploads in Admin › Produkte are optimized right away.
  - Uses sharp; its libvips binary (LGPL, dynamically loaded) is a reviewed exception in the licence check and is listed in NOTICE.md.
- **Region maps zoom** like the world map: mouse wheel, pinch, drag, double click, buttons.

### Changed
- **One login, one role ("separate" channels):** approved B2B customers land in the portal after login, and every shop page (shop, product, order list, checkout, account) leads into the portal, including client-side navigation. Content pages stay readable, and the account icon points to the portal.
- **Maps:** the mouse wheel zooms without a modifier key; at the zoom limit the page scrolls on. Resetting a region selection keeps the country. The country chip and the overview heading follow the map that is shown.
- **Header:** the order list is icon-only (count badge, no text label).

## [1.4.0] - 2026-11-13

### Added
- **Storefronts:** further B2C shops on their own domain (e.g. for a subsidiary) on the same platform.
  - Each storefront has its own brand, design and settings. The same admin editors work with a «Gilt für» switch; anything not overridden is inherited from the main shop.
  - Own assortment (product kinds, categories, producers, include/exclude lists) and its own customer group for prices.
  - Separate customer accounts (the same e-mail can be used per shop), orders with their own number prefix, e-mails in the storefront's brand.
  - Own home page and pages; its imprint, terms and privacy pages replace the main shop's.
  - Admin › Storefronts lists customers, orders and revenue per shop, with a «Shop» filter in orders and customers. Preview without DNS: `/?storefront=<slug>`.
  - Demo storefront «Da Ferrari» (`/?storefront=daferrari`).
  - See `docs/STOREFRONTS.md`.
- **Commercial distribution.**
  - `SHOP_DIST=customer` (default for `npm run release` and the Docker image) builds without the De Simoni demo content: the demo seed is not bundled and `public/demo` is removed.
  - Licence keys: Ed25519-signed and checked offline (`npm run licence -- keygen | issue | verify`, env `LICENSE_KEY`). Admin › System shows the licensee, plan, domains and expiry; the go-live checklist flags missing or invalid keys. A shop is never blocked.
  - `docs/LICENSING.md`: what to sell and how, issuing keys, licence models, outline of a licence agreement, checklist before the first sale.

## [1.3.0] - 2026-11-13

### Added
- **Wine-region maps** for France (25 areas: Bordeaux, Burgund, Champagne, Elsass, Loire, Rhône …), Portugal (Douro, Vinho Verde, Dão, Alentejo …), Switzerland (Wallis, Waadt, Genf, Drei-Seen-Land, Tessin, Deutschschweiz) and Austria (Niederösterreich, Burgenland, Steiermark, Wien, Bergland).
  - The maps are built from départements, districts and cantons. Appellations and administrative names both resolve to the right area ("Saint-Émilion", "Gironde" → Bordeaux; "Graubünden" → Deutschschweiz).
  - Spain and Germany keep their autonomous communities and federal states, with wine-region aliases.
  - Demo: the Swiss, Austrian, French and Spanish producers have their region, so each country drills down like Italy.
- **Zoomable world map.**
  - Controls: zoom buttons, "Europa", ctrl/⌘ + scroll or trackpad pinch, touch pinch, drag, double click.
  - When zoomed in, real country outlines (Natural Earth) replace the dot grid. They are loaded only on demand.
  - The map opens on the countries that have products.
- **Admin › Einstellungen › Herkunftskarte › "Weltkarte anzeigen".** When it is off, the shop shows region maps (home country and every country with a map) and A–Z only.

### Changed
- **Dark mode is calmer.**
  - The lifted brand colour loses some saturation (no more neon). Text on buttons keeps ≥ 4.5 : 1 contrast.
  - The announcement bar is muted.
  - Packshots and their stage are slightly dimmed, so white photos no longer glare.
- **Header:** the full navigation shows from 1280 px; below that the menu takes over. The B2B-portal button is icon-only up to 1536 px, and the order-list label appears from 1536 px. The header no longer runs past the screen at 1024–1440 px.
## [1.2.0] - 2026-11-13

### Added
- **vinX: broader coverage of the Shop API v2.0.** The shop now uses 32 of 57 paths. `docs/VINX.md` lists every path and why the rest is not used.
  - Wine details from `BaseData/Wine`, `WineRating`, `Rating` and `Brand` appear on the product page: ratings with source and scale, character, vinification, terroir, recommendation, drinking temperature and ageing potential.
  - Article and producer texts and the producer website from vinX fill **only empty** shop fields. Shop texts always win.
  - B2B portal: invoices and delivery notes from vinX (`DocumentInfo`, `Document`) to download, with an ownership check. "Häufig bestellt" uses the vinX order proposal, so it includes phone and e-mail orders.
  - Optional online assortment: articles outside a vinX selection (`ArticleSelectionCode`) are taken offline.
  - When a customer's e-mail changes, the vinX shop login follows (`ChangeShopUsername`).
  - Admin › vinX shows delivery conditions, payment conditions and price groups with their ids for the mappings.
  - Contract test extended to the new endpoints and fields. The spec extract was refreshed from the I-AG demo server.
- **Licensing.**
  - Proprietary licence (`LICENSE`, `"license": "UNLICENSED"`).
  - Inventory of all 90 runtime dependencies (`THIRD_PARTY_LICENSES.md`, `npm run licenses`). CI blocks copyleft or unknown licences (`npm run licenses:check`).
  - `NOTICE.md` covers map data (Natural Earth, openpolis/ISTAT), fonts and the De Simoni demo content.

### Changed
- Customer import accepts **CSV and XML** only, no Excel (from Excel: "Save as › CSV UTF-8"). XML now handles namespaced ERP exports and CDATA.

### Fixed
- **Phones.**
  - Checkout and order list could be wider than the screen with items in the cart, especially in Italian.
  - Cause: grid items kept the width of their longest content. All grid items may now shrink (design-system base rule).
- Long job buttons in Admin › Integrationen wrap instead of overflowing. The footer language switch has no stray divider on phones.

## [1.1.0] - 2026-11-13

### Added
- **Customer import** (Admin › Kunden › Importieren).
  - Reads CSV (any delimiter; from Excel via "CSV UTF-8") and XML, including namespaced ERP exports with CDATA.
  - Columns are recognised automatically (DE / IT / FR / EN) and can be adjusted, with a preview.
  - Customers are matched by customer number, then e-mail, and updated.
  - B2B customers can be approved directly, invitations sent and records pushed to vinX.
  - Invalid rows are listed by line number.
- **Password reset and invitations.**
  - "Passwort vergessen?" on the login.
  - Invitation links for imported or ERP customers (single and bulk). Single-use tokens, stored hashed: reset links valid 2 hours, invitations 14 days.
- **vinX: order status from receipts.** New job `orders:status` (BaseData/Receipt.shopId = shop order number).
  - new → confirmed, inProgress → processing, done → shipped, payed → completed and paid.
  - The status only moves forward.
- **vinX: create shop accounts for all vinX customers.** Job `customers:import`: active addresses with an e-mail, without password until invited.
- **Demo catalogue from the reference test site.**
  - 1,356 products (1,779 articles), 124 producers, product photos and 28 brand logos. Vintages, formats and flavours are merged into variants.
  - Producer names are cleaned (legal forms removed); the original stays as the ERP key.
  - Demo prices (the source has none). Rebuild with `scripts/demo/build-catalog.py`.
- **Design system: named type scale** (`2xs`, `label`, `xs`, `note`, `sm`, `body`) and a field-label utility instead of fixed pixel sizes. Spacing tokens `page-top` and `section-y` give one vertical rhythm, tighter on phones.
- Compact pagination (‹ 1 … 4 5 6 … 57 ›) in the shop and the B2B portal.
- **Page builder.** The home page, content pages and extras on the trade and story pages are built from blocks.
  - Admin › Inhalte: drag & drop (arrows on phones), show / hide, duplicate, delete, add from the block library, edit inline in every language, image upload.
  - Blocks: hero, categories, products (promotions, recommended, new, a category or a producer; carousel or grid), product spotlight, image & text, text (Markdown), call-to-action, producers / brands, origin map, values, quote, image, FAQ.
  - New pages can be built from blocks or written as simple text (legal pages). Existing home pages are converted automatically. *Reset to default* is available.
  - Every field is sanitised on save: links only to internal paths, `https:`, `mailto:` and `tel:`; images only uploads or `https:`.
  - Own blocks: `custom/blocks/<name>/index.tsx` with `defineBlock({...})`.
  - Demo: origin-map and call-to-action blocks on the home page, an FAQ page built from blocks.
- **Safe updates.**
  - A consistent backup is taken automatically before every database migration.
  - A daily backup runs, the newest 14 are kept, and pre-update backups are kept for 30 days.
  - `npm run backup` / `npm run restore`.
  - Backups can be downloaded and restored from **Admin › System**.
- **Downgrade guard.** An older version refuses to start against a database upgraded by a newer version, and explains how to recover.
- **Admin › System.**
  - Shows the installed version and a notice when a newer release is available.
  - Go-live checklist with live status: admin password, HTTPS, brand, legal texts, mail, payments, backups, demo data, ERP and database.
- **Forced admin password change** on live installations while the default password is still active. New page **Admin › Passwort**.
- `/api/health` reports the version and schema version.
- **Zero-config start.** Secrets are generated once into `data/secrets.json`. `docker compose up -d` (one container, built-in database) and `npm run up`.
- **One-click deploy** for Elestio, Vercel and Render, plus configs for Railway, Coolify and Dokploy.

- **Customer extensions folder** (`custom/extensions/<name>/index.ts`). It is loaded automatically and never touched by core updates. `EXTENSIONS_DISABLED` switches extensions off.
- **Automated dependency updates** (Renovate): grouped weekly PRs, majors need approval, security fixes immediately.
- Vercel demo functions run in Frankfurt (fra1). Neutral default favicon; demo favicon.

- **Producer pages** (`/producers/<name>`): logo, portrait, origin mini map and all products. Linked from the origin map, A–Z and every product page.
- **Producer & brand admin** (Admin › Produzenten):
  - logo upload (PNG, WebP or sanitised SVG served with a CSP sandbox);
  - country and region suggestions, with a hint when a region is not found on the map;
  - portrait per language, search, filters, sort and bulk actions;
  - the origin-map settings sit on the same page.
- **Origin maps for 17 countries.**
  - Region maps for Italy, France, Spain, Portugal, Germany, Austria, Switzerland, Greece, Hungary, Slovenia, Croatia, USA, Argentina, Chile, South Africa, Australia and New Zealand.
  - Wine regions are recognised (Bordeaux, Champagne, Rioja, Douro, Mosel, Wachau, Napa, Marlborough …).
  - Visitors switch between regions, world and A–Z. The world map drills down into a country's regions.
  - New countries: `scripts/maps/build-region-maps.py`.
- **Admin lists** for products, orders, customers and producers:
  - search, sortable columns, filters, paging and bulk actions;
  - filters for products without image or description, open payments and failed ERP transfers;
  - order CSV export (Excel-ready).
- **Customer page** in the admin: contact, billing address, group, B2B status, vinX address number, revenue, last orders and ERP sync status with *send now*.
- **Two-way customer sync with vinX.**
  - Admin changes are pushed as OnlineAddress changes.
  - The new job `customers` pulls address changes made in vinX (BaseData/Address).
- Language switch in the footer, so it is also reachable on phones. `npm run i18n:check` in CI keeps DE / IT / FR / EN complete.

### Fixed
- **Phones.**
  - Pages could be wider than the screen, so the browser zoomed out: the shop pagination with many pages, and the header on narrow phones (320–375 px).
  - Overflow is now measured without clipping, on iPhone SE, Galaxy S9+, Pixel 7 and iPhone 14 Pro Max.
- **Form alignment.** Every field label row has the same height and long labels are shortened with a tooltip, so inputs in one row always line up.
- Admin on small phones: the save bar, panel headers, the dashboard list and long toggle labels no longer overflow.
- `npm run jobs` and other Node scripts failed to start, because the region maps used a Vite-only import. They now fall back to reading from disk.
- **Phones.**
  - The menu drawer was clipped to the header height and showed the page through it. It now renders outside the header.
  - B2B portal: app-style bottom tab bar (overview, range, quick order, order list, orders) and a compact "more" menu (price list, shop, language, theme, logout).
  - B2B order grid: rows become compact cards (name, article number, stock, price, quantity).
  - Admin: menu button with the full navigation instead of a sideways-scrolling bar.
  - Product variants: compact rows with the price on the right. Shorter "added" button label.
  - Toasts sit above the tab bar. Sideways scrolling can no longer happen.
- `cn()` resolves conflicting display / width / height utilities, so the width of an input or button is applied (the base `w-full` won before).
- The German shop eyebrow said "Il sortimento".
- On phones, header icons could be pushed off-screen: responsive `hidden` on buttons was overridden by the button's own display class.
- Custom extensions that import `defineExtension` crashed the server at start (circular import).

### Changed
- **ERP locks per record.**
  - Only products, producers and customers that really come from vinX are locked: products with an ERP article id, producers with an ERP key, customers with an address number. Only the vinX-owned fields are locked.
  - Shop-only records are fully editable and can be deleted. Products: single and bulk delete; order lines keep their copy of name and article number. Producers: when unused. Customers: without orders.
  - Bulk actions skip linked products for vinX-owned fields and say so.
- **Calmer, more coherent design.**
  - Status colours are earthy, contrast-checked tones derived from the brand (sage, ochre, rust) instead of a strong green.
  - Stock indicators are neutral; colour only for "few" and "sold out". "Added" uses the text colour instead of green.
  - Promotion tags are outlined instead of solid.
  - The order-list count sits as a small badge on the icon.
  - Uppercase labels are tightened on phones. Eyebrows always use the sans font.
- **Demo content rewritten.**
  - Own wording instead of the reference site.
  - Descriptions, short texts and pairings for all 56 products in German and Italian.
  - Home, trade and story texts without unverifiable figures.
  - Two shop-only articles show the difference to vinX-synced ones.
- Product page: the short text is shown under the name.
- **ERP field ownership is enforced.** Fields mastered by vinX are locked in the product form and are not offered as bulk actions.
- The vinX article sync matches producers by their ERP key. Renaming a producer in the admin no longer creates a duplicate.
- Demo content is fully translated into Italian. The German home page now has a German headline, so switching the language is visible at once.
- Page titles follow the selected language.
- Database migrations are bundled into the server build. This works on serverless hosts and is compatible with existing installations.
- `docker-compose.yml` is now the single-container setup. App + Postgres moved to `docker-compose.postgres.yml`.

## [1.0.0] - 2026-11-12

First release of the white-label platform for wine and speciality importers and retailers (B2B and B2C).

### Added
- **Storefront.**
  - Editorial home page, catalogue with categories and producer and origin facets.
  - Product pages with variants (vintage and size), stock levels and tier prices.
  - Producers page with an Italy region map or an abstract world map, story, contact, legal pages, sitemap.
  - DE / IT / FR / EN.
- **B2B portal** (`/portal`): dashboard, order-grid catalogue, quick order (paste from Excel), order history, reorder, CSV price list.
- **Sales channels**: combined, separate (B2C shop + B2B portal), portal-only or shop-only, each optionally on its own domain.
- **B2B conditions engine** based on the vinX price-finding model:
  - special and promotion prices;
  - customer, quantity and promotion discounts;
  - free goods ("12 for 11");
  - scoped per customer or group, targeted by product, category, producer or discount group;
  - rules from the platform, vinX or any other ERP.
- **vinX integration**, verified against the official *I-AG Standard Shop API v2.0* OpenAPI spec and guarded by a contract test:
  - articles, stock, price lists, promotions and special prices;
  - live customer prices and basket calculation;
  - order and customer push through a persistent outbox;
  - CSV file exchange and a demo driver.
- **Payments**: invoice, prepayment, Stripe, Mollie, Datatrans, Payrexx (TWINT, PostFinance, cards). Hosted payment pages with verified webhooks.
- **White-labelling**:
  - Design tokens, so any brand palette, fonts, radius and button style are set in the admin.
  - Derived accessible dark mode.
  - Business profiles: importer, merchant, winery, spirits, delicatessen, beverages.
  - Feature modules and configurable wording.
- **Extension API**: ERP drivers, payment providers, price sources, scheduled jobs, typed domain events and admin links.
- **Admin**: orders, products, customers with trade approval, conditions, design and brand, content, settings, integrations.
- **Deployment**: Node, Docker, Kubernetes, Hostpoint Managed Flex (CSC), cPanel/Plesk (Passenger), systemd, and buildpack PaaS. One-command installer.
- **Quality**: unit tests (pricing, conditions, payments, vinX mapping and contract) and a full-platform end-to-end suite in CI.
- **Demo**: De Simoni (Kriens, since 1917) with 56 products.

[Unreleased]: https://github.com/lucadesimoni/vine-import-shop/compare/v1.18.0...HEAD
[1.18.0]: https://github.com/lucadesimoni/vine-import-shop/compare/v1.17.0...v1.18.0
[1.17.0]: https://github.com/lucadesimoni/vine-import-shop/compare/v1.16.0...v1.17.0
[1.16.0]: https://github.com/lucadesimoni/vine-import-shop/compare/v1.15.0...v1.16.0
[1.15.0]: https://github.com/lucadesimoni/vine-import-shop/compare/v1.14.0...v1.15.0
[1.14.0]: https://github.com/lucadesimoni/vine-import-shop/compare/v1.13.0...v1.14.0
[1.13.0]: https://github.com/lucadesimoni/vine-import-shop/compare/v1.12.1...v1.13.0
[1.12.1]: https://github.com/lucadesimoni/vine-import-shop/compare/v1.12.0...v1.12.1
[1.12.0]: https://github.com/lucadesimoni/vine-import-shop/compare/v1.11.0...v1.12.0
[1.11.0]: https://github.com/lucadesimoni/vine-import-shop/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/lucadesimoni/vine-import-shop/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/lucadesimoni/vine-import-shop/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/lucadesimoni/vine-import-shop/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/lucadesimoni/vine-import-shop/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/lucadesimoni/vine-import-shop/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/lucadesimoni/vine-import-shop/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/lucadesimoni/vine-import-shop/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/lucadesimoni/vine-import-shop/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/lucadesimoni/vine-import-shop/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/lucadesimoni/vine-import-shop/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/lucadesimoni/vine-import-shop/releases/tag/v1.0.0
