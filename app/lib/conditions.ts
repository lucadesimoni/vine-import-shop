/**
 * Conditions engine (B2B "Konditionen"), modelled on vinX price finding:
 *
 *  1. Price finding   special price (customer) → promotion price → list/tier price (group) → base price
 *                     (or "lowest" mode: the cheapest of all valid prices)
 *  2. Discounts       customer discount (by product / category / producer / discount group / all)
 *                     → quantity discount (from n units or CHF per line)
 *                     → promotion discount (time-boxed)
 *  3. Special terms   n-for-m free goods (e.g. 12 for 11)
 *
 * Rules come from a source: the platform itself (maintained in the admin — the shop plays the ERP),
 * vinX (synced), or any other ERP connector writing into the same table. Pure & deterministic — unit-tested.
 */

export type ConditionType = "special_price" | "promotion_price" | "customer_discount" | "quantity_discount" | "promotion_discount" | "free_goods";
export type TargetType = "all" | "product" | "variant" | "category" | "producer" | "discount_group";
export type CalcType = "percent" | "amount_per_unit" | "fixed_price" | "n_for_m";

export type ConditionRule = {
  id: number;
  type: ConditionType;
  /** null = everyone the rule is visible to (scoped by customer / group below) */
  customerId: number | null;
  groupId: number | null;
  targetType: TargetType;
  /** id (as string) or key, depending on targetType */
  target: string | null;
  calc: CalcType;
  /** percent (5 = 5 %), CHF cents (amount/fixed price) or – for n_for_m – unused */
  value: number;
  minQty: number;
  minAmountCents: number;
  buyQty: number;
  payQty: number;
  validFrom: Date | null;
  validTo: Date | null;
  /**
   * Discount rules: may apply on top of a special/promotion price (vinX "Kundenrabatt auf Spezial-/Aktionspreis").
   * Price rules (special/promotion price): further discounts are allowed on this price (vinX isNetto = false).
   */
  onNetPrices: boolean;
  label: string;
  source: string;
};

export type PriceFacts = {
  productId: number;
  variantId: number;
  categoryIds: number[];
  producerId: number | null;
  discountGroup: string | null;
};

export type AppliedCondition = { id: number; type: ConditionType; label: string; amount: number };

export type ConditionResult = {
  /** effective unit net price in cents (after free goods, averaged per paid+free unit) */
  net: number;
  /** price before discounts (after price finding) */
  baseNet: number;
  applied: AppliedCondition[];
  freeUnits: number;
};

const SPECIFICITY: Record<TargetType, number> = { variant: 5, product: 4, discount_group: 3, producer: 2, category: 1, all: 0 };

export function matches(rule: ConditionRule, f: PriceFacts, now: Date): boolean {
  if (rule.validFrom && now < rule.validFrom) return false;
  if (rule.validTo && now > rule.validTo) return false;
  switch (rule.targetType) {
    case "all": return true;
    case "variant": return rule.target === String(f.variantId);
    case "product": return rule.target === String(f.productId);
    case "category": return !!rule.target && f.categoryIds.map(String).includes(rule.target);
    case "producer": return rule.target === String(f.producerId);
    case "discount_group": return !!f.discountGroup && rule.target === f.discountGroup;
  }
}

/** Most specific, then customer-scoped over group-scoped over global, then lowest id. */
function best(rules: ConditionRule[]) {
  return [...rules].sort((a, b) =>
    SPECIFICITY[b.targetType] - SPECIFICITY[a.targetType] ||
    Number(b.customerId != null) - Number(a.customerId != null) ||
    Number(b.groupId != null) - Number(a.groupId != null) ||
    a.id - b.id,
  )[0];
}

function discount(rule: ConditionRule, price: number) {
  if (rule.calc === "percent") return Math.round(price * (rule.value / 100));
  if (rule.calc === "amount_per_unit") return Math.min(price, Math.round(rule.value));
  if (rule.calc === "fixed_price") return Math.max(0, price - Math.round(rule.value));
  return 0;
}

export function applyConditions(args: {
  /** list/tier net price for this quantity (from the group price list), before conditions */
  listNet: number;
  qty: number;
  facts: PriceFacts;
  rules: ConditionRule[];
  now?: Date;
  mode?: "priority" | "lowest";
}): ConditionResult {
  const now = args.now ?? new Date();
  const qty = Math.max(1, args.qty);
  const hits = args.rules.filter((r) => matches(r, args.facts, now));
  const applied: AppliedCondition[] = [];

  // 1 — price finding
  const special = best(hits.filter((r) => r.type === "special_price" && qty >= r.minQty));
  const promo = best(hits.filter((r) => r.type === "promotion_price" && qty >= r.minQty));
  const priced = (r: ConditionRule | undefined) => (r ? (r.calc === "fixed_price" ? Math.round(r.value) : args.listNet - discount(r, args.listNet)) : null);
  const candidates = [
    { rule: special, net: priced(special) },
    { rule: promo, net: priced(promo) },
  ].filter((c): c is { rule: ConditionRule; net: number } => !!c.rule && c.net != null);
  let base = args.listNet;
  let netPrice = false;
  const pick = args.mode === "lowest" ? [...candidates].sort((a, b) => a.net - b.net)[0] : candidates[0];
  if (pick && (args.mode !== "lowest" || pick.net < base)) {
    applied.push({ id: pick.rule.id, type: pick.rule.type, label: pick.rule.label, amount: base - pick.net });
    base = pick.net;
    netPrice = !pick.rule.onNetPrices; // net price → only discounts flagged for net prices still apply
  }

  // 2 — discounts in vinX order; each kind applies at most once (best match)
  let net = base;
  for (const type of ["customer_discount", "quantity_discount", "promotion_discount"] as const) {
    const rule = best(hits.filter((r) => r.type === type && (!netPrice || r.onNetPrices) && qty >= r.minQty && net * qty >= r.minAmountCents));
    if (!rule) continue;
    const d = discount(rule, net);
    if (d > 0) {
      net -= d;
      applied.push({ id: rule.id, type, label: rule.label, amount: d });
    }
  }

  // 3 — free goods: buy n, pay m
  let freeUnits = 0;
  const fg = best(hits.filter((r) => r.type === "free_goods" && r.buyQty > r.payQty && r.payQty > 0 && qty >= r.buyQty));
  if (fg) {
    const sets = Math.floor(qty / fg.buyQty);
    freeUnits = sets * (fg.buyQty - fg.payQty);
    const paid = qty - freeUnits;
    const avg = Math.round((net * paid) / qty);
    applied.push({ id: fg.id, type: "free_goods", label: fg.label, amount: net - avg });
    net = avg;
  }

  return { net: Math.max(0, net), baseNet: base, applied, freeUnits };
}
