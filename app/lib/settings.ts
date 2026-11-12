import { z } from "zod";
import { LOCALES } from "./localized";

void LOCALES;

/**
 * White-label configuration. Everything brand- or tenant-specific is here and
 * editable in Admin. Defaults are neutral; the demo seed applies a brand.
 */

const loc = z.object({ de: z.string().optional(), it: z.string().optional(), fr: z.string().optional(), en: z.string().optional() });
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Hex colour, e.g. #561f0d");
const url = z.string().max(2000).default("");

// ── Fonts: curated pairs loaded from Bunny Fonts (GDPR-friendly Google Fonts mirror) ──
export const DISPLAY_FONTS = [
  "Bodoni Moda", "Playfair Display", "Cormorant Garamond", "Fraunces", "DM Serif Display",
  "Libre Caslon Text", "Marcellus", "Cinzel", "Inter", "Montserrat",
] as const;
export const BODY_FONTS = ["Montserrat", "Inter", "DM Sans", "Lato", "Source Sans 3", "Work Sans", "Nunito Sans", "Jost"] as const;

export const brandSchema = z.object({
  name: z.string().min(1).max(80).default("Your Shop"),
  legalName: z.string().max(120).default(""),
  tagline: loc.default({}),
  claim: z.string().max(60).default(""), // small line under logo, e.g. "Since 1917"
  logoUrl: url,
  logoInverseUrl: url,
  faviconUrl: url,
  colors: z
    .object({
      background: hex.default("#f7f5f2"),
      foreground: hex.default("#1c1917"),
      primary: hex.default("#1c1917"),
      primaryForeground: hex.default("#ffffff"),
      muted: hex.default("#eeeae5"),
      mutedForeground: hex.default("#6b6460"),
      accent: hex.default("#c9b8a8"),
      border: hex.default("#e2dcd5"),
      card: hex.default("#ffffff"),
      inverse: hex.default("#1c1917"), // footer / dark sections
      inverseForeground: hex.default("#f7f5f2"),
    })
    .prefault({}),
  fonts: z
    .object({
      display: z.enum(DISPLAY_FONTS).default("Fraunces"),
      body: z.enum(BODY_FONTS).default("Inter"),
      displayUppercaseEyebrows: z.boolean().default(true),
    })
    .prefault({}),
  radius: z.number().min(0).max(24).default(6),
  buttonStyle: z.enum(["square", "rounded", "pill"]).default("rounded"),
  contact: z
    .object({
      street: z.string().default(""),
      zip: z.string().default(""),
      city: z.string().default(""),
      country: z.string().default(""),
      phone: z.string().default(""),
      email: z.string().default(""),
      uid: z.string().default(""),
      hours: z.array(z.object({ label: loc, value: z.string() })).default([]),
      mapUrl: url,
    })
    .prefault({}),
  social: z.object({ instagram: url, facebook: url, linkedin: url }).prefault({}),
  announcement: loc.default({}),
  footerQuote: loc.default({}),
});

const shippingMethodSchema = z.object({
  code: z.string().regex(/^[a-z0-9_-]+$/),
  label: loc,
  description: loc.default({}),
  priceCents: z.number().int().min(0).default(0),
  /** [minUnits, priceCents] steps — overrides priceCents */
  rates: z.array(z.tuple([z.number().int().min(1), z.number().int().min(0)])).default([]),
  freeFromCents: z.number().int().min(0).nullable().default(null),
  audience: z.enum(["all", "consumer", "trade"]).default("all"),
  minUnits: z.number().int().min(0).default(0),
});

