import { and, eq, isNull, or } from "drizzle-orm";
import type { ConditionRule, PriceFacts } from "~/lib/conditions";
import { tl } from "~/lib/localized";
import type { ShopContext } from "./context";
import { getDb, schema } from "./db";

/**
 * Loads the B2B conditions that can apply to the current customer:
 * global rules + rules of the customer's group + the customer's own rules.
 * Rules from every source are stored in one table (platform / vinX / other ERP) — see lib/conditions.ts.
 */
const perRequest = new WeakMap<ShopContext, Promise<ConditionRule[]>>();

export function rulesFor(ctx: ShopContext): Promise<ConditionRule[]> {
  if (!ctx.shop.modules.conditions) return Promise.resolve([]);
  let p = perRequest.get(ctx);
  if (!p) {
    p = load(ctx);
    perRequest.set(ctx, p);
  }
  return p;
}

async function load(ctx: ShopContext): Promise<ConditionRule[]> {
  const db = await getDb();
  const c = schema.conditions;
  const scope = [and(isNull(c.customerId), isNull(c.groupId))];
  if (ctx.group) scope.push(and(isNull(c.customerId), eq(c.groupId, ctx.group.id)));
  // customer-specific rules only for the customer's approved account
  if (ctx.user && ctx.group) scope.push(eq(c.customerId, ctx.user.id));
  const rows = await db.select().from(c).where(and(eq(c.active, true), or(...scope)));
  return rows.map((r) => ({
    id: r.id, type: r.type, customerId: r.customerId, groupId: r.groupId, targetType: r.targetType, target: r.target, calc: r.calc,
    value: Number(r.value), minQty: r.minQty, minAmountCents: r.minAmountCents, buyQty: r.buyQty, payQty: r.payQty,
    validFrom: r.validFrom, validTo: r.validTo, onNetPrices: r.onNetPrices, label: tl(r.label ?? {}, ctx.locale) || defaultLabel(ctx, r.type), source: r.source,
  }));
}

function defaultLabel(ctx: ShopContext, type: ConditionRule["type"]) {
  return ctx.t(`cond.${type}`);
}

/* category ancestry, cached briefly (categories rarely change) */
let catCache: { at: number; parent: Map<number, number | null> } | null = null;
async function categoryParents() {
  if (catCache && Date.now() - catCache.at < 60_000) return catCache.parent;
  const db = await getDb();
  const rows = await db.select({ id: schema.categories.id, parentId: schema.categories.parentId }).from(schema.categories);
  catCache = { at: Date.now(), parent: new Map(rows.map((r) => [r.id, r.parentId])) };
  return catCache.parent;
}

export async function factsFor(rows: { productId: number; variantId: number; categoryId: number | null; producerId: number | null; discountGroup: string | null }[]) {
  const parents = await categoryParents();
  const out = new Map<number, PriceFacts>();
  for (const r of rows) {
    const cats: number[] = [];
    for (let c = r.categoryId; c != null && cats.length < 8; c = parents.get(c) ?? null) cats.push(c);
    out.set(r.variantId, { productId: r.productId, variantId: r.variantId, categoryIds: cats, producerId: r.producerId, discountGroup: r.discountGroup });
  }
  return out;
}
