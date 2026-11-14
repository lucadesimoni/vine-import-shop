import { eq, lt } from "drizzle-orm";
import { getDb, schema } from "./db";

/**
 * Admin activity log. Records the kind of action and the record concerned (product name, order number, customer)
 * with the staff member and time — never form values (no prices, texts, passwords). Kept 365 days.
 *
 * Most entries come from the admin middleware (routes/admin/layout.tsx → recordAdminAction) after a successful
 * POST, so new admin features are logged without extra code; `audit()` adds explicit entries (sign-in, jobs …).
 */
export type AuditEntry = { action: string; summary: string; entity?: string | null; entityId?: string | number | null; path?: string | null };
type Actor = { id: number; email: string; name?: string | null } | null;

export async function audit(actor: Actor, e: AuditEntry) {
  try {
    const db = await getDb();
    await db.insert(schema.auditLog).values({
      userId: actor?.id ?? null,
      actor: actor ? (actor.name ? `${actor.name} <${actor.email}>` : actor.email) : "System",
      action: e.action.slice(0, 80),
      entity: e.entity ?? null,
      entityId: e.entityId != null ? String(e.entityId).slice(0, 80) : null,
      summary: e.summary.slice(0, 300),
      path: e.path?.slice(0, 200) ?? null,
    });
    if (Math.random() < 0.01) await db.delete(schema.auditLog).where(lt(schema.auditLog.at, new Date(Date.now() - 365 * 864e5)));
  } catch (err) {
    console.warn("[audit]", (err as Error).message); // logging must never break the action itself
  }
}

/** safe form fields that describe *which* action ran (values of other fields are never read) */
const KIND_FIELDS = ["intent", "action", "status", "job"] as const;
const LABELS: Record<string, string> = {
  delete: "gelöscht", approve: "freigegeben", reject: "abgelehnt", invite: "eingeladen", push: "an vinX gesendet", retry: "erneut gesendet",
  status: "Status geändert", ship: "versandt", paid: "als bezahlt markiert", "post-label": "Post-Etikett erstellt", "inquiry-done": "Anfrage erledigt",
  "image-edit": "Bild bearbeitet", "image-reset": "Bild zurückgesetzt", "images-standard": "Bildstandard angewendet", "images-reset": "Bilder zurückgesetzt",
  harmonize: "Produktbilder aufbereitet", preset: "Geschäftsprofil angewendet", "scope-reset": "auf Hauptshop zurückgesetzt",
  preview: "Vorschau erstellt", import: "durchgeführt", map: "Zuordnung gewählt", bulk: "Massenaktion",
  backup: "Backup erstellt", restore: "Wiederherstellung angefordert", "cancel-restore": "Wiederherstellung abgebrochen", config: "Verbindung gespeichert",
};
const AREAS: [RegExp, string, string][] = [
  [/^\/admin\/products(\/(\d+|new))?/, "product", "Produkt"],
  [/^\/admin\/producers(\/(\d+|new))?/, "producer", "Produzent"],
  [/^\/admin\/customers\/import/, "customer", "Kundenimport"],
  [/^\/admin\/customers(\/(\d+|new))?/, "customer", "Kunde"],
  [/^\/admin\/orders(\/(\d+))?/, "order", "Bestellung"],
  [/^\/admin\/conditions/, "condition", "Konditionen"],
  [/^\/admin\/design/, "settings", "Design & Marke"],
  [/^\/admin\/content/, "settings", "Inhalte"],
  [/^\/admin\/settings/, "settings", "Einstellungen"],
  [/^\/admin\/storefronts(\/(\d+|new))?/, "storefront", "Storefront"],
  [/^\/admin\/integrations/, "integration", "vinX / Jobs"],
  [/^\/admin\/system/, "system", "System"],
  [/^\/admin\/password/, "user", "Passwort"],
  [/^\/admin\/upload/, "media", "Datei"],
];

/** human-readable name of the record (one small query), e.g. product name or order number */
async function nameOf(entity: string, id: string) {
  const db = await getDb();
  const n = Number(id);
  if (!Number.isInteger(n)) return null;
  if (entity === "product") return (await db.query.products.findFirst({ where: eq(schema.products.id, n), columns: { name: true } }))?.name?.de ?? null;
  if (entity === "producer") return (await db.query.producers.findFirst({ where: eq(schema.producers.id, n), columns: { name: true } }))?.name ?? null;
  if (entity === "customer") { const u = await db.query.users.findFirst({ where: eq(schema.users.id, n), columns: { company: true, email: true } }); return u ? u.company || u.email : null; }
  if (entity === "order") return (await db.query.orders.findFirst({ where: eq(schema.orders.id, n), columns: { number: true } }))?.number ?? null;
  if (entity === "storefront") return (await db.query.storefronts.findFirst({ where: eq(schema.storefronts.id, n), columns: { name: true } }))?.name ?? null;
  return null;
}

/** describe an admin POST from its path and the kind fields only */
export function describe(path: string, form: FormData | null, sf?: string | null) {
  const kind = Object.fromEntries(KIND_FIELDS.map((k) => [k, form?.get(k)]).filter(([, v]) => typeof v === "string" && /^[\w:.-]{1,40}$/.test(v as string))) as Record<string, string>;
  const ids = form ? form.getAll("ids").length : 0;
  const area = AREAS.find(([re]) => re.test(path));
  const m = area ? path.match(area[0]) : null;
  const entityId = m?.[2] && m[2] !== "new" ? m[2] : null;
  const what = area?.[2] ?? path.replace(/^\/admin\/?/, "") ?? "Admin";
  const verb = kind.intent ?? (ids ? kind.action : undefined);
  let summary: string;
  if (ids) summary = `${what}: Massenaktion «${LABELS[kind.action] ?? kind.action ?? "?"}» auf ${ids} ${ids === 1 ? "Eintrag" : "Einträge"}`;
  else if (m?.[2] === "new") summary = `${what} angelegt`;
  else if (verb === "status" && kind.status) summary = `${what}: Status → ${kind.status}`;
  else if (verb && kind.job) summary = `${what}: Job «${kind.job}» ausgeführt`;
  else if (verb) summary = `${what} ${LABELS[verb] ?? `«${verb}»`}`;
  else summary = area?.[1] === "settings" || area?.[1] === "condition" ? `${what} gespeichert` : `${what} gespeichert`;
  if (sf) summary += ` (Storefront ${sf})`;
  return { action: `${area?.[1] ?? "admin"}.${verb ?? (ids ? "bulk" : "save")}`, entity: area?.[1] ?? null, entityId, summary };
}

/**
 * Called by the admin middleware before the action runs: reads the kind fields from a copy of the request and the
 * record's name (before a delete removes it). Returns the function that writes the entry after a successful action.
 */
export async function prepareAudit(request: Request, actor: Actor) {
  const url = new URL(request.url);
  let form: FormData | null = null;
  try {
    if ((request.headers.get("Content-Type") ?? "").includes("form")) form = await request.clone().formData();
  } catch { /* not a form */ }
  const d = describe(url.pathname.replace(/\.data$/, ""), form, url.searchParams.get("sf"));
  const name = d.entity && d.entityId ? await nameOf(d.entity, d.entityId).catch(() => null) : null;
  return () => audit(actor, { ...d, summary: name ? `${d.summary} — ${name}` : d.summary, path: url.pathname.replace(/\.data$/, "") });
}
