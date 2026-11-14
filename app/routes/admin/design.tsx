import { useMemo, useRef, useState } from "react";
import { Form, useActionData } from "react-router";
import { ArrowRight, ShoppingBag } from "lucide-react";
import type { Route } from "./+types/design";
import { getScopedSettings, saveSetting } from "~/.server/settings";
import { adminScope, resetScope } from "~/.server/admin-scope";
import { saveUpload } from "~/.server/storage";
import { BODY_FONTS, DISPLAY_FONTS, type Brand } from "~/lib/settings";
import { fontsHref, themeVars } from "~/lib/theme";
import { Badge, Button, Field, Input, Select } from "~/components/ui";
import { formToObject, LocalizedInput, PageHeader, Panel, SaveBar, ScopeBar } from "~/components/admin";

export async function loader({ request }: Route.LoaderArgs) {
  const { slug, scope } = await adminScope(request, ["brand"]);
  const { brand, shop } = await getScopedSettings(slug, "brand", "shop");
  return { brand, locales: shop.locales, scope };
}

export async function action({ request }: Route.ActionArgs) {
  const { slug } = await adminScope(request, []);
  const form = await request.formData();
  if (form.get("intent") === "scope-reset") return { ok: await resetScope(slug, ["brand"]) };
  const o = formToObject(form) as Record<string, any>;
  const { brand: current } = await getScopedSettings(slug, "brand");
  for (const key of ["logo", "logoInverse", "favicon"] as const) {
    const f = form.get(`${key}File`);
    if (f instanceof File && f.size) o[`${key}Url`] = await saveUpload(f, "brand");
  }
  const hours = String(o.hoursText ?? "")
    .split("\n")
    .map((l: string) => l.split("|").map((x) => x.trim()))
    .filter((p: string[]) => p[0] && p[1])
    .map(([label, value]: string[]) => ({ label: { de: label }, value }));
  const next: Brand = {
    ...current,
    ...o,
    radius: Number(o.radius ?? current.radius),
    colors: { ...current.colors, ...o.colors },
    fonts: { ...current.fonts, ...o.fonts, displayUppercaseEyebrows: true },
    contact: { ...current.contact, ...o.contact, hours: hours.length ? hours : current.contact.hours },
  };
  await saveSetting("brand", next, slug);
  return { ok: true };
}

const COLOR_FIELDS: [keyof Brand["colors"], string, string][] = [
  ["primary", "Primärfarbe", "Buttons, Akzente, Ankündigungsleiste"],
  ["primaryForeground", "Text auf Primär", ""],
  ["background", "Hintergrund", "Seitenhintergrund"],
  ["foreground", "Text", "Fliesstext & Titel"],
  ["card", "Flächen", "Karten, Formulare"],
  ["muted", "Gedämpft", "Sekundäre Flächen"],
  ["mutedForeground", "Gedämpfter Text", "Hilfstexte, Metadaten"],
  ["border", "Linien", "Rahmen & Trenner"],
  ["accent", "Akzent", "Dekor, Hervorhebungen"],
  ["inverse", "Dunkle Sektion", "Footer, Kontrastflächen"],
  ["inverseForeground", "Text auf dunkel", ""],
];

