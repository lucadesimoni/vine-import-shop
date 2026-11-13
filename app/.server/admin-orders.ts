import { and, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { schema } from "./db";

const o = schema.orders;

/** Admin order filters from URL params (shared by the list and the CSV export). */
export function orderFilters(url: URLSearchParams, like?: string) {
  const where: SQL[] = [];
  // shop: "main" = main shop, otherwise a storefront id
  if (url.get("shop") === "main") where.push(sql`${o.storefrontId} is null`);
  else if (Number(url.get("shop"))) where.push(eq(o.storefrontId, Number(url.get("shop"))));
  if (url.get("status")) where.push(eq(o.status, url.get("status") as "new"));
  if (url.get("type") === "trade") where.push(eq(o.isTrade, true));
  if (url.get("type") === "consumer") where.push(eq(o.isTrade, false));
  if (url.get("type") === "request") where.push(eq(o.kind, "request"));
  if (url.get("payment") === "open") where.push(sql`${o.paymentStatus} <> 'paid'`);
  if (url.get("payment") === "paid") where.push(eq(o.paymentStatus, "paid"));
  if (url.get("erp") === "failed") where.push(eq(o.erpStatus, "failed"));
  if (url.get("erp") === "pending") where.push(eq(o.erpStatus, "pending"));
  if (/^\d{4}-\d{2}-\d{2}$/.test(url.get("from") ?? "")) where.push(gte(o.createdAt, new Date(url.get("from")!)));
  if (/^\d{4}-\d{2}-\d{2}$/.test(url.get("to") ?? "")) where.push(lte(o.createdAt, new Date(`${url.get("to")}T23:59:59`)));
  if (like) where.push(or(ilike(o.number, like), ilike(o.email, like), sql`${o.billing}->>'company' ilike ${like}`, sql`${o.billing}->>'name' ilike ${like}`, ilike(o.poNumber, like))!);
  return where.length ? and(...where) : undefined;
}

