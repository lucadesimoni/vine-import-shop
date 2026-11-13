import { asc } from "drizzle-orm";
import { data, Form, Link, useActionData, useNavigation } from "react-router";
import { ArrowLeft, FileSpreadsheet, Upload } from "lucide-react";
import type { Route } from "./+types/customers-import";
import { getDb, schema } from "~/.server/db";
import { erpConnected } from "~/.server/erp-ownership";
import { readTable, type Table } from "~/.server/import/table";
import { detectMapping, importCustomers, toRows } from "~/.server/import/customers";
import { FIELDS, type FieldKey } from "~/lib/import-fields";
import { Badge, Button, Field, Notice, Select } from "~/components/ui";
import { DataTable, PageHeader, Panel, Toggle } from "~/components/admin";

const LABELS: Record<FieldKey, string> = {
  email: "E-Mail *", name: "Name", firstName: "Vorname", lastName: "Nachname", company: "Firma", uid: "UID / MWST-Nr.", phone: "Telefon",
  street: "Strasse", zip: "PLZ", city: "Ort", country: "Land", language: "Sprache", group: "Kundengruppe", erpId: "Kunden- / ERP-Nummer", b2b: "Geschäftskunde (ja/nein)",
};

export async function loader() {
  const db = await getDb();
  return { groups: await db.select({ id: schema.customerGroups.id, name: schema.customerGroups.name }).from(schema.customerGroups).orderBy(asc(schema.customerGroups.id)), erp: await erpConnected() };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  if (form.get("intent") === "preview") {
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return data({ error: "Bitte eine Datei wählen (CSV oder XML)." }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) return data({ error: "Datei zu gross (max. 15 MB)." }, { status: 400 });
    try {
      const table = readTable(file.name, new Uint8Array(await file.arrayBuffer()));
      if (!table.rows.length) return data({ error: "Keine Datenzeilen gefunden." }, { status: 400 });
      return { step: "map" as const, fileName: file.name, table, mapping: detectMapping(table.headers) };
    } catch (e) {
      return data({ error: (e as Error).message }, { status: 400 });
    }
  }
  if (form.get("intent") === "import") {
    const table = JSON.parse(String(form.get("table") ?? "{}")) as Table;
    if (!Array.isArray(table.headers) || !Array.isArray(table.rows)) return data({ error: "Ungültige Daten — bitte Datei erneut hochladen." }, { status: 400 });
    const mapping = Object.fromEntries((Object.keys(FIELDS) as FieldKey[]).map((k) => [k, String(form.get(`map.${k}`) ?? "")]).filter(([, v]) => v && table.headers.includes(v)));
    if (!mapping.email) return data({ error: "Die Spalte für die E-Mail-Adresse muss zugeordnet sein." }, { status: 400 });
    const result = await importCustomers(toRows(table, mapping), {
      update: form.has("update"), approveB2b: form.has("approveB2b"), invite: form.has("invite"), pushToErp: form.has("pushToErp"),
      defaultGroup: Number(form.get("defaultGroup")) || null, origin: new URL(request.url).origin,
    });
    return { step: "done" as const, result };
  }
  return data({ error: "unknown" }, { status: 400 });
}

