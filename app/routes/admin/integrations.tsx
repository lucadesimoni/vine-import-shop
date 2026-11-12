import { desc, inArray } from "drizzle-orm";
import { data, Form, useActionData, useNavigation } from "react-router";
import { BookOpen, Play, RotateCw, Upload, Zap } from "lucide-react";
import type { Route } from "./+types/integrations";
import { getDb, schema } from "~/.server/db";
import { getSettings, saveSetting } from "~/.server/settings";
import { decodeUpload } from "~/.server/vinx/csv";
import { erpClient, lastSuccess, outboxCounts, processOutbox, retryOutbox, syncArticles, syncPrices, syncStock } from "~/.server/vinx/sync";
import { Badge, Button, Field, Input, Notice, Select, Textarea } from "~/components/ui";
import { DataTable, label, PageHeader, Panel, Stat, Toggle } from "~/components/admin";

export async function loader() {
  const db = await getDb();
  const [{ vinx }, logs, outbox, counts, last] = await Promise.all([
    getSettings("vinx"),
    db.select().from(schema.syncLog).orderBy(desc(schema.syncLog.id)).limit(15),
    db.select().from(schema.erpOutbox).where(inArray(schema.erpOutbox.status, ["pending", "retry", "failed"])).orderBy(desc(schema.erpOutbox.id)).limit(30),
    outboxCounts(),
    Promise.all(["articles", "stock", "prices", "outbox"].map(lastSuccess)),
  ]);
  return { vinx, logs, outbox, counts, last, secrets: { password: !!process.env.VINX_PASSWORD, cron: !!process.env.CRON_SECRET, webhook: !!process.env.VINX_WEBHOOK_SECRET } };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const { vinx } = await getSettings("vinx");
  if (intent === "config") {
    let mapping = vinx.mapping;
    try {
      mapping = JSON.parse(String(form.get("mapping")));
    } catch {
      return data({ message: "Mapping: JSON ungültig", ok: false }, { status: 400 });
    }
    await saveSetting("vinx", {
      ...vinx, mapping,
      enabled: form.has("enabled"), driver: form.get("driver"), baseUrl: String(form.get("baseUrl") ?? "").trim(), apiVersion: form.get("apiVersion"),
      username: String(form.get("username") ?? ""), livePrices: form.has("livePrices"), liveBasket: form.has("liveBasket"),
      pushOrders: form.has("pushOrders"), pushCustomers: form.has("pushCustomers"),
      promoArticleId: Number(form.get("promoArticleId")) || null,
    });
    return { ok: true, message: "Konfiguration gespeichert" };
  }
  if (intent === "retry") {
    await retryOutbox(Number(form.get("id")));
    const r = await processOutbox(undefined, 5);
    return { ok: r.ok, message: r.message };
  }
  if (intent === "csv") {
    const read = async (k: string) => { const f = form.get(k); return f instanceof File && f.size ? decodeUpload(await f.arrayBuffer()) : undefined; };
    const files = { articles: await read("articles"), stock: await read("stock"), prices: await read("prices") };
    const client = await erpClient(vinx, files);
    const out = [files.articles && (await syncArticles(client, true)), files.stock && (await syncStock(client)), files.prices && (await syncPrices(client))].filter(Boolean) as { message: string; ok: boolean }[];
    return { ok: out.every((x) => x.ok), message: out.map((x) => x.message).join(" · ") || "Keine Dateien gewählt" };
  }
  const client = await erpClient(vinx);
  try {
    const r =
      intent === "ping" ? { ok: true, message: await client.ping() }
      : intent === "articles" ? await syncArticles(client, form.has("full"))
      : intent === "stock" ? await syncStock(client)
      : intent === "prices" ? await syncPrices(client)
      : intent === "outbox" ? await processOutbox(client)
      : { ok: false, message: "unknown" };
    return { ok: r.ok, message: r.message };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

const JOBS = [
  ["ping", "Verbindung testen", Zap],
  ["articles", "Artikel (Delta)", Play],
  ["stock", "Lagerbestand", Play],
  ["prices", "Preislisten", Play],
  ["outbox", "Bestellungen senden", Play],
] as const;

export default function Integrations({ loaderData }: Route.ComponentProps) {
  const { vinx, logs, outbox, counts, last, secrets } = loaderData;
  const result = useActionData<typeof action>();
  const nav = useNavigation();
  const running = nav.state === "submitting" ? nav.formData?.get("intent") : null;
  const fmt = (d: Date | string | null) => (d ? new Date(d).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" }) : "—");

  return (
    <>
      <PageHeader
        title="vinX ERP"
        subtitle={<>Anbindung nach der offiziellen vinX REST3-Spezifikation (Shop V 2.0) · Treiber <Badge tone={vinx.driver === "mock" ? "warning" : "success"}>{{ mock: "Demo", rest3: "REST3", csv: "CSV" }[vinx.driver]}</Badge></>}
        actions={<a href="https://i-ag.atlassian.net/wiki/spaces/TD" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-btn border border-border-strong px-3.5 text-[13px] hover:border-fg"><BookOpen size={14} /> API-Doku</a>}
      />
      {result?.message && <Notice tone={result.ok ? "success" : "danger"} className="mb-6">{result.message}</Notice>}
      {vinx.driver === "mock" && <Notice tone="warning" className="mb-6">Demo-Modus: Es ist kein echtes vinX verbunden. Für den Live-Betrieb Treiber «REST3», Basis-URL, Benutzer und VINX_PASSWORD setzen. Der vinX-Demo-Server (vinxapi.i-ag.ch) kann bei support@i-ag.ch angefragt werden.</Notice>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Artikel" value={fmt(last[0])} hint="letzter Abgleich" />
        <Stat label="Lager" value={fmt(last[1])} hint="letzter Abgleich" />
        <Stat label="Warteschlange" value={(counts.pending ?? 0) + (counts.retry ?? 0)} hint={`${counts.sent ?? 0} übertragen`} />
        <Stat label="Fehlgeschlagen" value={counts.failed ?? 0} tone={counts.failed ? "danger" : undefined} hint="nach max. Versuchen" />
      </div>

      <Panel title="Aktionen" description="Automatisch: POST /api/cron (Bearer CRON_SECRET) alle 5–15 Min. oder `npm run jobs` per Cron." className="mt-6">
        <div className="flex flex-wrap gap-2">
          {JOBS.map(([intent, label, Icon]) => (
            <Form method="post" key={intent}>
              <input type="hidden" name="intent" value={intent} />
              <Button type="submit" variant="secondary" size="sm" disabled={!!running}><Icon size={13} className={running === intent ? "animate-pulse" : ""} /> {label}</Button>
            </Form>
          ))}
          <Form method="post"><input type="hidden" name="intent" value="articles" /><input type="hidden" name="full" value="1" /><Button type="submit" variant="secondary" size="sm" disabled={!!running}><RotateCw size={13} /> Artikel (Vollabgleich)</Button></Form>
        </div>
      </Panel>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Form method="post">
          <input type="hidden" name="intent" value="config" />
          <Panel title="Verbindung">
            <div className="grid gap-4">
              <div className="divide-y divide-border">
                <Toggle name="enabled" label="Integration aktiv" defaultChecked={vinx.enabled} />
                <Toggle name="pushOrders" label="Bestellungen an vinX (Warenkorb action=order / quote)" defaultChecked={vinx.pushOrders} />
                <Toggle name="pushCustomers" label="Neukunden als Onlineadresse" defaultChecked={vinx.pushCustomers} />
                <Toggle name="livePrices" label="Live-Preise (Calculated/ProductInfo)" defaultChecked={vinx.livePrices} />
                <Toggle name="liveBasket" label="Warenkorbberechnung durch vinX (B2B)" description="Konditionen, Aktionen, Gebinde, LSVA, Fracht" defaultChecked={vinx.liveBasket} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Treiber">{(id) => <Select id={id} name="driver" defaultValue={vinx.driver}><option value="mock">Demo (Mock)</option><option value="rest3">vinX REST3</option><option value="csv">CSV-Dateiaustausch</option></Select>}</Field>
                <Field label="API-Version">{(id) => <Select id={id} name="apiVersion" defaultValue={vinx.apiVersion}><option value="v2.0">Shop V 2.0</option><option value="v1.0">Shop V 1.0</option></Select>}</Field>
                <Field label="Basis-URL" className="sm:col-span-2">{(id) => <Input id={id} name="baseUrl" defaultValue={vinx.baseUrl} placeholder="https://vinx.ihre-firma.ch" />}</Field>
                <Field label="Benutzer">{(id) => <Input id={id} name="username" defaultValue={vinx.username} autoComplete="off" />}</Field>
                <Field label="Passwort" hint={secrets.password ? "VINX_PASSWORD gesetzt" : "Umgebungsvariable VINX_PASSWORD fehlt"}>{(id) => <Input id={id} disabled value="••••••••" readOnly />}</Field>
                <Field label="Aktionsartikel (Gutscheine)" hint="vinX-Artikel-ID für Rabattpositionen">{(id) => <Input id={id} name="promoArticleId" defaultValue={vinx.promoArticleId ?? ""} inputMode="numeric" />}</Field>
              </div>
              <Field label="Feld-Mapping (vinX → Shop)" hint="Mit der Swagger-Definition Ihrer Installation abgleichen (<Basis-URL>/swagger).">
                {(id) => <Textarea id={id} name="mapping" rows={12} spellCheck={false} defaultValue={JSON.stringify(vinx.mapping, null, 2)} className="font-mono text-[12px]" />}
              </Field>
              <Button type="submit" className="w-fit" disabled={running === "config"}>Speichern</Button>
            </div>
          </Panel>
        </Form>

        <div className="grid content-start gap-6">
          <Panel title="Dateiaustausch (CSV)" description="vinX-Exporte hochladen — UTF-8 oder Windows-1252, Trennzeichen automatisch.">
            <Form method="post" encType="multipart/form-data" className="grid gap-3">
              <input type="hidden" name="intent" value="csv" />
              {(["articles", "stock", "prices"] as const).map((k) => (
                <label key={k} className="grid grid-cols-[90px_1fr] items-center gap-3 text-sm">
                  <span className="text-muted-fg">{{ articles: "Artikel", stock: "Lager", prices: "Preise" }[k]}</span>
                  <Input type="file" name={k} accept=".csv,text/csv" className="h-auto py-1.5 text-[12px]" />
                </label>
              ))}
              <Button type="submit" variant="secondary" size="sm" className="w-fit"><Upload size={13} /> Importieren</Button>
            </Form>
          </Panel>

          <Panel title="Ausgang" description="Offene und fehlgeschlagene Übertragungen">
            {outbox.length === 0 ? (
              <p className="text-sm text-muted-fg">Alles übertragen ✓</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {outbox.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-2">
                    <Badge tone={o.status === "failed" ? "danger" : "warning"}>{label(o.status)}</Badge>
                    <span>{o.type} #{o.refId}</span>
                    <span className="text-muted-fg">{o.attempts}×</span>
                    {o.lastError && <code className="max-w-full truncate rounded bg-muted px-2 py-0.5 text-[11px]">{o.lastError}</code>}
                    <Form method="post" className="ml-auto"><input type="hidden" name="intent" value="retry" /><input type="hidden" name="id" value={o.id} /><Button type="submit" size="sm" variant="ghost"><RotateCw size={13} /> Retry</Button></Form>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Endpunkte & Geheimnisse">
            <dl className="grid gap-2 text-[13px]">
              {[["POST /api/cron", secrets.cron ? "CRON_SECRET ✓" : "CRON_SECRET fehlt"], ["POST /api/vinx/import", "CSV-Upload (Bearer CRON_SECRET)"], ["POST /api/vinx/webhook", secrets.webhook ? "VINX_WEBHOOK_SECRET ✓" : "optional — VINX_WEBHOOK_SECRET"]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><dt className="font-mono">{k}</dt><dd className="text-muted-fg">{v}</dd></div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>

      <h2 className="mb-3 mt-10 font-sans text-[15px] font-semibold">Protokoll</h2>
      <DataTable head={["Job", "Start", "Status", "Einträge", "Info"]} empty={!logs.length}>
        {logs.map((l) => (
          <tr key={l.id}>
            <td className="font-medium">{l.job}</td>
            <td className="whitespace-nowrap tabular-nums text-muted-fg">{fmt(l.startedAt)}</td>
            <td><Badge tone={l.status === "ok" ? "success" : l.status === "error" ? "danger" : "warning"}>{label(l.status)}</Badge></td>
            <td className="tabular-nums">{l.items}</td>
            <td className="max-w-md truncate text-muted-fg">{l.message}</td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
