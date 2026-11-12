import { customerTiers } from "./price-sources";
import { factsFor, rulesFor } from "./conditions";
import { and, eq, inArray, sql } from "drizzle-orm";
import { computeTotals, type Coupon, type Tier } from "~/lib/pricing";
import { tl } from "~/lib/localized";
import { commit, getSession } from "./auth";
import type { ShopContext } from "./context";
import { getDb, schema } from "./db";
import type { CartItem } from "./db/schema";
import { liveBasket } from "./vinx/live";

const { carts, variants: v, products: p, producers: pr, prices } = schema;

/**
 * Server-side carts ("order lists"). Anonymous carts live under a cookie id;
 * on login they are merged into the user's cart so B2B lists survive devices.
 */
export async function getCart(request: Request, ctx: ShopContext, create = false): Promise<{ id: string | null; items: CartItem[]; couponCode: string | null; setCookie?: string }> {
  const db = await getDb();
  const session = await getSession(request);
  const sessionCartId = session.get("cartId");

  let cart = sessionCartId ? await db.query.carts.findFirst({ where: eq(carts.id, sessionCartId) }) : undefined;
  if (ctx.user) {
    const userCart = await db.query.carts.findFirst({ where: eq(carts.userId, ctx.user.id) });
    if (cart && !cart.userId && userCart && cart.id !== userCart.id) {
      const merged = mergeItems(userCart.items, cart.items);
      await db.update(carts).set({ items: merged, updatedAt: sql`now()` }).where(eq(carts.id, userCart.id));
      await db.delete(carts).where(eq(carts.id, cart.id));
      cart = { ...userCart, items: merged };
    } else if (cart && !cart.userId) {
      await db.update(carts).set({ userId: ctx.user.id }).where(eq(carts.id, cart.id));
    } else if (userCart) {
      cart = userCart;
    }
  }
  if (!cart && create) {
    [cart] = await db.insert(carts).values({ userId: ctx.user?.id ?? null, items: [] }).returning();
  }
  if (!cart) return { id: null, items: [], couponCode: null };
  if (cart.id !== sessionCartId) {
    session.set("cartId", cart.id);
    return { id: cart.id, items: cart.items, couponCode: cart.couponCode, setCookie: await commit(session) };
  }
  return { id: cart.id, items: cart.items, couponCode: cart.couponCode };
}

function mergeItems(a: CartItem[], b: CartItem[]): CartItem[] {
  const map = new Map<number, number>();
  for (const i of [...a, ...b]) map.set(i.variantId, (map.get(i.variantId) ?? 0) + i.qty);
  return [...map].map(([variantId, qty]) => ({ variantId, qty }));
}

export async function updateCart(cartId: string, fn: (items: CartItem[]) => CartItem[]) {
  const db = await getDb();
  const cart = await db.query.carts.findFirst({ where: eq(carts.id, cartId) });
  const items = fn(cart?.items ?? [])
    .map((i) => ({ variantId: i.variantId, qty: Math.max(0, Math.min(9999, Math.floor(i.qty))) }))
    .filter((i) => i.qty > 0);
  await db.update(carts).set({ items, updatedAt: sql`now()` }).where(eq(carts.id, cartId));
  return items;
}

export async function setCoupon(cartId: string, code: string | null) {
  const db = await getDb();
  await db.update(carts).set({ couponCode: code }).where(eq(carts.id, cartId));
}

export const addItem = (items: CartItem[], variantId: number, qty: number) => mergeItems(items, [{ variantId, qty }]);

export async function findCoupon(code: string): Promise<Coupon | null> {
  const db = await getDb();
  const c = await db.query.coupons.findFirst({ where: and(eq(sql`upper(${schema.coupons.code})`, code.trim().toUpperCase()), eq(schema.coupons.active, true)) });
  return c ? { code: c.code, type: c.type, value: c.value, minTotalCents: c.minTotalCents, consumerOnly: c.consumerOnly, expiresAt: c.expiresAt } : null;
}

export type CartLine = {
  variantId: number;
  productSlug: string;
  name: string;
  producer: string | null;
  sku: string;
  vintage: string | null;
  size: string | null;
  packSize: number;
  image: string | null;
  kind: string;
  color: string | null;
  qty: number;
  stock: number;
  ageRestricted: boolean;
  unitDisplay: number;
  lineDisplay: number;
  tierApplied: boolean;
  conditions: string[];
  freeUnits: number;
};

