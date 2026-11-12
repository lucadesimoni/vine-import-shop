import { createContext } from "react-router";
import type { PriceGroup } from "~/lib/pricing";
import { canSeePrices } from "~/lib/pricing";
import type { Locale } from "~/lib/localized";
import { isLocale } from "~/lib/localized";
import type { Brand, Shop } from "~/lib/settings";
import { getT, type T } from "~/lib/i18n";
import { getSession, getUser, type SessionUser } from "./auth";
import { getSettings } from "./settings";

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
};

export const shopContext = createContext<ShopContext>();

export async function buildShopContext(request: Request): Promise<ShopContext> {
  const [{ brand, shop }, user, session] = await Promise.all([getSettings("brand", "shop"), getUser(request), getSession(request)]);
  const url = new URL(request.url);

  const candidates = [url.searchParams.get("lang"), session.get("locale"), ...acceptLanguages(request)];
  const locale = (candidates.find((c) => isLocale(c) && shop.locales.includes(c)) as Locale | undefined) ?? shop.defaultLocale;

  const approvedTrade = !!user?.group?.isTrade && user.tradeStatus === "approved";
  const g = user?.group && (approvedTrade || !user.group.isTrade) ? user.group : null;
  const group: PriceGroup | null = g
    ? { id: g.id, isTrade: g.isTrade, showNet: g.showNet, discountPct: Number(g.discountPct), minOrderCents: g.minOrderCents }
    : null;

  return {
    user,
    group,
    isTrade: approvedTrade,
    showPrices: canSeePrices(shop.priceVisibility, user, approvedTrade),
    locale,
    t: getT(locale),
    brand,
    shop,
  };
}

function acceptLanguages(request: Request): string[] {
  return (request.headers.get("Accept-Language") ?? "")
    .split(",")
    .map((p) => p.trim().slice(0, 2).toLowerCase())
    .filter(Boolean);
}
