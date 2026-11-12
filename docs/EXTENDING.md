# Extending the platform

The core stays small and stable. Everything business-specific plugs in through four layers. Pick the lowest one that does the job.

| Layer | Use it for | How |
|---|---|---|
| **1. Settings & profiles** | Switching features per business type (wine merchant, importer, winery, spirits, deli, beverages), wording, channels, prices and payments | Admin › Einstellungen (*Geschäftsmodell*, *Module & Begriffe*). Schemas in `app/lib/settings.ts` |
| **2. Design tokens** | The full look and feel per brand (colours incl. a derived dark mode, fonts, radius, button style, material tones) | Admin › Design. Tokens in `app/lib/theme.ts` → `app/app.css` |
| **3. Extensions** | ERP or accounting connectors, payment providers, price sources, event handlers, scheduled jobs, admin links | A folder in `app/extensions/` listed in `app/extensions.config.ts` |
| **4. Routes** | New pages (storefront, portal or admin) | A route module plus one line in `app/routes.ts` |

## Extension API

```ts
// app/extensions/acme-erp/index.ts
import { defineExtension } from "~/.server/extensions";

export default defineExtension({
  id: "acme-erp",
  name: "ACME ERP",
  version: "1.0.0",
  setup(api) {
    api.registerErpDriver({ id: "acme", label: "ACME ERP", create: (cfg) => new AcmeClient(cfg) }); // implements ErpClient
    api.registerPriceSource({ id: "acme", label: "ACME (live)", resolve: async (ctx, variants) => /* Map<variantId, Tier[]> */ null });
    api.registerPaymentProvider({ code: "saferpay", available: (ctx) => true, start: async (ctx, order, origin) => null, webhook: async (req) => new Response("ok") });
    api.registerJob({ id: "acme:invoices", label: "Rechnungen abgleichen", scheduled: true, run: async () => ({ ok: true, message: "12 Rechnungen" }) });
    api.on("order.paid", async ({ orderId }) => { /* … */ });
    api.registerAdminLink({ to: "/admin/acme", label: "ACME" });
  },
});
```

| Hook | Contract | Built-in examples |
|---|---|---|
| `registerErpDriver` | `ErpClient` (`app/.server/vinx/client.ts`): articles, stock, prices, special prices, live price info, basket calculation, order and customer push | `mock`, `rest3` (vinX Shop API v2.0), `csv` (`app/.server/extensions/core.ts`) |
| `registerPriceSource` | `resolve(ctx, variants)` → customer tiers, or `null` to fall back to platform prices | `platform`, `vinx` (`app/.server/price-sources.ts`) |
| `registerPaymentProvider` | `available`, `start` (hosted payment page), `webhook` → `POST /api/payments/<code>` | invoice, prepayment, Stripe, Mollie, Datatrans, Payrexx |
| `registerJob` | `run()` → `{ ok, message }`. `scheduled: true` runs on every cron | vinX outbox, stock, prices, special prices, articles |
| `on(event)` | Typed domain events. Failures are logged and never break a request | `order.placed`, `order.paid`, `order.status`, `customer.registered`, `trade.applied`, `trade.approved` |

**Own events.** Extend the event map with declaration merging:

```ts
declare module "~/.server/events" { interface EventMap { "acme.synced": { count: number } } }
```

**Conditions from any ERP.** Write rows into `conditions` with your own `source` and `erp_id`, in the same way `syncSpecialPrices()` does for vinX. The engine (`app/lib/conditions.ts`) evaluates every source the same way.

**Example.** `app/extensions/order-webhook` forwards order events, HMAC-signed, to Zapier, Make, n8n or Bexio/Abacus middleware. Set `ORDER_WEBHOOK_URL` to activate it.

## Conventions

- Extensions are **server-only**. They read configuration from environment variables or from their own settings key.
- Every external call needs a timeout. Failures must be logged, never thrown into checkout.
- Persist anything that must not get lost: use the outbox pattern from `app/.server/vinx/sync.ts`.
- New tables: add them to `app/.server/db/schema.ts`, then run `npm run db:generate` (migrations run automatically).
- Add unit tests for pure logic and extend `tests/e2e/platform.mjs` for flows.