export default function CustomersImport({ loaderData }: Route.ComponentProps) {
  const { groups, erp } = loaderData;
  const res = useActionData<typeof action>();
  const busy = useNavigation().state === "submitting";
  return (
    <>
      <Link to="/admin/customers" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-fg hover:text-fg"><ArrowLeft size={14} /> Kunden</Link>
      <PageHeader title="Kunden importieren" subtitle="CSV oder XML — aus einem alten Shop, einem ERP-Export oder einer Tabelle. Bestehende Kunden werden über Kundennummer oder E-Mail erkannt." />
      {res && "error" in res && <Notice tone="danger" className="mb-6">{res.error}</Notice>}

      {res && "step" in res && res.step === "done" ? (
        <Panel title="Import abgeschlossen">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[["Neu angelegt", res.result.created], ["Aktualisiert", res.result.updated], ["Übersprungen", res.result.skipped], ["Einladungen", res.result.invited]].map(([l, n]) => (
              <div key={l} className="grid gap-1"><dt className="text-xs text-muted-fg">{l}</dt><dd className="font-display text-3xl tabular-nums">{n}</dd></div>
            ))}
          </dl>
          {res.result.errors.length > 0 && (
            <div className="mt-6 grid gap-2">
              <p className="text-sm font-medium">{res.result.errors.length} Zeilen nicht importiert</p>
              <ul className="grid max-h-64 gap-1 overflow-y-auto text-note text-muted-fg">{res.result.errors.slice(0, 200).map((e) => <li key={e.line}>Zeile {e.line}: {e.message}</li>)}</ul>
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-2"><Link to="/admin/customers" className="text-sm underline underline-offset-4">Zu den Kunden</Link></div>
        </Panel>
      ) : res && "step" in res && res.step === "map" ? (
        <Form method="post" className="grid gap-6">
          <input type="hidden" name="intent" value="import" />
          <input type="hidden" name="table" value={JSON.stringify(res.table)} />
          <Panel title={`Spalten zuordnen · ${res.fileName}`} description={`${res.table.rows.length.toLocaleString("de-CH")} Zeilen erkannt. Zuordnung automatisch vorgeschlagen — bitte prüfen.`}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.keys(FIELDS) as FieldKey[]).map((k) => (
                <Field key={k} label={LABELS[k]}>
                  {(id) => (
                    <Select id={id} name={`map.${k}`} defaultValue={res.mapping[k] ?? ""} size="sm">
                      <option value="">— nicht importieren —</option>
                      {res.table.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </Select>
                  )}
                </Field>
              ))}
            </div>
          </Panel>
          <Panel title="Vorschau" description="Die ersten Zeilen der Datei.">
            <DataTable head={res.table.headers.slice(0, 8)}>
              {res.table.rows.slice(0, 6).map((r, i) => <tr key={i}>{res.table.headers.slice(0, 8).map((h) => <td key={h} className="max-w-48 truncate text-note">{r[h]}</td>)}</tr>)}
            </DataTable>
          </Panel>
          <Panel title="Optionen">
            <div className="divide-y divide-border">
              <Toggle name="update" label="Bestehende Kunden aktualisieren" description="Erkannt über Kundennummer, sonst E-Mail" defaultChecked />
              <Toggle name="approveB2b" label="Geschäftskunden direkt freischalten" description="Zeilen mit Firma (oder B2B = ja) erhalten Zugang zum Portal" defaultChecked />
              <Toggle name="invite" label="Einladung per E-Mail senden" description="Neue Kunden erhalten einen Link, um ihr Passwort festzulegen (14 Tage gültig)" />
              {erp && <Toggle name="pushToErp" label="An vinX übertragen" description="Kunden ohne Kundennummer werden in vinX als Onlineadresse angelegt" />}
            </div>
            <Field label="Kundengruppe, wenn nicht in der Datei" className="mt-4 max-w-sm">
              {(id) => <Select id={id} name="defaultGroup" defaultValue=""><option value="">Automatisch (Privat / Handel)</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>}
            </Field>
          </Panel>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>{busy ? "Importiert …" : `${res.table.rows.length.toLocaleString("de-CH")} Zeilen importieren`}</Button>
            <Link to="/admin/customers/import" className="text-sm text-muted-fg hover:text-fg">Andere Datei</Link>
          </div>
        </Form>
      ) : (
        <Form method="post" encType="multipart/form-data" className="grid gap-6">
          <input type="hidden" name="intent" value="preview" />
          <Panel title="Datei wählen" description="CSV (Semikolon, Komma oder Tab — z. B. aus Excel «CSV UTF-8») oder XML (ein Element pro Kunde). Bei CSV: erste Zeile = Spaltennamen.">
            <label className="flex cursor-pointer flex-col items-center gap-3 rounded-surface border border-dashed border-border-strong px-6 py-10 text-center transition-colors hover:border-primary">
              <Upload size={22} strokeWidth={1.5} className="text-muted-fg" />
              <span className="text-sm">Datei auswählen</span>
              <input type="file" name="file" accept=".csv,.tsv,.txt,.xml,text/csv,application/xml,text/xml" className="max-w-full text-note" required />
            </label>
            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-muted-fg">
              <FileSpreadsheet size={14} /> Erkannte Spalten u. a.:
              {["E-Mail", "Firma", "Vorname", "Nachname", "Strasse", "PLZ", "Ort", "Land", "Kundennummer", "Kundengruppe", "UID"].map((c) => <Badge key={c}>{c}</Badge>)}
            </div>
          </Panel>
          <Button type="submit" className="w-fit" disabled={busy}>{busy ? "Liest …" : "Weiter zur Zuordnung"}</Button>
        </Form>
      )}
    </>
  );
}
