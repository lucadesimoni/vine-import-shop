import { eq, like, sql } from "drizzle-orm";
import { data, Form, Link } from "react-router";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Circle, Download, HardDriveDownload, RotateCcw } from "lucide-react";
import type { Route } from "./+types/system";
import { requireStaff, verifyPassword } from "~/.server/auth";
import { dbInfo, getDb, schema } from "~/.server/db";
import { knownMigrations } from "~/.server/db/migrate";
import { getSettings } from "~/.server/settings";
import { APP_VERSION, cancelRestore, createBackup, latestRelease, listBackups, newer, pendingRestore, requestRestore } from "~/.server/maintenance";
import { Badge, Button, Notice } from "~/components/ui";
import { DataTable, PageHeader, Panel } from "~/components/admin";

type Check = { id: string; label: string; ok: boolean; hint: string; to?: string; severity?: "required" | "recommended" };

export async function loader({ request }: Route.LoaderArgs) {
  await requireStaff(request);
  const db = await getDb();
  const [{ brand, shop, vinx }, admin, stubs, release] = await Promise.all([
    getSettings("brand", "shop", "vinx"),
    db.query.users.findFirst({ where: eq(schema.users.email, process.env.ADMIN_EMAIL ?? "admin@example.com") }),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.pages).where(like(sql`${schema.pages.body}->>'de'`, "> Vorlage%")),
    latestRelease(),
  ]);
  const backups = listBackups();
  const info = dbInfo();
  const url = new URL(request.url);
  const https = (request.headers.get("X-Forwarded-Proto") ?? url.protocol.replace(":", "")) === "https" || url.hostname === "localhost";
  const p = shop.payments;
  const online = (["stripe", "mollie", "datatrans", "payrexx"] as const).some((k) => p[k].enabled);
  const lastBackup = backups[0] ? Date.parse(backups[0].createdAt) : 0;
  const demo = (process.env.DEMO_DATA ?? "true") !== "false";

  const checks: Check[] = [
    { id: "password", label: "Admin-Passwort geändert", ok: !admin || !(await verifyPassword("admin-demo-1234", admin.passwordHash)), hint: "Das Standardpasswort ist noch aktiv.", to: "/admin/password", severity: "required" },
    { id: "https", label: "HTTPS aktiv", ok: https, hint: "Shop über https:// ausliefern (Hoster/Proxy).", severity: "required" },
    { id: "brand", label: "Marke eingerichtet", ok: brand.name !== "Your Shop", hint: "Name, Logo, Farben in Design & Marke.", to: "/admin/design", severity: "required" },
    { id: "legal", label: "Rechtstexte ersetzt (Impressum, AGB, Datenschutz)", ok: stubs[0].n === 0, hint: `${stubs[0].n} Seite(n) enthalten noch die Vorlage.`, to: "/admin/content", severity: "required" },
    { id: "mail", label: "E-Mail-Versand konfiguriert", ok: (process.env.MAIL_DRIVER ?? "log") !== "log", hint: "MAIL_DRIVER=smtp, SMTP_URL, MAIL_FROM setzen — sonst gehen Bestellbestätigungen nur ins Log.", severity: "required" },
    { id: "payment", label: "Zahlarten eingerichtet", ok: online || (p.prepayment.enabled && !!p.prepayment.iban && !p.prepayment.iban.startsWith("CH00")) || p.invoice.enabled, hint: "Bankverbindung oder Online-Zahlung (Stripe, Mollie, Datatrans, Payrexx).", to: "/admin/settings", severity: "required" },
    { id: "backup", label: "Backup der letzten 26 h vorhanden", ok: Date.now() - lastBackup < 26 * 3600e3, hint: "Backups laufen automatisch täglich — oder jetzt eines erstellen.", severity: "required" },
    { id: "demo", label: "Demodaten ausgeschaltet", ok: !demo, hint: "Für den Live-Betrieb DEMO_DATA=false und eigene Produkte (vinX-Import oder Admin).", severity: "recommended" },
    { id: "erp", label: "ERP verbunden oder bewusst deaktiviert", ok: !vinx.enabled || vinx.driver !== "mock", hint: "vinX-Treiber steht auf Demo.", to: "/admin/integrations", severity: "recommended" },
    { id: "db", label: "Datenbank passend zur Grösse", ok: info?.kind === "postgres" || !process.env.VERCEL, hint: "Serverless ohne DATABASE_URL ist nur eine Demo (Daten werden zurückgesetzt).", severity: "required" },
  ];
  return {
    version: APP_VERSION, schema: knownMigrations, db: info?.kind ?? "unknown",
    update: release && newer(release.latest, APP_VERSION) ? release : null,
    backups: backups.slice(0, 20), restore: pendingRestore(), checks, demo,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireStaff(request);
  if (user.role !== "admin") throw new Response("Forbidden", { status: 403 });
  const form = await request.formData();
  const intent = form.get("intent");
  try {
    if (intent === "backup") { const b = await createBackup("manual"); return { ok: true, message: `Backup erstellt: ${b.name}` }; }
    if (intent === "restore") { requestRestore(String(form.get("name"))); return { ok: true, message: "Wiederherstellung geplant — wird beim nächsten Neustart des Shops angewendet (die aktuelle Datenbank bleibt als Kopie erhalten)." }; }
    if (intent === "cancel-restore") { cancelRestore(); return { ok: true, message: "Wiederherstellung abgebrochen." }; }
  } catch (e) {
    return data({ ok: false, message: (e as Error).message }, { status: 400 });
  }
  return { ok: false, message: "unbekannt" };
}

