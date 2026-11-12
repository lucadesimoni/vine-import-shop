# Architecture

```
app/
  root.tsx               middleware (request context, CSRF origin check), theme injection, i18n provider
  routes.ts              route table: storefront · resources/API · admin
  routes/                route modules (loader / action / component)
  components/ui.tsx      design-system primitives (Button, Field, Input, Badge, Card, Stepper …)
  components/shop.tsx    storefront components (Header, Footer, ProductCard, PriceTag, StockLabel …)
  components/admin.tsx   admin components (PageHeader, Panel, DataTable, LocalizedInput, Toggle …)
  app.css                design tokens → Tailwind theme, type scale
  lib/                   isomorphic & pure: pricing, money, settings schemas, i18n, theme, markdown
  .server/               server-only: db, auth, context, catalog, cart, orders, payments, mail, storage, vinx/
drizzle/                 SQL migrations (generated)
public/demo/desimoni     demo assets
```

## Principles

- **White-label by data, not code.** `app/lib/settings.ts` defines Zod schemas for `brand`, `shop`, `home`, `trade`, `story` and `vinx`. They are stored as JSON in `settings`, edited in admin, and cached for 30 seconds per process.
- **Design tokens.** Brand colours, fonts and radius become `--t-*` CSS variables (`lib/theme.ts`). `app.css` maps them to semantic Tailwind colours (`bg-primary`, `text-muted-fg`, `border-border` …). Components never use raw colours, so a re-brand is a settings change.
- **Pure domain core.** `lib/pricing.ts` (tiers, group discounts, VAT per rate, coupons, shipping, 5-Rappen rounding, stock levels, price visibility) has no I/O and is unit-tested. The cart, checkout and order list all use one `cartSummary()`.
- **Product → variants.** Matches vinX: one product story with several article numbers (vintage, size).
- **Reliable integrations.** Domain events (`order.placed`, `customer.registered`, `trade.approved` …) feed a persistent ERP outbox with retries. Mail and ERP failures never break checkout.
- **Progressive enhancement.** All mutations are HTML forms handled by actions; JavaScript adds instant cart updates and pending states.
- **Security.** Signed httpOnly SameSite cookies; scrypt password hashing; origin check on non-API POSTs; login throttling; timing-safe secret comparison; HMAC webhooks (Stripe, vinX); escaped Markdown; sanitised theme CSS; upload type and size checks; no trade prices in the public API.

## Request flow

`root middleware` builds `ShopContext` once: user, customer group, trade status, price visibility, locale, brand and shop settings. Every loader and action reads it with `context.get(shopContext)`.

## Scaling

The app is stateless apart from Postgres and uploads (local disk or S3), so you can run any number of instances behind a load balancer. For more than one instance:

- use managed Postgres (`DATABASE_URL`);
- set `STORAGE_DRIVER=s3`;
- move the in-memory login throttle and settings cache to Redis if needed.

Static assets are content-hashed and cached for a year, so a CDN can sit in front of everything.
