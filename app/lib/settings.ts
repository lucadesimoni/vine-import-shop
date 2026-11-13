import { z } from "zod";
import { blocksSchema } from "./blocks";
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
  /** Button & chip label case — one rule for every size. */
  buttonCase: z.enum(["normal", "upper"]).default("normal"),
  /** Dark mode for shop & portal: off · follow the OS · OS default + visitor toggle */
  darkMode: z.enum(["off", "system", "toggle"]).default("toggle"),
  /** Optional manual dark palette (any key of `colors`); unset keys are derived from the light palette. */
  colorsDark: z.record(z.string(), hex).default({}),
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

/** Feature modules — switch the blueprint between business types (wine merchant, importer, winery, spirits, deli, brewery …). */
export const modulesSchema = z
  .object({
    producers: z.boolean().default(true), // producers / brands page incl. origin map
    story: z.boolean().default(true),
    trade: z.boolean().default(true), // B2B landing + application
    wineDetails: z.boolean().default(true), // vintage, grapes, appellation
    conditions: z.boolean().default(true), // B2B conditions engine
    coupons: z.boolean().default(true),
  })
  .prefault({});
export const PRODUCER_TERMS = ["producers", "winemakers", "brands", "makers", "suppliers"] as const;
export const TRADE_TERMS = ["gastronomy", "business", "resellers"] as const;
export const BUSINESS_PRESETS = ["importer", "merchant", "winery", "spirits", "deli", "beverages"] as const;

export const shopSchema = z.object({
  /** Business profile the modules were last set from (informational). */
  profile: z.enum(BUSINESS_PRESETS).default("importer"),
  modules: modulesSchema,
  terms: z
    .object({ producers: z.enum(PRODUCER_TERMS).default("producers"), trade: z.enum(TRADE_TERMS).default("gastronomy") })
    .prefault({}),
  /** Sales channels — see lib/channel.ts */
  channels: z
    .object({
      mode: z.enum(["combined", "separate", "portal-only", "shop-only"]).default("combined"),
      /** Optional dedicated hostname for the portal, e.g. b2b.example.ch — "/" there opens the portal. */
      portalHost: z.string().default(""),
      /** Optional hostname of the B2C shop, used for links from the portal in "separate" mode. */
      shopHost: z.string().default(""),
    })
    .prefault({}),
  locales: z.array(z.enum(LOCALES)).min(1).default(["de"]),
  defaultLocale: z.enum(LOCALES).default("de"),
  currency: z.string().length(3).default("CHF"),
  /** Origin map on the producers page: Italian-style region map, abstract world map, or automatic. */
  originMap: z
    .object({
      mode: z.enum(["auto", "regions", "world", "off"]).default("auto"),
      country: z.string().length(2).default("IT"),
      /** world map view (zoomable) on the producers page and as fallback in blocks; off = region maps + A–Z only */
      world: z.boolean().default(true),
    })
    .prefault({}),
  /** Who sees prices in the storefront (the portal always shows trade prices). Hidden prices turn checkout into a quote request. */
  priceVisibility: z.enum(["public", "login", "trade"]).default("public"),
  /** Where customer / customer-group prices come from — see .server/price-sources.ts */
  priceSource: z.string().default("platform"),
  /** vinX price finding: "priority" (special → promotion → list → base) or "lowest" (cheapest valid price) */
  priceFinding: z.enum(["priority", "lowest"]).default("priority"),
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
      /** Mollie (TWINT, cards, PostFinance …) — env MOLLIE_API_KEY. methods: restrict, e.g. ["twint","creditcard"] */
      mollie: z.object({ enabled: z.boolean().default(false), methods: z.array(z.string()).default([]) }).prefault({}),
      /** Datatrans (CH) — env DATATRANS_MERCHANT_ID, DATATRANS_PASSWORD, DATATRANS_HMAC_KEY, DATATRANS_ENV=production */
      datatrans: z.object({ enabled: z.boolean().default(false), methods: z.array(z.string()).default([]) }).prefault({}),
      /** Payrexx (CH: TWINT, PostFinance, cards) — env PAYREXX_INSTANCE, PAYREXX_API_SECRET */
      payrexx: z.object({ enabled: z.boolean().default(false), methods: z.array(z.string()).default([]) }).prefault({}),
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
  /** Page builder: when set, the home page is exactly these blocks (the classic fields above are the fallback / initial content). */
  blocks: blocksSchema.optional(),
});

