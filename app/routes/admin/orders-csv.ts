import { desc } from "drizzle-orm";
import type { Route } from "./+types/orders-csv";
import { requireStaff } from "~/.server/auth";
import { getDb, schema } from "~/.server/db";
import { orderFilters } from "~/.server/admin-orders";

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // quote, and neutralise spreadsheet formulas
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/** CSV export of the current order list (same filters as Admin › Bestellungen). Opens in Excel (UTF-8 BOM, semicolons). */
export async function loader({ request }: Route.LoaderArgs) {
  await requireStaff(request);
  const url = new URL(request.url).searchParams;
  const q = (url.get("q") ?? "").trim();
  const db = await getDb();
  const rows = await db.select().from(schema.orders).where(orderFilters(url, q ? `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : undefined)).orderBy(desc(schema.orders.createdAt)).limit(10000);
  const head = ["Nummer", "Datum", "Art", "B2B", "Firma", "Name", "E-Mail", "Status", "Zahlungsart", "Zahlung", "ERP", "ERP-Nr.", "Bestellnummer Kunde", "Netto", "MWST", "Total", "Währung"];
  const lines = rows.map((o) => [
    o.number, o.createdAt.toISOString(), o.kind, o.isTrade ? "ja" : "nein", o.billing.company ?? "", o.billing.name, o.email, o.status, o.paymentMethod, o.paymentStatus, o.erpStatus, o.erpId ?? "", o.poNumber ?? "",
    (o.subtotalNet / 100).toFixed(2), (o.taxTotal / 100).toFixed(2), (o.totalGross / 100).toFixed(2), o.currency,
  ].map(esc).join(";"));
  return new Response("﻿" + [head.map(esc).join(";"), ...lines].join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="bestellungen-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
  });
}
