import { useLocation } from "react-router";

/**
 * Sales channels.
 * - combined:    one storefront for everyone; approved trade customers additionally get the B2B portal.
 * - separate:    storefront is the B2C shop (consumer prices only); trade customers order in the portal.
 * - portal-only: pure B2B — every storefront page leads into the portal.
 * - shop-only:   no portal; trade customers use the storefront (account area, quick order).
 */
export const CHANNEL_MODES = ["combined", "separate", "portal-only", "shop-only"] as const;
export type ChannelMode = (typeof CHANNEL_MODES)[number];

export const PORTAL = "/portal";

export const isPortalPath = (pathname: string) => pathname === PORTAL || pathname.startsWith(`${PORTAL}/`);

/** Maps a storefront path to its portal counterpart (or keeps it). Query strings are preserved. */
const EXACT: Record<string, string> = {
  "/account": "/portal/orders",
  "/account/quick-order": "/portal/quick-order",
  "/order-list": "/portal/order-list",
  "/checkout": "/portal/checkout",
  "/shop": "/portal/catalog",
  "/login": "/portal/login",
  "/": "/portal",
};
const PREFIX: [string, string][] = [
  ["/account/orders/", "/portal/orders/"],
  ["/checkout/done/", "/portal/checkout/done/"],
  ["/product/", "/portal/product/"],
];

export function channelPath(path: string, portal: boolean): string {
  if (!portal || isPortalPath(path)) return path;
  const [p, q] = splitQuery(path);
  if (EXACT[p]) return EXACT[p] + q;
  for (const [from, to] of PREFIX) if (p.startsWith(from)) return to + p.slice(from.length) + q;
  return path;
}

function splitQuery(path: string): [string, string] {
  const i = path.search(/[?#]/);
  return i < 0 ? [path, ""] : [path.slice(0, i), path.slice(i)];
}

/** Channel-aware link builder for components shared by storefront and portal. */
export function usePath() {
  const portal = isPortalPath(useLocation().pathname);
  return Object.assign((path: string) => channelPath(path, portal), { portal });
}