export const tradeSchema = z.object({
  imageUrl: url,
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
  /** extra building blocks shown below the page */
  blocks: blocksSchema.default([]),
});

export const storySchema = z.object({
  eyebrow: loc.default({}),
  title: loc.default({}),
  intro: loc.default({}),
  timeline: z.array(z.object({ year: z.string(), title: loc, text: loc })).default([]),
  quote: loc.default({}),
  imageUrl: url,
  /** extra building blocks shown below the page */
  blocks: blocksSchema.default([]),
});

export const vinxSchema = z.object({
  enabled: z.boolean().default(true),
  /** rest3 = official vinX REST3 "Shop V2.0" API · csv = file exchange · mock = demo */
  /** ERP driver id from the extension registry (core: mock · rest3 · csv) */
  driver: z.string().default("mock"),
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
  /** vinX ArticleSelectionCode selection id of the e-commerce assortment (empty: all articles) */
  selectionCodeId: z.string().default(""),
  /** vinX article used to transmit shop vouchers as negative position (priceCalculationRule "fromShop"). */
  promoArticleId: z.number().int().nullable().default(null),
  /** OAuth client id for /api/Identity/Realm/RequestToken (I-AG default: "Integrated"). */
  clientId: z.string().default("Integrated"),
  /** Shop shipping code → vinX BaseData/DeliveryCondition id (required by Online/Basket). */
  deliveryConditionMap: z.record(z.string(), z.number().int()).default({}),
  defaultDeliveryConditionId: z.number().int().nullable().default(null),
  /** Shop payment method → vinX BaseData/PaymentCondition id (required by Online/Basket). */
  paymentConditionMap: z.record(z.string(), z.number().int()).default({}),
  defaultPaymentConditionId: z.number().int().nullable().default(null),
  /** Online/Basket only knows calculate | order: quote requests stay in the shop (skip) or are sent as orders flagged in orderText. */
  requestsToErp: z.enum(["skip", "order"]).default("skip"),
  /** OData field used for delta sync (BaseData/Article.changedOn). */
  modifiedField: z.string().default("changedOn"),
  /**
   * REST3 field mapping, verified against the Shop API v2.0 OpenAPI spec (<baseUrl>/swagger → "I-AG Standard Shop API v2.0").
   * The client enriches each article with its looked-up producer / region(Top) / country / category / filling / tradingUnit,
   * so nested paths below resolve. Paths may list fallbacks with "|".
   */
  mapping: z
    .object({
      article: z.record(z.string(), z.string()).default({
        erpId: "id", sku: "articleNumber", name: "designationWeb|designation", product: "wineId|articleNumber",
        producer: "producer.designation", category: "category.designation", vintage: "vintage", size: "filling.designation",
        volumeCl: "filling.contentInCl", alcohol: "volume", price: "", taxRate: "vatPercentage", packSize: "tradingUnit.unitsPerTradingUnit",
        active: "isActive", articleType: "articleType", country: "country.isoCode|country.designation", region: "regionTop.designation",
        appellation: "region.designation", grapes: "grapes", description: "description",
      }),
      stock: z.record(z.string(), z.string()).default({ sku: "articleId", stock: "quantityAvailableForShop" }),
      price: z.record(z.string(), z.string()).default({ sku: "articleId", list: "priceGroupId", minQty: "fromQuantity", net: "unitPrice", promo: "promotionPrice" }),
      colors: z.record(z.string(), z.string()).default({ Rot: "red", Weiss: "white", "Rosé": "rose", Schaumwein: "sparkling", "Süsswein": "sweet", red: "red", white: "white" }),
      taxCodes: z.record(z.string(), z.string()).default({ N: "standard", R: "reduced", "1": "standard", "2": "reduced" }),
      /** vinX ArticleCategoryKindV20 → shop kind */
      articleTypes: z.record(z.string(), z.string()).default({ wine: "wine", spirits: "spirit", mineral: "beverage", beer: "beverage", fruits: "beverage", food: "food", diverse: "food", nonFood: "food" }),
    })
    .prefault({}),
  /** Column headers of CSV/Excel exports (file-exchange driver). */
  csvMapping: z
    .object({
      article: z.record(z.string(), z.string()).default({
        erpId: "ArtikelID|ArtikelNr", sku: "ArtikelNr", name: "Bezeichnung", name_it: "Bezeichnung_IT", name_fr: "Bezeichnung_FR", product: "WeinID|ArtikelNr",
        producer: "Produzent", category: "Kategorie", vintage: "Jahrgang", size: "Abfuellung", volumeCl: "InhaltCl", alcohol: "Alkohol",
        price: "Preis", taxCode: "MWST", packSize: "Gebinde", active: "Aktiv", articleType: "Artikeltyp", country: "Land", region: "Region",
        appellation: "Unterregion", grapes: "Traubensorten", color: "Farbe", discountGroup: "Rabattgruppe",
      }),
      stock: z.record(z.string(), z.string()).default({ sku: "ArtikelNr", stock: "Bestand" }),
      price: z.record(z.string(), z.string()).default({ sku: "ArtikelNr", list: "Preisgruppe", minQty: "AbMenge", net: "Preis", promo: "Aktionspreis" }),
      colors: z.record(z.string(), z.string()).default({ Rot: "red", Weiss: "white", "Rosé": "rose", Schaumwein: "sparkling", "Süsswein": "sweet" }),
      taxCodes: z.record(z.string(), z.string()).default({ N: "standard", R: "reduced", "8.1": "standard", "2.6": "reduced" }),
      articleTypes: z.record(z.string(), z.string()).default({ Wein: "wine", Spirituosen: "spirit", Food: "food", Lebensmittel: "food", Getraenke: "beverage" }),
    })
    .prefault({}),
  /** Sync vinX SellingPrices promotions / SpecialPrices / SpecialCondition into the conditions table (source "vinx"). */
  syncConditions: z.boolean().default(true),
  ownedFields: z.array(z.string()).default(["price", "stock", "vintage", "size", "active", "taxClass", "packSize"]),
  /** vinX price group id (or code) → shop customer group code */
  groupMap: z.record(z.string(), z.string()).default({ "1": "consumer", "2": "trade", "3": "gastro" }),
  pushOrders: z.boolean().default(true),
  pushCustomers: z.boolean().default(true),
  /** Pull address changes made in vinX (BaseData/Address, changedOn) into linked shop customers. */
  pullCustomers: z.boolean().default(true),
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

/** One-click business profiles: sensible module + wording + channel defaults (everything stays editable). */
export const PRESETS: Record<(typeof BUSINESS_PRESETS)[number], { label: string; description: string; patch: Partial<Shop> }> = {
  importer: { label: "Wein- & Spezialitäten-Import (B2B + B2C)", description: "Gastronomie-Portal, Konditionen, Herkunftskarte, Privatkunden-Shop.", patch: { modules: { producers: true, story: true, trade: true, wineDetails: true, conditions: true, coupons: true }, terms: { producers: "producers", trade: "gastronomy" }, ageGate: true } },
  merchant: { label: "Weinhandlung (B2C-Fokus)", description: "Shop mit Winzern & Karte; Firmenkunden optional.", patch: { modules: { producers: true, story: true, trade: true, wineDetails: true, conditions: true, coupons: true }, terms: { producers: "winemakers", trade: "business" }, ageGate: true } },
  winery: { label: "Weingut (eigene Produktion)", description: "Keine Produzenten-Seite, Fokus auf Geschichte & Jahrgänge.", patch: { modules: { producers: false, story: true, trade: true, wineDetails: true, conditions: true, coupons: true }, terms: { producers: "winemakers", trade: "resellers" }, ageGate: true } },
  spirits: { label: "Spirituosen", description: "Marken statt Winzer, ohne Jahrgangsangaben, Weltkarte der Herkunft.", patch: { modules: { producers: true, story: true, trade: true, wineDetails: false, conditions: true, coupons: true }, terms: { producers: "brands", trade: "gastronomy" }, ageGate: true } },
  deli: { label: "Feinkost & Delikatessen", description: "Manufakturen, keine Alterskontrolle, keine Weinangaben.", patch: { modules: { producers: true, story: true, trade: true, wineDetails: false, conditions: true, coupons: true }, terms: { producers: "makers", trade: "resellers" }, ageGate: false } },
  beverages: { label: "Getränkehandel / Brauerei", description: "Marken, Gastronomie-Konditionen, ohne Weinangaben.", patch: { modules: { producers: true, story: false, trade: true, wineDetails: false, conditions: true, coupons: false }, terms: { producers: "brands", trade: "gastronomy" }, ageGate: true } },
};
