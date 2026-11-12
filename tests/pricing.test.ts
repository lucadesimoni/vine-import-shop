import { describe, expect, it } from "vitest";
import { canSeePrices, computeTotals, priceFor, stockLevel } from "~/lib/pricing";
import { formatMoney, parseMoneyInput, roundCash } from "~/lib/money";
import { parseSettings } from "~/lib/settings";

const trade = { id: 2, isTrade: true, showNet: true, discountPct: 15, minOrderCents: 30000 };
const shipping = parseSettings("shop", {}).shipping;

describe("priceFor", () => {
  it("consumer sees list price incl. VAT", () => {
    const p = priceFor({ listGross: 6900, taxRate: 8.1, group: null });
    expect(p.gross).toBe(6900);
    expect(p.net).toBe(Math.round(6900 / 1.081));
    expect(p.displayMode).toBe("gross");
  });
  it("applies the highest matching quantity tier", () => {
    const tiers = [{ minQty: 1, netCents: 5000 }, { minQty: 12, netCents: 4700 }, { minQty: 60, netCents: 4400 }];
    expect(priceFor({ listGross: 6900, taxRate: 8.1, group: trade, tiers, qty: 11 }).net).toBe(5000);
    expect(priceFor({ listGross: 6900, taxRate: 8.1, group: trade, tiers, qty: 12 }).net).toBe(4700);
    expect(priceFor({ listGross: 6900, taxRate: 8.1, group: trade, tiers, qty: 100 }).net).toBe(4400);
  });
  it("falls back to group discount without tiers and displays net for trade", () => {
    const p = priceFor({ listGross: 2400, taxRate: 2.6, group: trade });
    expect(p.net).toBe(Math.round(Math.round(2400 / 1.026) * 0.85));
    expect(p.display).toBe(p.net);
    expect(p.reduced).toBe(true);
  });
});

describe("computeTotals", () => {
  const lines = [
    { key: 1, qty: 2, listGross: 6900, taxRate: 8.1, tiers: [] },
    { key: 2, qty: 1, listGross: 2400, taxRate: 2.6, tiers: [] },
  ];
  it("sums, reports both VAT rates and rounds to 5 Rappen", () => {
    const t = computeTotals({ lines, group: null, shipping, shippingCode: "post", standardRate: 8.1, cashRounding: 5 });
    expect(t.subtotalGross).toBe(16200);
    expect(t.shippingGross).toBe(1200);
    expect(Object.keys(t.taxes).sort()).toEqual(["2.6", "8.1"]);
    expect(t.totalGross % 5).toBe(0);
  });
  it("free shipping above threshold", () => {
    const t = computeTotals({ lines: [{ ...lines[0], qty: 4 }], group: null, shipping, shippingCode: "post", standardRate: 8.1, cashRounding: 5 });
    expect(t.shippingGross).toBe(0);
  });
  it("percent coupon, not for trade when consumerOnly", () => {
    const coupon = { code: "X", type: "percent" as const, value: 10, minTotalCents: 0, consumerOnly: true, expiresAt: null };
    expect(computeTotals({ lines, group: null, shipping, coupon, standardRate: 8.1, cashRounding: 5 }).discount).toBe(1620);
    expect(computeTotals({ lines, group: trade, shipping, coupon, standardRate: 8.1, cashRounding: 5 }).coupon).toBeNull();
  });
  it("flags trade minimum order", () => {
    expect(computeTotals({ lines, group: trade, shipping, standardRate: 8.1, cashRounding: 5 }).belowMinimum).toBe(true);
  });
  it("empty cart has zero total and no shipping", () => {
    const t = computeTotals({ lines: [], group: null, shipping, standardRate: 8.1, cashRounding: 5 });
    expect(t.totalGross).toBe(0);
    expect(t.shippingGross).toBe(0);
  });
});

describe("helpers", () => {
  it("stock levels", () => {
    expect([0, 5, 30, 200].map((n) => stockLevel(n, 12, 60))).toEqual(["out", "few", "available", "plenty"]);
  });
  it("price visibility", () => {
    expect(canSeePrices("public", null, false)).toBe(true);
    expect(canSeePrices("login", null, false)).toBe(false);
    expect(canSeePrices("trade", { id: 1 }, false)).toBe(false);
    expect(canSeePrices("trade", { id: 1 }, true)).toBe(true);
  });
  it("money", () => {
    expect(roundCash(1233)).toBe(1235);
    expect(roundCash(1232)).toBe(1230);
    expect(parseMoneyInput("1'234,50")).toBe(123450);
    expect(formatMoney(123450, "CHF", "de")).toMatch(/1.234\.50/);
  });
});
