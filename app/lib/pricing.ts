import { roundCash } from "./money";
import type { ShippingMethod } from "./settings";

/**
 * Pure pricing & totals — no I/O, fully unit-tested (tests/pricing.test.ts).
 *
 *  - list price  = variant.priceCents, incl. VAT (what consumers see)
 *  - group tiers = net prices per customer group with min quantities (ERP price lists)
 *  - fallback    = group.discountPct off the net list price
 */

export type PriceGroup = { id: number; isTrade: boolean; showNet: boolean; discountPct: number; minOrderCents: number };
export type Tier = { minQty: number; netCents: number };

export type PriceInfo = {
  net: number;
  gross: number;
  listGross: number;
  listNet: number;
  taxRate: number;
  reduced: boolean;
  /** what to show: net for trade groups with showNet, else gross */
  display: number;
  displayMode: "net" | "gross";
  tiers: Tier[];
};

export function netFromGross(gross: number, rate: number) {
  return Math.round(gross / (1 + rate / 100));
}
export function grossFromNet(net: number, rate: number) {
  return Math.round(net * (1 + rate / 100));
}

export function priceFor(args: { listGross: number; taxRate: number; group: PriceGroup | null; tiers?: Tier[]; qty?: number }): PriceInfo {
  const { listGross, taxRate, group } = args;
  const qty = args.qty ?? 1;
  const tiers = [...(args.tiers ?? [])].sort((a, b) => a.minQty - b.minQty);
  const listNet = netFromGross(listGross, taxRate);
  let net = listNet;

  const tier = tiers.filter((t) => qty >= t.minQty).at(-1);
  if (tier) net = tier.netCents;
  else if (group && group.discountPct > 0) net = Math.round(listNet * (1 - group.discountPct / 100));

  const gross = net === listNet ? listGross : grossFromNet(net, taxRate);
  const displayMode = group?.isTrade && group.showNet ? "net" : "gross";
  return { net, gross, listGross, listNet, taxRate, reduced: net < listNet, display: displayMode === "net" ? net : gross, displayMode, tiers };
}

export type LineInput = { key: number; qty: number; listGross: number; taxRate: number; tiers: Tier[]; units?: number };
export type Coupon = { code: string; type: "percent" | "fixed"; value: number; minTotalCents: number; consumerOnly: boolean; expiresAt: Date | null };

export type Totals = {
  lines: { key: number; qty: number; price: PriceInfo; lineNet: number; lineGross: number }[];
  units: number;
  subtotalNet: number;
  subtotalGross: number;
  discount: number;
  coupon: Coupon | null;
  shippingOptions: { method: ShippingMethod; price: number; available: boolean }[];
  shippingCode: string;
  shippingGross: number;
  taxes: Record<string, number>;
  taxTotal: number;
  totalGross: number;
  displayMode: "net" | "gross";
  minOrderCents: number;
  belowMinimum: boolean;
};

export function shippingPrice(m: ShippingMethod, units: number, subtotalGross: number): number {
  let price = m.priceCents;
  for (const [min, p] of m.rates) if (units >= min) price = p;
  if (m.freeFromCents != null && subtotalGross >= m.freeFromCents) price = 0;
  return price;
}

export function computeTotals(args: {
  lines: LineInput[];
  group: PriceGroup | null;
  shipping: ShippingMethod[];
  shippingCode?: string | null;
  coupon?: Coupon | null;
  standardRate: number;
  cashRounding: number;
  now?: Date;
}): Totals {
  const { group, standardRate } = args;
  const isTrade = !!group?.isTrade;
  const taxes: Record<string, number> = {};
  let subtotalNet = 0;
  let subtotalGross = 0;
  let units = 0;

  const lines = args.lines.map((l) => {
    const price = priceFor({ listGross: l.listGross, taxRate: l.taxRate, group, tiers: l.tiers, qty: l.qty });
    const lineNet = price.net * l.qty;
    const lineGross = price.gross * l.qty;
    subtotalNet += lineNet;
    subtotalGross += lineGross;
    units += l.qty * (l.units ?? 1);
    taxes[String(l.taxRate)] = (taxes[String(l.taxRate)] ?? 0) + (lineGross - lineNet);
    return { key: l.key, qty: l.qty, price, lineNet, lineGross };
  });

  // Coupon
  let coupon = args.coupon ?? null;
  let discount = 0;
  if (coupon) {
    const now = args.now ?? new Date();
    const valid = coupon && (!coupon.expiresAt || coupon.expiresAt >= now) && subtotalGross >= coupon.minTotalCents && !(coupon.consumerOnly && isTrade);
    if (valid) discount = coupon.type === "percent" ? Math.round((subtotalGross * coupon.value) / 100) : Math.min(subtotalGross, coupon.value);
    else coupon = null;
  }

  // Shipping
  const shippingOptions = args.shipping
    .filter((m) => m.audience === "all" || (m.audience === "trade") === isTrade)
    .map((method) => ({ method, price: shippingPrice(method, units, subtotalGross - discount), available: units >= method.minUnits }));
  const chosen = shippingOptions.find((o) => o.method.code === args.shippingCode && o.available) ?? shippingOptions.find((o) => o.available);
  const shippingGross = lines.length && chosen ? chosen.price : 0;
  if (shippingGross > 0) {
    const k = String(standardRate);
    taxes[k] = (taxes[k] ?? 0) + (shippingGross - netFromGross(shippingGross, standardRate));
  }

  // Discount reduces VAT proportionally
  if (discount > 0) {
    const base = subtotalGross + shippingGross;
    for (const k of Object.keys(taxes)) taxes[k] = Math.round(taxes[k] * (1 - discount / base));
  }

  const taxTotal = Object.values(taxes).reduce((a, b) => a + b, 0);
  const totalGross = lines.length ? roundCash(subtotalGross - discount + shippingGross, args.cashRounding) : 0;
  const minOrderCents = group?.minOrderCents ?? 0;

  return {
    lines,
    units,
    subtotalNet,
    subtotalGross,
    discount,
    coupon,
    shippingOptions,
    shippingCode: chosen?.method.code ?? "",
    shippingGross,
    taxes,
    taxTotal,
    totalGross,
    displayMode: group?.isTrade && group.showNet ? "net" : "gross",
    minOrderCents,
    belowMinimum: minOrderCents > 0 && subtotalNet < minOrderCents && lines.length > 0,
  };
}

export type StockLevel = "out" | "few" | "available" | "plenty";
export function stockLevel(stock: number, low: number, high: number): StockLevel {
  if (stock <= 0) return "out";
  if (stock < low) return "few";
  if (stock < high) return "available";
  return "plenty";
}

export type PriceVisibility = "public" | "login" | "trade";
export function canSeePrices(visibility: PriceVisibility, user: { id: number } | null, isTrade: boolean): boolean {
  if (visibility === "public") return true;
  if (visibility === "login") return !!user;
  return isTrade;
}
