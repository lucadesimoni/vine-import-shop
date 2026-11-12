import type { Tier } from "~/lib/pricing";
import type { ShopContext } from "./context";
import { getSetting } from "./settings";
import { erpClient } from "./vinx/sync";

/**
 * Customer / customer-group prices are resolved through a pluggable price source.
 *
 *  platform  The shop's own price lists (table `prices`, per customer group, with quantity
 *            tiers) + group discount rules. Maintained in the admin, by CSV/API import, or
 *            filled by any ERP sync — the default and the fallback for every other source.
 *  vinx      Live customer prices from vinX (Calculated/ProductInfo with the customer's
 *            address id) incl. customer conditions and promotions.
 *
 * Another ERP integration adds itself with `registerPriceSource({ id, label, resolve })`.
 * `resolve` returns customer-specific tiers per variant; variants it leaves out — or a
 * `null` result (not linked, timeout, error) — fall back to the platform price lists.
 */
export type PriceSource = {
  id: string;
  label: string;
  resolve(ctx: ShopContext, variants: { id: number; sku: string; erpId: string | null }[]): Promise<Map<number, Tier[]> | null>;
};

const sources = new Map<string, PriceSource>();
export function registerPriceSource(source: PriceSource) {
  sources.set(source.id, source);
}
export const listPriceSources = () => [...sources.values()].map(({ id, label }) => ({ id, label }));

/** Customer-specific tiers from the configured source, or null to use the platform price lists. */
export async function customerTiers(ctx: ShopContext, variants: { id: number; sku: string; erpId: string | null }[]) {
  if (!ctx.group || !variants.length) return null;
  const source = sources.get(ctx.shop.priceSource);
  if (!source || source.id === "platform") return null;
  try {
    return await withTimeout(source.resolve(ctx, variants), 2500);
  } catch (e) {
    console.warn(`[prices] ${source.id} failed, using platform prices:`, e instanceof Error ? e.message : e);
    return null;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms))]);
}

/* ── Built-in sources ─────────────────────────────────────────────────── */

registerPriceSource({ id: "platform", label: "Plattform (Preislisten je Kundengruppe)", resolve: async () => null });

const vinxCache = new Map<string, { at: number; value: Map<number, Tier[]> }>();
registerPriceSource({
  id: "vinx",
  label: "vinX ERP (live je Kunde)",
  async resolve(ctx, variants) {
    const cfg = await getSetting("vinx");
    const erpCustomer = ctx.user?.erpId ? Number(ctx.user.erpId) : null;
    if (!cfg.enabled || !cfg.livePrices || cfg.driver !== "rest3" || !erpCustomer) return null;
    const linked = variants.filter((v) => v.erpId);
    if (!linked.length) return null;

    const key = `${erpCustomer}|${linked.map((v) => v.erpId).sort().join(",")}`;
    const hit = vinxCache.get(key);
    if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value;

    const client = await erpClient(cfg);
    if (!client.productInfo) return null;
    const info = await client.productInfo({ customerId: erpCustomer, articles: linked.map((v) => ({ erpId: v.erpId!, qty: 1 })) });
    const out = new Map<number, Tier[]>();
    for (const v of linked) {
      const p = info.get(v.erpId!);
      if (p) out.set(v.id, [{ minQty: 1, netCents: p.promoNet ?? p.unitNet }]);
    }
    vinxCache.set(key, { at: Date.now(), value: out });
    if (vinxCache.size > 500) vinxCache.delete(vinxCache.keys().next().value!);
    return out;
  },
});
