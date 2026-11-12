# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/):

- **MAJOR**: breaking changes for operators or extensions (removed settings, changed extension API, data migrations that need manual steps).
- **MINOR**: new features and new settings. Backwards compatible; database migrations run automatically, with a backup taken first.
- **PATCH**: bug fixes, security fixes and visual polish only.

Every release is published on GitHub with a ready-to-run archive (`shop-<version>.tar.gz`) and a Docker image (`ghcr.io/<org>/<repo>:<version>`).
See [docs/UPDATING.md](docs/UPDATING.md) for how to update and roll back.

## [Unreleased]

### Added
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

[Unreleased]: https://github.com/lucadesimoni/vine-import-shop/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/lucadesimoni/vine-import-shop/releases/tag/v1.0.0