/** Single source of truth for order list, mini-cart, checkout and order creation. */
export async function cartSummary(ctx: ShopContext, items: CartItem[], couponCode: string | null, shippingCode?: string | null) {
  const db = await getDb();
  const ids = items.map((i) => i.variantId);
  const rows = ids.length
    ? await db
        .select({ v, p, producerName: pr.name })
        .from(v)
        .innerJoin(p, eq(p.id, v.productId))
        .leftJoin(pr, eq(pr.id, p.producerId))
        .where(and(inArray(v.id, ids), eq(v.active, true), eq(p.active, true)))
    : [];
  const visible = rows.filter((r) => !r.p.tradeOnly || ctx.isTrade);
  const tierRows = ctx.group && visible.length
    ? await db.select().from(prices).where(and(eq(prices.groupId, ctx.group.id), inArray(prices.variantId, visible.map((r) => r.v.id))))
    : [];
  const custom = await customerTiers(ctx, visible.map((r) => r.v));
  const rules = ctx.showPrices ? await rulesFor(ctx) : [];
  const facts = rules.length ? await factsFor(visible.map((r) => ({ productId: r.p.id, variantId: r.v.id, categoryId: r.p.categoryId, producerId: r.p.producerId, discountGroup: r.v.discountGroup }))) : null;
  const tiers = (id: number): Tier[] => custom?.get(id) ?? tierRows.filter((t) => t.variantId === id).map((t) => ({ minQty: t.minQty, netCents: t.netCents }));
  const ordered = items.map((i) => ({ i, row: visible.find((r) => r.v.id === i.variantId) })).filter((x) => x.row);

  const coupon = couponCode ? await findCoupon(couponCode) : null;
  const totals = computeTotals({
    lines: ordered.map(({ i, row }) => ({
      key: row!.v.id,
      qty: i.qty,
      listGross: row!.v.priceCents,
      taxRate: row!.p.taxClass === "reduced" ? ctx.shop.tax.reduced : ctx.shop.tax.standard,
      tiers: tiers(row!.v.id),
      conditions: facts && !custom?.has(row!.v.id) ? { facts: facts.get(row!.v.id)!, rules, mode: ctx.shop.priceFinding } : undefined,
    })),
    group: ctx.group,
    shipping: ctx.shop.shipping,
    shippingCode,
    coupon,
    standardRate: ctx.shop.tax.standard,
    cashRounding: ctx.shop.cashRounding,
  });

  const lines: CartLine[] = ordered.map(({ i, row }, idx) => {
    const t = totals.lines[idx];
    const net = totals.displayMode === "net";
    return {
      variantId: row!.v.id,
      productSlug: row!.p.slug,
      name: tl(row!.p.name, ctx.locale),
      producer: row!.producerName,
      sku: row!.v.sku,
      vintage: row!.v.vintage,
      size: row!.v.size,
      packSize: row!.v.packSize,
      image: row!.p.image,
      kind: row!.p.kind,
      color: row!.p.color,
      qty: i.qty,
      stock: row!.v.stock,
      ageRestricted: row!.p.ageRestricted,
      unitDisplay: net ? t.price.net : t.price.gross,
      lineDisplay: net ? t.lineNet : t.lineGross,
      tierApplied: t.price.reduced,
      conditions: (t.price.applied ?? []).map((a) => a.label),
      freeUnits: t.price.freeUnits ?? 0,
    };
  });

  // B2B: let vinX calculate (conditions, promotions, deposits, surcharges, freight) when linked.
  const erp = await liveBasket(
    ctx,
    ordered.map(({ i, row }) => ({ sku: row!.v.sku, erpId: row!.v.erpId, qty: i.qty })),
    totals.shippingCode,
    totals.coupon && totals.discount ? { code: totals.coupon.code, amountNet: Math.round(totals.discount / (1 + ctx.shop.tax.standard / 100)) } : null,
  );
  if (erp) {
    for (const l of lines) {
      const e = erp.lines.find((x) => x.sku === l.sku);
      if (e) {
        l.unitDisplay = totals.displayMode === "net" ? e.unitNet : e.unitGross;
        l.lineDisplay = totals.displayMode === "net" ? Math.round(e.unitNet * l.qty) : e.lineGross;
      }
    }
    totals.taxTotal = erp.totalTax;
    totals.totalGross = erp.totalGross;
    totals.subtotalNet = erp.totalNet;
    totals.taxes = Object.fromEntries(erp.vat.filter((v) => v.tax > 0).map((v) => [String(v.rate), v.tax]));
  }

  return {
    lines,
    totals,
    erpExtras: erp?.extras ?? [],
    erpCalculated: !!erp,
    count: lines.reduce((a, l) => a + l.qty, 0),
    ageRestricted: lines.some((l) => l.ageRestricted),
    /** prices hidden → checkout becomes a quote request */
    isRequest: !ctx.showPrices,
  };
}

export type CartSummary = Awaited<ReturnType<typeof cartSummary>>;
