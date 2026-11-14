import { sql } from "drizzle-orm";
import type { ImageEdit } from "~/lib/image-edit";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Block } from "~/lib/blocks";
import type { ErpDetails } from "~/lib/erp-details";
import type { Localized } from "~/lib/localized";

/**
 * Data model
 *  - product = what the customer sees (name, story, producer, category)
 *  - variant = what the ERP sells (SKU / article no., vintage, size, price, stock)
 *  Money is integer cents. Translatable content is jsonb { de, it, fr, en }.
 *  White-label configuration lives in `settings` (see app/lib/settings.ts).
 */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Storefronts: further B2C shops on their own domains (e.g. a subsidiary) on the same platform —
 * own branding and settings (settings rows "<key>@<slug>", falling back to the main shop), own assortment,
 * own customers, orders and legal pages. The main shop is the platform itself (storefront = null).
 */
export type ErpCustomerInfo = {
  salesRep?: { name: string; reference?: string; region?: string };
  /** delivery weekdays 1 (Mon) … 6 (Sat) from Tour / DeliveryDay */
  deliveryDays?: number[];
  tour?: string;
  category?: string;
  chain?: string;
  channel?: string;
  /** Address.selectionCodeId, else the PlatformAssortment valid today — customer-specific assortment (ArticleSelectionCode) */
  selectionCodeId?: number;
  /** SelectionCode.designation of that assortment */
  assortment?: string;
  /** CustomerMarketing → Marketing designations (read-only) */
  marketing?: string[];
  /** ContactPerson department (contact-person logins) */
  department?: string;
  salutation?: string;
  /** ContactPerson id when this login belongs to a contact person of the address */
  contactPersonId?: number;
};
export type StorefrontCatalog = {
  /** empty = all kinds / categories / producers */
  kinds: string[];
  categoryIds: number[];
  producerIds: number[];
  /** always offered resp. never offered, regardless of the rules above */
  includeIds: number[];
  excludeIds: number[];
};
export const storefronts = pgTable("storefronts", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  /** host names served by this storefront, e.g. ["daferrari.ch", "www.daferrari.ch"] */
  hosts: jsonb("hosts").$type<string[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  catalog: jsonb("catalog").$type<StorefrontCatalog>().notNull().default({ kinds: [], categoryIds: [], producerIds: [], includeIds: [], excludeIds: [] }),
  /** customer group for guests and new customers of this storefront (prices / conditions / ERP price list) */
  guestGroupId: integer("guest_group_id"),
  ...timestamps,
});

export const customerGroups = pgTable("customer_groups", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  isTrade: boolean("is_trade").notNull().default(false),
  showNet: boolean("show_net").notNull().default(false),
  discountPct: numeric("discount_pct", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
  minOrderCents: integer("min_order_cents").notNull().default(0),
  erpCode: text("erp_code"),
  /** payment methods for the group (null = all the shop offers) */
  paymentMethods: jsonb("payment_methods").$type<string[]>(),
});

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull().default(""),
    company: text("company"),
    uidNumber: text("uid_number"),
    phone: text("phone"),
    role: text("role", { enum: ["customer", "staff", "admin"] }).notNull().default("customer"),
    groupId: integer("group_id").references(() => customerGroups.id),
    tradeStatus: text("trade_status", { enum: ["pending", "approved", "rejected"] }),
    locale: text("locale").notNull().default("de"),
    billing: jsonb("billing").$type<Address>(),
    erpId: text("erp_id"),
    resetToken: text("reset_token"),
    resetExpires: timestamp("reset_expires", { withTimezone: true }),
    /** sign-in link ("magic link"): SHA-256 of the token, short-lived and single-use */
    loginToken: text("login_token"),
    loginExpires: timestamp("login_expires", { withTimezone: true }),
    /** customers belong to the shop they registered in (null = main shop); staff and admins are platform-wide */
    storefrontId: integer("storefront_id"),
    /** payment methods for this customer (null = from the vinX payment condition, else the group) — see .server/payments.ts */
    paymentMethods: jsonb("payment_methods").$type<string[]>(),
    /** vinX BaseData/Address.paymentConditionId (synced) */
    erpPaymentConditionId: integer("erp_payment_condition_id"),
    /** customer master data from vinX (sales rep, tour / delivery days, category, chain, channel, assortment) — see vinx/sync.ts */
    erpInfo: jsonb("erp_info").$type<ErpCustomerInfo>(),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(sql`lower(${t.email})`, sql`coalesce(${t.storefrontId}, 0)`)],
);

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  parentId: integer("parent_id"),
  name: jsonb("name").$type<Localized>().notNull(),
  image: text("image"),
  sort: integer("sort").notNull().default(0),
  showOnHome: boolean("show_on_home").notNull().default(false),
  erpCode: text("erp_code"),
});

