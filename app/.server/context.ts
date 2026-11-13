import { eq } from "drizzle-orm";
import { createContext } from "react-router";
import type { PriceGroup } from "~/lib/pricing";
import { canSeePrices } from "~/lib/pricing";
import type { Locale } from "~/lib/localized";
import { isLocale } from "~/lib/localized";
import type { Brand, Shop } from "~/lib/settings";
import { getT, type T } from "~/lib/i18n";
import { isPortalPath, type ChannelMode } from "~/lib/channel";
import { getSession, getUser, type SessionUser } from "./auth";
import { getDb, schema } from "./db";
import { getScopedSettings } from "./settings";
import { resolveStorefront, type Storefront } from "./storefronts";

/** Request-scoped data, set once by root middleware and read by every loader/action. */
export type ShopContext = {
  user: SessionUser;
  group: PriceGroup | null;
  isTrade: boolean;
  showPrices: boolean;
  locale: Locale;
  t: T;
  brand: Brand;
  shop: Shop;
  /** the storefront serving this request (own domain / preview); null = main shop */
  storefront: Storefront | null;
  /** vinX article ids of the customer's own assortment (vinx.customerAssortments), null = no restriction */
  assortment: string[] | null;
  channel: {
    mode: ChannelMode;
    /** this request is served by the B2B portal */
    portal: boolean;
    /** the portal exists in this configuration */
    portalEnabled: boolean;
    /** approved trade account that may use the portal */
    canUsePortal: boolean;
  };
};

export const shopContext = createContext<ShopContext>();

export async function buildShopContext(request: Request): Promise<ShopContext> {
  const storefront = await resolveStorefront(request);
  const [{ brand, shop }, user, session] = await Promise.all([getScopedSettings(storefront?.slug, "brand", "shop"), getUser(request), getSession(request)]);
  const url = new URL(request.url);

  const candidates = [url.searchParams.get("lang"), session.get("locale"), ...acceptLanguages(request)];
  const locale = (candidates.find((c) => isLocale(c) && shop.locales.includes(c)) as Locale | undefined) ?? shop.defaultLocale;

  const mode = shop.channels.mode;
  const portal = isPortalPath(url.pathname);
  const portalEnabled = mode !== "shop-only";
  const approved = !!user?.group?.isTrade && user.tradeStatus === "approved";
  // "separate": the B2C storefront never applies trade conditions — those live in the portal.
  const approvedTrade = approved && (mode !== "separate" || portal);
  let g = user?.group && (approvedTrade || !user.group.isTrade) ? user.group : null;
  // a storefront may price guests and its customers without a group through its own customer group (e.g. its ERP price list)
  if (!g && storefront?.guestGroupId) {
    const db = await getDb();
    const sg = await db.query.customerGroups.findFirst({ where: eq(schema.customerGroups.id, storefront.guestGroupId) });
    if (sg && !sg.isTrade) g = sg;
  }
  const group: PriceGroup | null = g
    ? { id: g.id, isTrade: g.isTrade, showNet: g.showNet, discountPct: Number(g.discountPct), minOrderCents: g.minOrderCents }
    : null;

  return {
    user,
    group,
    isTrade: approvedTrade,
    // The portal always shows the customer's own prices; the storefront follows the visibility setting.
    showPrices: portal ? approvedTrade : canSeePrices(shop.priceVisibility, user, approvedTrade),
    locale,
    t: getT(locale),
    brand,
    shop,
    storefront,
    assortment: await customerAssortment(user),
    channel: { mode, portal, portalEnabled, canUsePortal: portalEnabled && approved },
  };
}

function acceptLanguages(request: Request): string[] {
  return (request.headers.get("Accept-Language") ?? "")
    .split(",")
    .map((p) => p.trim().slice(0, 2).toLowerCase())
    .filter(Boolean);
}

/** Customer-specific assortment from vinX (Address.selectionCodeId → ArticleSelectionCode), cached per selection. */
const assortmentCache = new Map<number, { at: number; ids: string[] }>();
async function customerAssortment(user: SessionUser): Promise<string[] | null> {
  const sel = user?.erpInfo?.selectionCodeId;
  if (!sel) return null;
  const { getSetting } = await import("./settings");
  const cfg = await getSetting("vinx");
  if (!cfg.enabled || !cfg.customerAssortments) return null;
  const hit = assortmentCache.get(sel);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.ids;
  try {
    const { erpClient } = await import("./vinx/sync");
    const client = await erpClient(cfg);
    if (!client.assortment) return null;
    const ids = [...(await client.assortment(String(sel)))];
    assortmentCache.set(sel, { at: Date.now(), ids });
    return ids.length ? ids : null;
  } catch {
    return hit?.ids ?? null; // ERP unreachable: last known assortment, else no restriction
  }
}
