# Architecture

## Principles
- **Portable first**: PHP 8.1+ with standard extensions (pdo, curl, mbstring, json; intl is optional). No build step, no Composer, no Node. It runs wherever PHP runs.
- **Modular**: each feature is a `Module` that registers routes, services, event listeners and admin menu entries. Modules are listed (and can be removed) in `config['modules']`.
- **Domain separate from HTTP**: `app/Shop/*` holds the business rules (pricing, cart totals, shipping, orders, payments). Modules are thin HTTP adapters. The JSON API and the HTML views use the same services.
- **Progressive enhancement**: every action is a normal form POST. JS only adds AJAX cart, drawers, live totals and the SKU lookup.
- **Swappable services**: `$app->set(Pricing::class, fn() => new MyPricing(...))` replaces any service.

## Request lifecycle
`public/index.php` → `bootstrap.php` (autoloader, config, modules) → `App::handle()`. This starts the session, runs the installer check, detects the locale, matches the route, checks CSRF on POST (except routes flagged `nocsrf`) and runs middleware (`auth`, `admin`, `b2b`, `guest`). The handler then returns a `Response`.

## Pricing model
- `products.price_gross`: the retail price incl. VAT, as maintained in vinX.
- `prices` table: net prices per customer group with `min_qty` tiers (from vinX price lists).
- `customer_groups.discount_percent`: fallback when a group has no explicit price for a product.
- `price_display`: `gross` for consumers, `net` for trade customers.
- VAT rate per product (`tax_class`: standard 8.1 % or reduced 2.6 %). Shipping is taxed at the standard rate. A discount reduces VAT proportionally. The final total is rounded to 5 Rappen.

## Events
| Event | Emitted by | Listeners |
|---|---|---|
| `order.placed` | OrderService | Checkout (emails), Vinx (outbox) |
| `order.paid` | Stripe webhook, admin, vinX webhook | — (hook point) |
| `order.status` | admin, vinX webhook | — |
| `customer.registered` | Account, Checkout | Vinx (push customer) |
| `b2b.applied` / `b2b.approved` | B2B, Admin | Vinx (push customer) |
| `newsletter.subscribed` | Content | — (connect Brevo/Mailchimp here) |

## Extending
- **New payment method**: implement `Shop\Payment\PaymentProvider` and add it to `config['payment']['providers']`.
- **New ERP**: implement `Modules\Vinx\ErpClient` and set `vinx.driver` to the class name.
- **New module**: create `app/Modules/Foo/FooModule.php` implementing `Core\Module` and add it to the config.
- **Theme**: CSS tokens in `:root`. Override templates in `app/views/theme/`.

## Security
CSRF tokens on all forms; prepared statements everywhere; password hashing with automatic rehash; session regeneration on login; login throttle; honeypot on the contact form; reset tokens stored hashed; signed webhooks (HMAC / Stripe signature); `storage/`, `app/` and `config/` blocked by `.htaccess`; security headers (nosniff, frame options, referrer policy); no account enumeration on password reset.

## Scaling notes
SQLite is fine for a typical importer shop (thousands of products, hundreds of orders a day). Switch to MySQL with `DB_DRIVER=mysql`: the schema is portable and auto-installs. Sessions are file-based; with several app servers, point `session.save_path` to shared storage or Redis.