export const producers = pgTable("producers", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  country: text("country"),
  region: text("region"),
  description: jsonb("description").$type<Localized>(),
  logo: text("logo"),
  website: text("website"),
  featured: boolean("featured").notNull().default(false),
  erpId: text("erp_id"),
});

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    kind: text("kind", { enum: ["wine", "food", "spirit", "beverage"] }).notNull().default("wine"),
    name: jsonb("name").$type<Localized>().notNull(),
    short: jsonb("short").$type<Localized>(),
    description: jsonb("description").$type<Localized>(),
    pairing: jsonb("pairing").$type<Localized>(),
    categoryId: integer("category_id").references(() => categories.id),
    producerId: integer("producer_id").references(() => producers.id),
    color: text("color", { enum: ["red", "white", "rose", "sparkling", "sweet"] }),
    country: text("country"),
    region: text("region"),
    appellation: text("appellation"),
    grapes: text("grapes"),
    alcohol: numeric("alcohol", { precision: 4, scale: 1, mode: "number" }),
    organic: boolean("organic").notNull().default(false),
    taxClass: text("tax_class", { enum: ["standard", "reduced"] }).notNull().default("standard"),
    ageRestricted: boolean("age_restricted").notNull().default(true),
    tradeOnly: boolean("trade_only").notNull().default(false),
    active: boolean("active").notNull().default(true),
    featured: boolean("featured").notNull().default(false),
    promo: boolean("promo").notNull().default(false),
    isNew: boolean("is_new").notNull().default(false),
    image: text("image"),
    /** original of the shop image (upload / ERP / supplier URL); `image` is rendered from it with `imageEdit` */
    imageSource: text("image_source"),
    imageEdit: jsonb("image_edit").$type<ImageEdit>(),
    /** ERP-owned details (wine texts, ratings, EAN …) — lib/erp-details.ts */
    erpDetails: jsonb("erp_details").$type<ErpDetails>(),
    ...timestamps,
  },
  (t) => [index("products_category_idx").on(t.categoryId), index("products_producer_idx").on(t.producerId)],
);

export const variants = pgTable(
  "variants",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text("sku").notNull().unique(),
    erpId: text("erp_id"),
    vintage: text("vintage"),
    size: text("size"), // display label, e.g. "75 cl", "2.5 kg"
    volumeMl: integer("volume_ml"),
    packSize: integer("pack_size").notNull().default(1), // units per case
    /** vinX "Artikelgruppe für Kundenrabatt" — key for group-wide customer discounts */
    discountGroup: text("discount_group"),
    priceCents: integer("price_cents").notNull().default(0), // list price incl. VAT
    stock: integer("stock").notNull().default(0),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    /** gross weight in grams (vinX Article.weight) — shipping labels */
    weightG: integer("weight_g"),
    /** bottle condition of the stock (vinX StockData.conditionId, Rarities add-in) — live price per condition */
    conditionId: integer("condition_id"),
  },
  (t) => [index("variants_product_idx").on(t.productId)],
);

/** Group / tier prices (net, excl. VAT) — typically imported from ERP price lists. */
export const prices = pgTable(
  "prices",
  {
    id: serial("id").primaryKey(),
    variantId: integer("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => customerGroups.id, { onDelete: "cascade" }),
    minQty: integer("min_qty").notNull().default(1),
    netCents: integer("net_cents").notNull(),
  },
  (t) => [index("prices_lookup_idx").on(t.variantId, t.groupId)],
);

export type CartItem = { variantId: number; qty: number };

export const carts = pgTable("carts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  items: jsonb("items").$type<CartItem[]>().notNull().default([]),
  couponCode: text("coupon_code"),
  ...timestamps,
});

export type Address = {
  company?: string;
  name: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  phone?: string;
};

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    number: text("number").notNull().unique(),
    token: text("token").notNull(),
    kind: text("kind", { enum: ["order", "request"] }).notNull().default("order"),
    userId: integer("user_id").references(() => users.id),
    groupId: integer("group_id"),
    isTrade: boolean("is_trade").notNull().default(false),
    email: text("email").notNull(),
    status: text("status", { enum: ["new", "confirmed", "processing", "shipped", "completed", "cancelled"] })
      .notNull()
      .default("new"),
    paymentMethod: text("payment_method").notNull(),
    paymentStatus: text("payment_status", { enum: ["pending", "paid", "failed"] }).notNull().default("pending"),
    paymentRef: text("payment_ref"),
    shippingMethod: text("shipping_method").notNull(),
    currency: text("currency").notNull().default("CHF"),
    subtotalNet: integer("subtotal_net").notNull().default(0),
    subtotalGross: integer("subtotal_gross").notNull().default(0),
    shippingGross: integer("shipping_gross").notNull().default(0),
    discountGross: integer("discount_gross").notNull().default(0),
    taxTotal: integer("tax_total").notNull().default(0),
    totalGross: integer("total_gross").notNull().default(0),
    couponCode: text("coupon_code"),
    billing: jsonb("billing").$type<Address>().notNull(),
    shipping: jsonb("shipping").$type<Address>(),
    notes: text("notes"),
    poNumber: text("po_number"),
    deliveryDate: text("delivery_date"),
    locale: text("locale").notNull().default("de"),
    erpId: text("erp_id"),
    erpStatus: text("erp_status", { enum: ["pending", "transferred", "failed"] }).notNull().default("pending"),
    storefrontId: integer("storefront_id"),
    /** shipping: carrier code (shop.fulfillment.carriers), tracking number, shipping label (PDF, base64; admin only) */
    carrier: text("carrier"),
    trackingNumber: text("tracking_number"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    shippingLabel: text("shipping_label"),
    /** statuses the customer was already e-mailed about (no duplicates when ERP sync and admin both set a status) */
    notified: jsonb("notified").$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [index("orders_user_idx").on(t.userId), index("orders_created_idx").on(t.createdAt)],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: integer("variant_id"),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    qty: integer("qty").notNull(),
    unitNet: integer("unit_net").notNull(),
    unitGross: integer("unit_gross").notNull(),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2, mode: "number" }).notNull(),
    lineGross: integer("line_gross").notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

