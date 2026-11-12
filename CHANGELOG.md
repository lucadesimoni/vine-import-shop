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

### Changed
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