export const meta: Route.MetaFunction = () => [{ title: "System · Admin" }];

export default function System({ loaderData, actionData }: Route.ComponentProps) {
  const { version, schema: schemaVersion, db, update, backups, restore, checks } = loaderData;
  const open = checks.filter((c) => !c.ok);
  const required = open.filter((c) => c.severity === "required").length;
  return (
    <>
      <PageHeader title="System" subtitle={<>Version <strong>{version}</strong> · Schema {schemaVersion} · Datenbank {db === "embedded" ? "eingebettet" : "PostgreSQL"}</>} />
      {actionData && <Notice tone={actionData.ok ? "success" : "danger"} className="mb-6">{actionData.message}</Notice>}
      {update && (
        <Notice tone="warning" className="mb-6">
          Neue Version <strong>{update.latest}</strong> verfügbar (installiert: {version}). <a href={update.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">Änderungen ansehen <ArrowUpRight size={13} /></a> · Aktualisieren: siehe docs/UPDATING.md — vor dem Update wird automatisch ein Backup erstellt.
        </Notice>
      )}
      {restore && (
        <Notice tone="warning" className="mb-6">
          Wiederherstellung von <strong>{restore.name}</strong> ist geplant und wird beim nächsten Neustart angewendet.
          <Form method="post" className="mt-2"><input type="hidden" name="intent" value="cancel-restore" /><Button size="sm" variant="secondary">Abbrechen</Button></Form>
        </Notice>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Go-live-Checkliste" description={open.length ? `${required} Pflichtpunkt(e) und ${open.length - required} Empfehlung(en) offen.` : "Alles bereit für den Live-Betrieb."}>
          <ul className="divide-y divide-border">
            {checks.map((c) => (
              <li key={c.id} className="flex items-start gap-3 py-3">
                {c.ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" /> : c.severity === "required" ? <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" /> : <Circle size={18} className="mt-0.5 shrink-0 text-muted-fg" />}
                <span className="grid flex-1 gap-0.5">
                  <span className={c.ok ? "text-muted-fg" : "font-medium"}>{c.label}</span>
                  {!c.ok && <span className="text-[13px] text-muted-fg">{c.hint}</span>}
                </span>
                {!c.ok && c.to && <Link to={c.to} className="shrink-0 text-[13px] underline underline-offset-4">Beheben</Link>}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Backups" description="Automatisch täglich und vor jedem Update; die neuesten 14 bleiben erhalten. Für Offsite-Kopien herunterladen.">
          <Form method="post" className="mb-4"><input type="hidden" name="intent" value="backup" /><Button size="sm"><HardDriveDownload size={14} /> Backup jetzt erstellen</Button></Form>
          <DataTable head={["Backup", "Version", "Grösse", ""]} empty={!backups.length}>
            {backups.map((b) => (
              <tr key={b.name}>
                <td><span className="block">{new Date(b.createdAt).toLocaleString("de-CH")}</span><Badge tone={b.reason.startsWith("pre-update") ? "soft" : "neutral"}>{b.reason.startsWith("pre-update") ? "vor Update" : b.reason === "daily" ? "täglich" : "manuell"}</Badge></td>
                <td className="tabular-nums">{b.version}</td>
                <td className="tabular-nums text-muted-fg">{(b.size / 1024 / 1024).toFixed(1)} MB</td>
                <td className="whitespace-nowrap text-right">
                  <a href={`/admin/system/backups/${b.name}`} className="inline-grid h-9 w-9 place-items-center rounded-btn hover:bg-muted" aria-label="Herunterladen" title="Herunterladen"><Download size={15} /></a>
                  {b.kind === "embedded" && (
                    <Form method="post" className="inline" onSubmit={(e) => { if (!confirm(`Datenbank beim nächsten Neustart auf «${b.name}» zurücksetzen?`)) e.preventDefault(); }}>
                      <input type="hidden" name="intent" value="restore" /><input type="hidden" name="name" value={b.name} />
                      <Button variant="ghost" size="iconSm" aria-label="Wiederherstellen" title="Wiederherstellen"><RotateCcw size={15} /></Button>
                    </Form>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      </div>
    </>
  );
}