export const shopSchema = z.object({
  locales: z.array(z.enum(LOCALES)).min(1).default(["de"]),
  defaultLocale: z.enum(LOCALES).default("de"),
  currency: z.string().length(3).default("CHF"),
  /** Who sees prices. Hidden prices turn checkout into a quote request. */
  priceVisibility: z.enum(["public", "login", "trade"]).default("public"),
  consumerCheckout: z.boolean().default(true), // false = trade-only shop (order requests)
  guestCheckout: z.boolean().default(true),
  stockDisplay: z.enum(["levels", "exact", "hidden"]).default("levels"),
  stockLow: z.number().int().min(0).default(12),
  stockHigh: z.number().int().min(0).default(60),
  ageGate: z.boolean().default(true),
  minAge: z.number().int().min(16).max(21).default(18),
  orderPrefix: z.string().max(8).default("WS"),
  notifyEmail: z.string().default(""),
  tax: z.object({ standard: z.number().default(8.1), reduced: z.number().default(2.6) }).prefault({}),
  cashRounding: z.number().int().min(1).max(100).default(5), // 5 = Swiss 5-Rappen rounding
  shipping: z.array(shippingMethodSchema).default([
    { code: "post", label: { de: "Postversand", en: "Postal delivery", it: "Spedizione postale", fr: "Envoi postal" }, description: {}, priceCents: 1200, rates: [[1, 1200], [7, 1800], [13, 2600]], freeFromCents: 25000, audience: "all", minUnits: 0 },
    { code: "pickup", label: { de: "Abholung", en: "Pick-up", it: "Ritiro", fr: "Retrait" }, description: {}, priceCents: 0, rates: [], freeFromCents: null, audience: "all", minUnits: 0 },
  ]),
  payments: z
    .object({
      invoice: z.object({ enabled: z.boolean().default(true), tradeOnly: z.boolean().default(true), termsDays: z.number().int().default(30) }).prefault({}),
      prepayment: z.object({ enabled: z.boolean().default(true), holder: z.string().default(""), iban: z.string().default(""), bank: z.string().default("") }).prefault({}),
      stripe: z.object({ enabled: z.boolean().default(false) }).prefault({}),
    })
    .prefault({}),
  trade: z
    .object({
      requireUid: z.boolean().default(true),
      defaultGroup: z.string().default("trade"),
      quickOrder: z.boolean().default(true),
      priceListExport: z.boolean().default(true),
    })
    .prefault({}),
});

const linkSchema = z.object({ label: loc, href: z.string().default("/") });
export const homeSchema = z.object({
  hero: z
    .object({
      eyebrow: loc.default({}),
      title: loc.default({ de: "Willkommen", en: "Welcome" }),
      text: loc.default({}),
      imageUrl: url,
      primary: linkSchema.default({ label: { de: "Zum Shop", en: "Shop now" }, href: "/shop" }),
      secondary: linkSchema.nullable().default(null),
    })
    .prefault({}),
  stats: z.array(z.object({ value: z.string(), label: loc })).max(4).default([]),
  categories: z.object({ title: loc.default({}), show: z.boolean().default(true) }).prefault({}),
  promo: z.object({ show: z.boolean().default(true), eyebrow: loc.default({}), title: loc.default({}), text: loc.default({}) }).prefault({}),
  spotlight: z
    .object({
      show: z.boolean().default(false),
      productSlug: z.string().default(""),
      eyebrow: loc.default({}),
      bullets: z.array(loc).default([]),
      note: loc.default({}),
    })
    .prefault({}),
  story: z
    .object({ show: z.boolean().default(false), eyebrow: loc.default({}), title: loc.default({}), text: loc.default({}), imageUrl: url, link: linkSchema.nullable().default(null) })
    .prefault({}),
  brands: z.object({ show: z.boolean().default(true), title: loc.default({}) }).prefault({}),
  values: z.object({ title: loc.default({}), items: z.array(z.object({ icon: z.string().default("sparkles"), title: loc, text: loc })).default([]) }).prefault({}),
});

export const tradeSchema = z.object({
  eyebrow: loc.default({}),
  title: loc.default({}),
  text: loc.default({}),
  servicesTitle: loc.default({}),
  services: z.array(z.object({ title: loc, text: loc })).default([]),
  stepsTitle: loc.default({}),
  steps: z.array(z.object({ title: loc, text: loc })).default([]),
  formTitle: loc.default({}),
  formText: loc.default({}),
  promises: z.array(loc).default([]),
});

export const storySchema = z.object({
  eyebrow: loc.default({}),
  title: loc.default({}),
  intro: loc.default({}),
  timeline: z.array(z.object({ year: z.string(), title: loc, text: loc })).default([]),
  quote: loc.default({}),
  imageUrl: url,
});

