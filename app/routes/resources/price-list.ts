import { asc, eq } from "drizzle-orm";
import type { Route } from "./+types/price-list";
import { requireUser } from "~/.server/auth";
import { shopContext } from "~/.server/context";
import { toCards } from "~/.server/catalog";
import { getDb, schema } from "~/.server/db";

/** B2B price list as CSV (UTF-8 BOM, semicolon — opens directly in Excel CH). */
export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request);
  const ctx = context.get(shopContext);
  if (!ctx.isTrade || !ctx.shop.trade.priceListExport) throw new Response("Forbidden", { status: 403 });
  const db = await getDb();
  const ids = (await db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.active, true)).orderBy(asc(schema.products.categoryId))).map((r) => r.id);
  const cards = await toCards(ctx, ids);
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Art.-Nr.", "Produkt", "Produzent", "Kategorie", "Jahrgang", "Format", "Netto CHF", "Staffeln (netto)", "Lager"].map(q).join(";")];
  for (const c of cards) for (const v of c.variants) {
    const tiers = v.price?.tiers.map((t) => `ab ${t.minQty}: ${(t.netCents / 100).toFixed(2)}`).join(" | ") ?? "";
    rows.push([v.sku, c.name, c.producer?.name, c.category?.name, v.vintage, v.size, v.price ? (v.price.net / 100).toFixed(2) : "", tiers, v.stock].map(q).join(";"));
  }
  return new Response("﻿" + rows.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="preisliste-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" },
  });
}
