import { useState, type ReactNode } from "react";
import { Form, useNavigation } from "react-router";
import { Check } from "lucide-react";
import { cn } from "~/lib/cn";
import { LOCALES, type Localized } from "~/lib/localized";
import { Button, Card, Input, Textarea } from "./ui";

/* Admin building blocks — same tokens & primitives as the storefront. */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-1.5">
        <h1 className="font-display text-[2rem] leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-fg">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ title, description, children, className, actions }: { title?: string; description?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <Card className={cn("p-6", className)}>
      {(title || actions) && (
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="grid gap-1">
            {title && <h2 className="font-sans text-[15px] font-semibold tracking-normal">{title}</h2>}
            {description && <p className="text-[13px] text-muted-fg">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </Card>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "danger" | "warning" }) {
  return (
    <Card className={cn("grid gap-2 p-5", tone === "danger" && "border-danger/30 bg-danger-soft", tone === "warning" && "border-warning/30 bg-warning-soft")}>
      <span className="text-eyebrow text-[10px] text-muted-fg">{label}</span>
      <span className="font-display text-[1.9rem] leading-none tabular-nums">{value}</span>
      {hint && <span className="text-[12px] text-muted-fg">{hint}</span>}
    </Card>
  );
}

export function DataTable({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            {head.map((h, i) => <th key={i} className="text-eyebrow whitespace-nowrap px-4 py-3 text-[10px] font-semibold text-muted-fg">{h}</th>)}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-border [&>tr:last-child]:border-0 [&_td]:px-4 [&_td]:py-3 [&>tr:hover]:bg-muted/40">{children}</tbody>
      </table>
      {empty && <p className="px-4 py-10 text-center text-sm text-muted-fg">—</p>}
    </Card>
  );
}

/** Localized field: one input per active locale behind a compact language switch (all values are submitted). */
export function LocalizedInput({ name, value, locales, multiline = false, rows = 3, label }: { name: string; value?: Localized; locales: string[]; multiline?: boolean; rows?: number; label?: string }) {
  const active = LOCALES.filter((l) => locales.includes(l));
  const [current, setCurrent] = useState(active[0]);
  return (
    <div className="grid content-start gap-1.5">
      <div className="flex items-center justify-between gap-3">
        {label && <span className="text-[12px] font-medium uppercase tracking-[0.1em] text-muted-fg">{label}</span>}
        {active.length > 1 && (
          <div className="ml-auto flex rounded-control bg-muted p-0.5" role="tablist" aria-label="Sprache">
            {active.map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={current === l}
                onClick={() => setCurrent(l)}
                className={cn("relative rounded-badge px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors", current === l ? "bg-surface text-fg shadow-sm" : "text-muted-fg hover:text-fg")}
              >
                {l}
                {!value?.[l] && l !== active[0] && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-warning" title="leer" />}
              </button>
            ))}
          </div>
        )}
      </div>
      {active.map((l) =>
        multiline ? (
          <Textarea key={l} name={`${name}.${l}`} defaultValue={value?.[l] ?? ""} rows={rows} hidden={l !== current} lang={l} />
        ) : (
          <Input key={l} name={`${name}.${l}`} defaultValue={value?.[l] ?? ""} hidden={l !== current} lang={l} />
        ),
      )}
    </div>
  );
}

export function SaveBar({ saved, label = "Speichern" }: { saved?: boolean; label?: string }) {
  const busy = useNavigation().state === "submitting";
  return (
    <div className="sticky bottom-0 z-10 -mx-6 mt-8 flex items-center justify-end gap-3 border-t border-border bg-bg/90 px-6 py-4 backdrop-blur md:-mx-10 md:px-10">
      {saved && !busy && <span className="flex items-center gap-1.5 text-sm text-success"><Check size={16} /> Gespeichert</span>}
      <Button type="submit" disabled={busy}>{busy ? "Speichert …" : label}</Button>
    </div>
  );
}

export function Toggle({ name, label, description, defaultChecked }: { name: string; label: string; description?: string; defaultChecked?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-6 py-3">
      <span className="grid gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {description && <span className="text-[13px] text-muted-fg">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-border-strong/60 transition-colors peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow-card transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

/** Parse "a.b.c" keyed FormData into a nested object (used by settings forms). */
export function formToObject(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of form.entries()) {
    if (key.startsWith("_") || raw instanceof File) continue;
    const parts = key.split(".");
    let node = out as Record<string, unknown>;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) node[p] = raw;
      else node = (node[p] ??= {}) as Record<string, unknown>;
    });
  }
  return out;
}

export const LABELS: Record<string, string> = {
  new: "Neu", confirmed: "Bestätigt", processing: "In Bearbeitung", shipped: "Versandt", completed: "Abgeschlossen", cancelled: "Storniert",
  pending: "Ausstehend", paid: "Bezahlt", failed: "Fehler", transferred: "Übertragen", retry: "Wiederholung", sent: "Gesendet",
  invoice: "Rechnung", prepayment: "Vorauskasse", stripe: "Karte/TWINT", request: "Offerte", approved: "Freigegeben", rejected: "Abgelehnt",
  ok: "OK", error: "Fehler", running: "Läuft",
};
export const label = (code: string) => LABELS[code] ?? code;

export { Form };
