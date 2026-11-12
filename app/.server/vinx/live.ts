import type { ShopContext } from "../context";
import { getSetting } from "../settings";
import type { BasketResult } from "./client";
import { erpClient } from "./sync";

/**
 * Live ERP calculation for logged-in trade customers that are linked to a vinX
 * address (users.erpId). vinX then is the authority for prices incl. customer
 * conditions, promotions, deposits (Gebinde), surcharges (LSVA) and freight.
 * Falls back silently to the shop's own calculation on any error/timeout.
 */
const cache = new Map<string, { at: number; value: BasketResult | null }>();

export async function liveBasket(
  ctx: ShopContext,
  lines: { sku: string; erpId: string | null; qty: number }[],
  shippingCode: string,
  voucher: { code: string; amountNet: number } | null,
): Promise<BasketResult | null> {
  if (!ctx.isTrade || !ctx.user?.erpId || !lines.length) return null;
  const cfg = await getSetting("vinx");
  if (!cfg.enabled || !cfg.liveBasket || cfg.driver !== "rest3") return null;
  if (lines.some((l) => !l.erpId)) return null;

  const key = JSON.stringify([ctx.user.erpId, shippingCode, voucher?.code, lines.map((l) => [l.erpId, l.qty])]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;

  let value: BasketResult | null = null;
  try {
    const client = await erpClient(cfg);
    value = (await client.calculateBasket?.({ action: "calculate", customerErpId: ctx.user.erpId, shippingCode, positions: lines, voucher })) ?? null;
  } catch (e) {
    console.warn("[vinx] live basket failed, using local calculation:", e instanceof Error ? e.message : e);
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}
