import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

export default [
  // ── Storefront ─────────────────────────────────────────────────────────
  layout("routes/shop-layout.tsx", [
    index("routes/home.tsx"),
    route("shop", "routes/shop.tsx"),
    route("product/:slug", "routes/product.tsx"),
    route("producers", "routes/producers.tsx"),
    route("trade", "routes/trade.tsx"),
    route("story", "routes/story.tsx"),
    route("contact", "routes/contact.tsx"),
    route("page/:slug", "routes/page.tsx"),
    route("order-list", "routes/order-list.tsx"),
    route("checkout", "routes/checkout.tsx"),
    route("checkout/done/:number", "routes/checkout-done.tsx"),
    route("login", "routes/login.tsx"),
    route("register", "routes/register.tsx"),
    route("account", "routes/account.tsx"),
    route("account/orders/:number", "routes/account-order.tsx"),
    route("account/quick-order", "routes/quick-order.tsx"),
  ]),

  // ── B2B portal (shares cart, checkout & order modules with the storefront) ──
  route("portal/login", "routes/login.tsx", { id: "portal-login" }),
  route("portal", "routes/portal/layout.tsx", [
    index("routes/portal/dashboard.tsx"),
    route("catalog", "routes/portal/catalog.tsx"),
    route("product/:slug", "routes/product.tsx", { id: "portal-product" }),
    route("quick-order", "routes/quick-order.tsx", { id: "portal-quick-order" }),
    route("order-list", "routes/order-list.tsx", { id: "portal-order-list" }),
    route("checkout", "routes/checkout.tsx", { id: "portal-checkout" }),
    route("checkout/done/:number", "routes/checkout-done.tsx", { id: "portal-checkout-done" }),
    route("orders", "routes/account.tsx", { id: "portal-orders" }),
    route("orders/:number", "routes/account-order.tsx", { id: "portal-order" }),
  ]),

  // ── Actions & resources ────────────────────────────────────────────────
  route("cart", "routes/resources/cart.ts"),
  route("logout", "routes/resources/logout.ts"),
  route("set-locale", "routes/resources/set-locale.ts"),
  route("account/price-list.csv", "routes/resources/price-list.ts"),
  route("sitemap.xml", "routes/resources/sitemap.ts"),
  route("robots.txt", "routes/resources/robots.ts"),
  route("uploads/*", "routes/resources/uploads.ts"),

  ...prefix("api", [
    route("cron", "routes/api/cron.ts"),
    route("vinx/webhook", "routes/api/vinx-webhook.ts"),
    route("vinx/import", "routes/api/vinx-import.ts"),
    route("payments/stripe", "routes/api/stripe.ts"),
    route("v1/products", "routes/api/products.ts"),
    route("health", "routes/api/health.ts"),
  ]),

  // ── Admin ──────────────────────────────────────────────────────────────
  route("admin", "routes/admin/layout.tsx", [
    index("routes/admin/dashboard.tsx"),
    route("orders", "routes/admin/orders.tsx"),
    route("orders/:id", "routes/admin/order.tsx"),
    route("products", "routes/admin/products.tsx"),
    route("products/:id", "routes/admin/product.tsx"),
    route("customers", "routes/admin/customers.tsx"),
    route("conditions", "routes/admin/conditions.tsx"),
    route("design", "routes/admin/design.tsx"),
    route("content", "routes/admin/content.tsx"),
    route("settings", "routes/admin/settings.tsx"),
    route("integrations", "routes/admin/integrations.tsx"),
  ]),
] satisfies RouteConfig;
