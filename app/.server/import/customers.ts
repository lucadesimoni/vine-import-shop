import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { emit } from "../events";
import { sendTokenMail } from "../password-reset";
import type { Table } from "./table";

/**
 * Customer import (Admin › Kunden › Import): CSV or XML from any source — an old shop, an ERP export,
 * a spreadsheet. Columns are recognised by name (DE/IT/FR/EN); existing customers are matched by ERP number,
 * then e-mail. Imported customers get no usable password until they follow an invitation link.
 */
import { FIELDS, type FieldKey } from "~/lib/import-fields";
export { FIELDS, type FieldKey };

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");

/** Column → field mapping by header names. */
export function detectMapping(headers: string[]): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {};
  const used = new Set<string>();
  const entries = Object.entries(FIELDS) as [FieldKey, readonly string[]][];
  // exact header names first, then headers that contain a known name ("Telefon Geschäft")
  for (const exact of [true, false])
    for (const [field, names] of entries) {
      if (out[field]) continue;
      const hit = headers.find((h) => !used.has(h) && names.some((n) => (exact ? norm(n) === norm(h) : norm(n).length > 3 && norm(h).includes(norm(n)))));
      if (hit) { out[field] = hit; used.add(hit); }
    }
  return out;
}

export type ImportRow = { line: number; email: string; name: string; company: string | null; uid: string | null; phone: string | null; erpId: string | null; groupCode: string | null; b2b: boolean; locale: string; billing: { name: string; company?: string; street: string; zip: string; city: string; country: string }; error?: string };

const COUNTRY: Record<string, string> = { schweiz: "CH", suisse: "CH", svizzera: "CH", switzerland: "CH", deutschland: "DE", germany: "DE", oesterreich: "AT", osterreich: "AT", austria: "AT", italien: "IT", italia: "IT", italy: "IT", frankreich: "FR", france: "FR", liechtenstein: "LI" };
const yes = (v: string) => /^(1|ja|yes|si|sì|oui|x|true|b2b|wahr)$/i.test(v.trim());

export function toRows(table: Table, mapping: Partial<Record<FieldKey, string>>): ImportRow[] {
  const get = (r: Record<string, string>, f: FieldKey) => (mapping[f] ? (r[mapping[f]!] ?? "").trim() : "");
  return table.rows.map((r, i) => {
    const email = get(r, "email").toLowerCase();
    const name = get(r, "name") || [get(r, "firstName"), get(r, "lastName")].filter(Boolean).join(" ");
    const company = get(r, "company") || null;
    const c = get(r, "country");
    const country = /^[A-Za-z]{2}$/.test(c) ? c.toUpperCase() : COUNTRY[norm(c)] ?? "CH";
    const lang = get(r, "language").toLowerCase().slice(0, 2);
    const row: ImportRow = {
      line: i + 2, email, name: name || company || email, company, uid: get(r, "uid") || null, phone: get(r, "phone") || null,
      erpId: get(r, "erpId") || null, groupCode: get(r, "group") || null, b2b: mapping.b2b ? yes(get(r, "b2b")) : !!company,
      locale: ["de", "it", "fr", "en"].includes(lang) ? lang : "de",
      billing: { name: name || company || email, company: company ?? undefined, street: get(r, "street"), zip: get(r, "zip"), city: get(r, "city"), country },
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) row.error = "E-Mail fehlt oder ungültig";
    return row;
  });
}

export type ImportOptions = { update: boolean; approveB2b: boolean; invite: boolean; pushToErp: boolean; defaultGroup: number | null; origin: string };
export type ImportResult = { created: number; updated: number; skipped: number; invited: number; errors: { line: number; message: string }[] };

export async function importCustomers(rows: ImportRow[], o: ImportOptions): Promise<ImportResult> {
  const db = await getDb();
  const groups = await db.select().from(schema.customerGroups);
  const groupId = (code: string | null) => (code ? groups.find((g) => norm(g.code) === norm(code) || norm(g.name) === norm(code))?.id : undefined);
  const res: ImportResult = { created: 0, updated: 0, skipped: 0, invited: 0, errors: [] };
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.error) { res.errors.push({ line: r.line, message: r.error }); continue; }
    if (seen.has(r.email)) { res.errors.push({ line: r.line, message: "E-Mail doppelt in der Datei" }); continue; }
    seen.add(r.email);
    const existing =
      (r.erpId ? await db.query.users.findFirst({ where: eq(schema.users.erpId, r.erpId) }) : undefined) ??
      (await db.query.users.findFirst({ where: sql`lower(${schema.users.email}) = ${r.email}` }));
    if (existing && existing.role !== "customer") { res.errors.push({ line: r.line, message: "Adresse gehört zu einem Mitarbeiter-Konto" }); continue; }
    const trade = r.b2b && o.approveB2b ? ("approved" as const) : r.b2b ? ("pending" as const) : null;
    const gid = groupId(r.groupCode) ?? (trade === "approved" ? groups.find((g) => g.code === "trade")?.id : undefined) ?? o.defaultGroup ?? groups.find((g) => g.code === "consumer")?.id ?? null;
    const values = { email: r.email, name: r.name, company: r.company, uidNumber: r.uid, phone: r.phone, erpId: r.erpId, locale: r.locale, billing: r.billing, groupId: gid, tradeStatus: trade, updatedAt: new Date() };
    let id: number;
    if (existing) {
      if (!o.update) { res.skipped++; continue; }
      await db.update(schema.users).set({ ...values, erpId: r.erpId ?? existing.erpId, tradeStatus: trade ?? existing.tradeStatus }).where(eq(schema.users.id, existing.id));
      id = existing.id;
      res.updated++;
    } else {
      // no usable password: the customer sets one through the invitation link
      const [row] = await db.insert(schema.users).values({ ...values, role: "customer", passwordHash: `invite$${randomBytes(18).toString("base64url")}` }).returning({ id: schema.users.id });
      id = row.id;
      res.created++;
      if (o.invite && (await sendTokenMail(id, "invite", o.origin))) res.invited++;
    }
    if (o.pushToErp) await emit("customer.updated", { userId: id });
  }
  return res;
}
