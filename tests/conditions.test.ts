import { describe, expect, it } from "vitest";
import { applyConditions, type ConditionRule, type PriceFacts } from "~/lib/conditions";

const facts: PriceFacts = { productId: 10, variantId: 100, categoryIds: [3, 1], producerId: 7, discountGroup: "WEIN" };
let id = 0;
const rule = (r: Partial<ConditionRule>): ConditionRule => ({
  id: ++id, type: "customer_discount", customerId: null, groupId: null, targetType: "all", target: null, calc: "percent", value: 0,
  minQty: 0, minAmountCents: 0, buyQty: 0, payQty: 0, validFrom: null, validTo: null, onNetPrices: false, label: "", source: "platform", ...r,
});

describe("conditions engine (vinX price finding)", () => {
  it("no rules → list price", () => {
    expect(applyConditions({ listNet: 2000, qty: 1, facts, rules: [] })).toMatchObject({ net: 2000, applied: [] });
  });

  it("customer discount by discount group (Artikelgruppe für Kundenrabatt)", () => {
    const r = applyConditions({ listNet: 2000, qty: 1, facts, rules: [rule({ targetType: "discount_group", target: "WEIN", value: 5 })] });
    expect(r.net).toBe(1900);
  });

  it("most specific rule wins (product over category over all)", () => {
    const rules = [rule({ value: 2 }), rule({ targetType: "category", target: "3", value: 4 }), rule({ targetType: "product", target: "10", value: 8 })];
    expect(applyConditions({ listNet: 1000, qty: 1, facts, rules }).net).toBe(920);
  });

  it("customer-scoped beats group-scoped at the same specificity", () => {
    const rules = [rule({ groupId: 2, value: 3 }), rule({ customerId: 5, value: 6 })];
    expect(applyConditions({ listNet: 1000, qty: 1, facts, rules }).net).toBe(940);
  });

  it("special price replaces the list price; discounts only apply when allowed on net prices", () => {
    const special = rule({ type: "special_price", targetType: "variant", target: "100", calc: "fixed_price", value: 1500 });
    expect(applyConditions({ listNet: 2000, qty: 1, facts, rules: [special, rule({ value: 10 })] }).net).toBe(1500);
    expect(applyConditions({ listNet: 2000, qty: 1, facts, rules: [special, rule({ value: 10, onNetPrices: true })] }).net).toBe(1350);
  });

  it("special price that is not netto (vinX isNetto=false) still gets the customer discount", () => {
    const special = rule({ type: "special_price", targetType: "variant", target: "100", calc: "fixed_price", value: 1500, onNetPrices: true });
    expect(applyConditions({ listNet: 2000, qty: 1, facts, rules: [special, rule({ value: 10 })] }).net).toBe(1350);
  });

  it("special price from a quantity (Tarifstufe) only applies from that quantity", () => {
    const special = rule({ type: "special_price", targetType: "variant", target: "100", calc: "fixed_price", value: 1500, minQty: 12 });
    expect(applyConditions({ listNet: 2000, qty: 6, facts, rules: [special] }).net).toBe(2000);
    expect(applyConditions({ listNet: 2000, qty: 12, facts, rules: [special] }).net).toBe(1500);
  });

  it("'lowest' mode takes the cheaper of list and special price", () => {
    const special = rule({ type: "special_price", targetType: "product", target: "10", calc: "fixed_price", value: 2500 });
    expect(applyConditions({ listNet: 2000, qty: 1, facts, rules: [special], mode: "lowest" }).net).toBe(2000);
    expect(applyConditions({ listNet: 2000, qty: 1, facts, rules: [special] }).net).toBe(2500); // priority mode: special price wins (surcharge for rarities)
  });

  it("quantity discount from n units, stacked after the customer discount", () => {
    const rules = [rule({ value: 10 }), rule({ type: "quantity_discount", minQty: 24, value: 5 })];
    expect(applyConditions({ listNet: 1000, qty: 12, facts, rules }).net).toBe(900);
    expect(applyConditions({ listNet: 1000, qty: 24, facts, rules }).net).toBe(855);
  });

  it("amount per unit discount (Fr./Einheit) never goes below zero", () => {
    expect(applyConditions({ listNet: 300, qty: 1, facts, rules: [rule({ calc: "amount_per_unit", value: 50 })] }).net).toBe(250);
    expect(applyConditions({ listNet: 30, qty: 1, facts, rules: [rule({ calc: "amount_per_unit", value: 50 })] }).net).toBe(0);
  });

  it("free goods 12 for 11 averages the unit price", () => {
    const r = applyConditions({ listNet: 1200, qty: 24, facts, rules: [rule({ type: "free_goods", calc: "n_for_m", buyQty: 12, payQty: 11 })] });
    expect(r.freeUnits).toBe(2);
    expect(r.net).toBe(1100);
    expect(applyConditions({ listNet: 1200, qty: 11, facts, rules: [rule({ type: "free_goods", calc: "n_for_m", buyQty: 12, payQty: 11 })] }).net).toBe(1200);
  });

  it("validity window is respected", () => {
    const now = new Date("2026-06-15");
    const promo = rule({ type: "promotion_discount", value: 10, validFrom: new Date("2026-06-01"), validTo: new Date("2026-06-30") });
    expect(applyConditions({ listNet: 1000, qty: 1, facts, rules: [promo], now }).net).toBe(900);
    expect(applyConditions({ listNet: 1000, qty: 1, facts, rules: [promo], now: new Date("2026-07-01") }).net).toBe(1000);
  });
});