/**
 * B2B conditions (Konditionen) — evaluated by lib/conditions.ts.
 * source = "platform" (maintained in admin) | "vinx" | any other ERP connector id; synced rows carry erpId.
 */
export const conditions = pgTable(
  "conditions",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull().default("platform"),
    erpId: text("erp_id"),
    type: text("type", { enum: ["special_price", "promotion_price", "customer_discount", "quantity_discount", "promotion_discount", "free_goods"] }).notNull(),
    customerId: integer("customer_id").references(() => users.id, { onDelete: "cascade" }),
    groupId: integer("group_id").references(() => customerGroups.id, { onDelete: "cascade" }),
    targetType: text("target_type", { enum: ["all", "product", "variant", "category", "producer", "discount_group"] }).notNull().default("all"),
    target: text("target"),
    calc: text("calc", { enum: ["percent", "amount_per_unit", "fixed_price", "n_for_m"] }).notNull().default("percent"),
    value: numeric("value", { precision: 12, scale: 2 }).notNull().default("0"),
    minQty: integer("min_qty").notNull().default(0),
    minAmountCents: integer("min_amount_cents").notNull().default(0),
    buyQty: integer("buy_qty").notNull().default(0),
    payQty: integer("pay_qty").notNull().default(0),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validTo: timestamp("valid_to", { withTimezone: true }),
    onNetPrices: boolean("on_net_prices").notNull().default(false),
    label: jsonb("label").$type<Localized>(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conditions_customer_idx").on(t.customerId), index("conditions_group_idx").on(t.groupId), uniqueIndex("conditions_erp_idx").on(t.source, t.erpId)],
);

export const coupons = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  type: text("type", { enum: ["percent", "fixed"] }).notNull().default("percent"),
  value: integer("value").notNull(),
  minTotalCents: integer("min_total_cents").notNull().default(0),
  consumerOnly: boolean("consumer_only").notNull().default(true),
  active: boolean("active").notNull().default(true),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

/** Contact messages, trade applications from visitors, sample requests … */
export const inquiries = pgTable("inquiries", {
  id: serial("id").primaryKey(),
  kind: text("kind", { enum: ["contact", "trade", "sample", "newsletter"] }).notNull(),
  email: text("email").notNull(),
  data: jsonb("data").$type<Record<string, string>>().notNull().default({}),
  status: text("status", { enum: ["open", "done"] }).notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Editable pages (legal, about …): markdown per locale. */
export const pages = pgTable("pages", {
  id: serial("id").primaryKey(),
  /** unique per storefront (see the index below); a storefront page replaces the main page with the same slug */
  slug: text("slug").notNull(),
  storefrontId: integer("storefront_id"),
  title: jsonb("title").$type<Localized>().notNull(),
  body: jsonb("body").$type<Localized>().notNull(),
  /** page builder blocks (lib/blocks.ts); when set, they replace the markdown body */
  blocks: jsonb("blocks").$type<Block[]>(),
  showInFooter: boolean("show_in_footer").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("pages_slug_sf_idx").on(t.slug, sql`coalesce(${t.storefrontId}, 0)`)]);

/** Reliable ERP hand-off: every outbound message is persisted and retried. */
export const erpOutbox = pgTable(
  "erp_outbox",
  {
    id: serial("id").primaryKey(),
    type: text("type", { enum: ["order", "customer"] }).notNull(),
    refId: integer("ref_id").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status", { enum: ["pending", "retry", "sent", "failed"] }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("outbox_status_idx").on(t.status, t.nextAttemptAt)],
);

export const syncLog = pgTable("sync_log", {
  id: serial("id").primaryKey(),
  job: text("job").notNull(),
  status: text("status", { enum: ["running", "ok", "error", "partial"] }).notNull(),
  items: integer("items").notNull().default(0),
  message: text("message"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

/** Request limits shared by all instances (serverless): key = SHA-256 of e.g. "login|<ip>|<email>" */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

/** Admin activity log: who did what, when (no form values — only the kind of action and the record concerned) */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    userId: integer("user_id"),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    path: text("path"),
  },
  (t) => [index("audit_at_idx").on(t.at), index("audit_entity_idx").on(t.entity, t.entityId)],
);