export const vinxSchema = z.object({
  enabled: z.boolean().default(true),
  /** rest3 = official vinX REST3 "Shop V2.0" API · csv = file exchange · mock = demo */
  driver: z.enum(["mock", "rest3", "csv"]).default("mock"),
  baseUrl: url, // e.g. https://vinx.example.ch  (demo: https://vinxapi.i-ag.ch)
  apiVersion: z.enum(["v1.0", "v2.0"]).default("v2.0"),
  username: z.string().default(""), // password: env VINX_PASSWORD
  pageSize: z.number().int().min(10).max(1000).default(200),
  /** Live B2B pricing via Calculated/ProductInfo (customer-specific incl. promotions). */
  livePrices: z.boolean().default(true),
  /** Authoritative cart calculation via Online/Basket action=calculate (conditions, deposits, LSVA, freight). */
  liveBasket: z.boolean().default(true),
  /** Price group used for guests/consumers (BaseData/PriceGroup id). */
  consumerPriceGroupId: z.number().int().nullable().default(null),
  /** vinX article used to transmit shop vouchers as negative position (priceCalculationRule "fromShop"). */
  promoArticleId: z.number().int().nullable().default(null),
  /** Shop shipping code → vinX ShippingCode id (0 = generic delivery). */
  shippingCodeMap: z.record(z.string(), z.number().int()).default({ post: 0, delivery: 0 }),
  /** OData field used for delta sync. */
  modifiedField: z.string().default("modifiedDate"),
  /** vinX article entity field → shop field. Verify against <baseUrl>/swagger (installations may differ). */
  mapping: z
    .object({
      article: z.record(z.string(), z.string()).default({
        erpId: "id", sku: "number", name: "designation", name_fr: "designationFr", name_it: "designationIt", name_en: "designationEn",
        product: "wineInfoId", producer: "producer.name", category: "articleCategory.designation", vintage: "vintage", size: "contentDesignation",
        volumeCl: "contentCl", alcohol: "alcoholContent", color: "wineColor", price: "salesPrice", taxCode: "vatCode", packSize: "packagingUnit",
        stock: "", active: "isShopArticle", articleType: "articleType", country: "country.designation", region: "region.designation", grapes: "grapeVariety",
      }),
      stock: z.record(z.string(), z.string()).default({ sku: "articleId", stock: "availableQuantity" }),
      price: z.record(z.string(), z.string()).default({ sku: "articleId", list: "priceGroupId", minQty: "quantity", net: "price", promo: "pricePromotion" }),
      colors: z.record(z.string(), z.string()).default({ Rot: "red", Weiss: "white", "Rosé": "rose", Schaumwein: "sparkling", "Süsswein": "sweet", red: "red", white: "white" }),
      taxCodes: z.record(z.string(), z.string()).default({ N: "standard", R: "reduced", "1": "standard", "2": "reduced" }),
      /** vinX Artikeltyp → shop kind (2 Wein, 3 Mineral/Saft, 4 Bier, 5 Spirituosen, 10 Food, 12 Non-Food) */
      articleTypes: z.record(z.string(), z.string()).default({ "2": "wine", "3": "beverage", "4": "beverage", "5": "spirit", "10": "food", "12": "food" }),
    })
    .prefault({}),
  ownedFields: z.array(z.string()).default(["price", "stock", "vintage", "size", "active", "taxClass", "packSize"]),
  /** vinX price group id (or code) → shop customer group code */
  groupMap: z.record(z.string(), z.string()).default({ "1": "consumer", "2": "trade", "3": "gastro" }),
  pushOrders: z.boolean().default(true),
  pushCustomers: z.boolean().default(true),
  maxAttempts: z.number().int().default(8),
});

export const SETTINGS = {
  brand: brandSchema,
  shop: shopSchema,
  home: homeSchema,
  trade: tradeSchema,
  story: storySchema,
  vinx: vinxSchema,
} as const;
export type SettingsKey = keyof typeof SETTINGS;
export type Settings = { [K in SettingsKey]: z.infer<(typeof SETTINGS)[K]> };
export type Brand = Settings["brand"];
export type Shop = Settings["shop"];
export type ShippingMethod = Shop["shipping"][number];

export function parseSettings<K extends SettingsKey>(key: K, value: unknown): Settings[K] {
  const r = SETTINGS[key].safeParse(value ?? {});
  return (r.success ? r.data : SETTINGS[key].parse({})) as Settings[K];
}