export default function Design({ loaderData }: Route.ComponentProps) {
  const { brand, locales, scope } = loaderData;
  const saved = useActionData<typeof action>();
  const [draft, setDraft] = useState<Brand>(brand);
  const formRef = useRef<HTMLFormElement>(null);

  // Live preview: re-read the form on every change and project it onto the token layer.
  const onChange = () => {
    const f = formRef.current;
    if (!f) return;
    const o = formToObject(new FormData(f)) as Record<string, any>;
    setDraft((d) => ({ ...d, name: o.name ?? d.name, claim: o.claim ?? d.claim, radius: Number(o.radius), buttonStyle: o.buttonStyle, colors: { ...d.colors, ...o.colors }, fonts: { ...d.fonts, ...o.fonts } }));
  };
  const vars = useMemo(() => themeVars(draft) as React.CSSProperties, [draft]);

  return (
    <>
    <PageHeader title="Design & Marke" subtitle="Alle Farben, Schriften und Formen sind Design-Tokens — Änderungen gelten sofort im ganzen Shop und in E-Mails." />
    <ScopeBar scope={scope} keys={["brand"]} label="Marke & Design" />
    <Form method="post" encType="multipart/form-data" ref={formRef} onChange={onChange} key={scope.current ?? "main"}>
      <link rel="stylesheet" href={fontsHref(draft)} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="grid content-start gap-6">
          <Panel title="Identität">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Markenname">{(id) => <Input id={id} name="name" defaultValue={brand.name} required />}</Field>
              <Field label="Firmenname (rechtlich)">{(id) => <Input id={id} name="legalName" defaultValue={brand.legalName} />}</Field>
              <Field label="Claim unter dem Logo">{(id) => <Input id={id} name="claim" defaultValue={brand.claim} placeholder="z. B. Seit 1917" />}</Field>
              <div />
              <div className="sm:col-span-2"><LocalizedInput label="Tagline (SEO-Beschreibung)" name="tagline" value={brand.tagline} locales={locales} /></div>
              <div className="sm:col-span-2"><LocalizedInput label="Ankündigungsleiste (leer = aus)" name="announcement" value={brand.announcement} locales={locales} /></div>
              <div className="sm:col-span-2"><LocalizedInput label="Zitat im Footer" name="footerQuote" value={brand.footerQuote} locales={locales} /></div>
            </div>
          </Panel>

          <Panel title="Logo & Icon" description="PNG, WebP oder JPG, max. 8 MB. Dunkle Variante für helle Flächen, helle für Footer.">
            <div className="grid gap-5 sm:grid-cols-3">
              {([["logo", "Logo (für hellen Grund)", brand.logoUrl, "bg-bg"], ["logoInverse", "Logo (für dunklen Grund)", brand.logoInverseUrl, "bg-inverse"], ["favicon", "Favicon", brand.faviconUrl, "bg-bg"]] as const).map(([k, label, url, bg]) => (
                <div key={k} className="grid gap-2">
                  <span className="text-field-label">{label}</span>
                  <div className={`grid h-24 place-items-center rounded-control border border-border ${bg}`}>{url ? <img src={url} alt="" className="max-h-16 max-w-[80%]" /> : <span className="text-xs text-muted-fg">—</span>}</div>
                  <input type="hidden" name={`${k}Url`} value={url} />
                  <Input type="file" name={`${k}File`} accept="image/png,image/webp,image/jpeg" aria-label={`${label} hochladen`} className="h-auto py-1.5 text-[0px] file:mr-0 file:w-full" />
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Farben" description="Kontrast prüfen: Text auf Primär und Text auf dunkel sollten gut lesbar sein.">
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {COLOR_FIELDS.map(([key, label, hint]) => (
                <label key={key} className="flex items-center gap-3">
                  <input type="color" name={`colors.${key}`} defaultValue={brand.colors[key]} className="h-10 w-12 cursor-pointer rounded-control border border-border bg-surface p-1" />
                  <span className="grid">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-xs text-muted-fg">{hint || brand.colors[key]}</span>
                  </span>
                </label>
              ))}
            </div>
          </Panel>

          <Panel title="Typografie & Form">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Titelschrift">{(id) => <Select id={id} name="fonts.display" defaultValue={brand.fonts.display}>{DISPLAY_FONTS.map((f) => <option key={f}>{f}</option>)}</Select>}</Field>
              <Field label="Textschrift">{(id) => <Select id={id} name="fonts.body" defaultValue={brand.fonts.body}>{BODY_FONTS.map((f) => <option key={f}>{f}</option>)}</Select>}</Field>
              <Field label={`Eckenradius · ${draft.radius}px`}>{(id) => <input id={id} type="range" name="radius" min={0} max={20} defaultValue={brand.radius} className="h-11 w-full accent-[var(--t-primary)]" />}</Field>
              <Field label="Buttons">{(id) => <Select id={id} name="buttonStyle" defaultValue={brand.buttonStyle}><option value="square">Eckig</option><option value="rounded">Abgerundet</option><option value="pill">Pille</option></Select>}</Field>
              <Field label="Button-Beschriftung">{(id) => <Select id={id} name="buttonCase" defaultValue={brand.buttonCase}><option value="normal">Normal</option><option value="upper">VERSALIEN, gesperrt</option></Select>}</Field>
              <Field label="Dunkelmodus" hint="Dunkle Farben werden aus der Marke abgeleitet (Kontrast ≥ 4.5:1).">{(id) => <Select id={id} name="darkMode" defaultValue={brand.darkMode}><option value="toggle">System + Umschalter für Besucher</option><option value="system">Folgt dem Betriebssystem</option><option value="off">Aus (immer hell)</option></Select>}</Field>
            </div>
          </Panel>

          <Panel title="Kontakt & Öffnungszeiten" description="Erscheint im Footer, auf der Kontaktseite und in E-Mails.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Strasse">{(id) => <Input id={id} name="contact.street" defaultValue={brand.contact.street} />}</Field>
              <div className="grid grid-cols-[100px_1fr] gap-3">
                <Field label="PLZ">{(id) => <Input id={id} name="contact.zip" defaultValue={brand.contact.zip} />}</Field>
                <Field label="Ort">{(id) => <Input id={id} name="contact.city" defaultValue={brand.contact.city} />}</Field>
              </div>
              <Field label="Land">{(id) => <Input id={id} name="contact.country" defaultValue={brand.contact.country} />}</Field>
              <Field label="Telefon">{(id) => <Input id={id} name="contact.phone" defaultValue={brand.contact.phone} />}</Field>
              <Field label="E-Mail">{(id) => <Input id={id} name="contact.email" type="email" defaultValue={brand.contact.email} />}</Field>
              <Field label="UID / MWST-Nr.">{(id) => <Input id={id} name="contact.uid" defaultValue={brand.contact.uid} />}</Field>
              <Field label="Öffnungszeiten" hint="Eine Zeile pro Eintrag: Bezeichnung | Zeiten" className="sm:col-span-2">
                {(id) => <textarea id={id} name="hoursText" rows={3} defaultValue={brand.contact.hours.map((h) => `${h.label.de ?? ""} | ${h.value}`).join("\n")} className="w-full rounded-control border border-border-strong/70 bg-surface px-3.5 py-3 text-sm outline-none focus:border-fg" />}
              </Field>
            </div>
          </Panel>
        </div>

        {/* Live preview — the same components, scoped to the draft tokens */}
        <aside className="xl:sticky xl:top-8 xl:self-start">
          <p className="text-eyebrow mb-3 text-2xs text-muted-fg">Live-Vorschau</p>
          <div style={vars} className="overflow-hidden rounded-surface border border-border bg-bg text-fg font-sans shadow-card">
            <div className="bg-primary px-4 py-1.5 text-center text-2xs text-on-primary">Ankündigungsleiste</div>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2.5">
                {brand.logoUrl ? <img src={brand.logoUrl} alt="" className="h-8" /> : <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-on-primary">{draft.name[0]}</span>}
                <span className="grid leading-none"><span className="font-display text-lg">{draft.name}</span><span className="text-eyebrow mt-1 text-2xs text-muted-fg">{draft.claim}</span></span>
              </div>
              <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider"><ShoppingBag size={14} /> 3</span>
            </div>
            <div className="grid gap-4 p-6">
              <p className="text-eyebrow text-2xs text-muted-fg">Eyebrow · Kategorie</p>
              <h3 className="font-display text-4xl leading-none">Il gusto Italiano</h3>
              <p className="text-sm text-muted-fg">Fliesstext in der gewählten Textschrift mit gedämpften Metadaten.</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm">Primär <ArrowRight size={13} /></Button>
                <Button type="button" size="sm" variant="secondary">Sekundär</Button>
                <Badge tone="primary">Aktion</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {["Rotwein", "Pasta"].map((x) => (
                  <div key={x} className="rounded-surface border border-border bg-surface p-3">
                    <div className="mb-3 aspect-[4/3] rounded-control bg-muted" />
                    <p className="text-eyebrow text-2xs text-muted-fg">{x}</p>
                    <p className="text-note font-medium">Produktname</p>
                    <p className="mt-1 text-xs font-semibold">CHF 24.50</p>
                  </div>
                ))}
              </div>
              <Input placeholder="Eingabefeld" aria-label="Vorschau Eingabefeld" tabIndex={-1} readOnly className="h-9 text-sm" />
            </div>
            <div className="bg-inverse px-6 py-5 text-xs text-on-inverse">Footer · {draft.name}</div>
          </div>
        </aside>
      </div>
      <SaveBar saved={!!saved} />
    </Form>
    </>
  );
}
