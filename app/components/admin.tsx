import { useRef, useState, type ReactNode } from "react";
import { Form, Link, useNavigation, useSearchParams, useSubmit } from "react-router";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, Search, X } from "lucide-react";
import type { ListMeta } from "~/lib/list";
import { cn } from "~/lib/cn";
import { LOCALES, type Localized } from "~/lib/localized";
import { Button, buttonClass, Card, Input, Textarea } from "./ui";

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
    <Card className={cn("min-w-0 p-4 sm:p-6", className)}>
      {(title || actions) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="grid min-w-0 gap-1">
            {title && <h2 className="font-sans text-body font-semibold tracking-normal">{title}</h2>}
            {description && <p className="text-note text-muted-fg">{description}</p>}
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
      <span className="text-eyebrow text-2xs text-muted-fg">{label}</span>
      <span className="font-display text-[1.9rem] leading-none tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted-fg">{hint}</span>}
    </Card>
  );
}

export type Column = ReactNode | { label: ReactNode; sort?: string; className?: string };
type BulkAction = { value: string; label: string; tone?: "danger" };

/**
 * Admin table. Columns with `sort` become sortable header links (URL-driven, see .server/admin-list.ts).
 * With `bulk`, rows render <RowCheck id/> and a sticky action bar appears once rows are selected.
 */
export function DataTable({ head, children, empty, meta, bulk }: { head: Column[]; children: ReactNode; empty?: boolean | ReactNode; meta?: ListMeta; bulk?: BulkAction[] }) {
  const [selected, setSelected] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const boxes = () => [...(ref.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]') ?? [])];
  const recount = () => setSelected(boxes().filter((b) => b.checked).length);
  const all = selected > 0 && selected === boxes().length;
  return (
    <div ref={ref} onChange={bulk ? recount : undefined}>
      {bulk && <Form id="bulk" method="post" className="hidden"><input type="hidden" name="intent" value="bulk" /></Form>}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              {bulk && (
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" aria-label="Alle auswählen" checked={all} onChange={(e) => { boxes().forEach((b) => (b.checked = e.target.checked)); recount(); }} className="h-4 w-4 accent-primary" />
                </th>
              )}
              {head.map((h, i) => {
                const c = h && typeof h === "object" && "label" in h ? h : { label: h as ReactNode };
                return (
                  <th key={i} aria-sort={meta && c.sort === meta.sort ? (meta.dir === "asc" ? "ascending" : "descending") : undefined} className={cn("text-eyebrow whitespace-nowrap px-4 py-3 text-2xs font-semibold text-muted-fg", c.className)}>
                    {c.sort && meta ? <SortLink sort={c.sort} meta={meta}>{c.label}</SortLink> : c.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="[&>tr]:border-b [&>tr]:border-border [&>tr:last-child]:border-0 [&_td]:px-4 [&_td]:py-3 [&>tr:hover]:bg-muted/40 [&>tr:has(input[name=ids]:checked)]:bg-primary-soft/40">{children}</tbody>
        </table>
        {empty && <div className="px-4 py-12 text-center text-sm text-muted-fg">{empty === true ? "Keine Einträge gefunden." : empty}</div>}
      </Card>
      {meta && <Pager meta={meta} />}
      {bulk && selected > 0 && (
        <div className="sticky bottom-4 z-20 mx-auto mt-4 flex w-fit flex-wrap items-center gap-2 rounded-surface border border-border bg-fg px-4 py-2.5 text-bg shadow-card">
          <span className="mr-2 text-sm tabular-nums">{selected} ausgewählt</span>
          {bulk.map((a) => (
            <button key={a.value} form="bulk" name="action" value={a.value} className={cn("btn-label btn-text-sm h-8 rounded-btn px-3 transition-colors hover:bg-bg/15", a.tone === "danger" && "text-danger-soft")}>
              {a.label}
            </button>
          ))}
          <button type="button" onClick={() => { boxes().forEach((b) => (b.checked = false)); recount(); }} className="ml-1 rounded-btn p-1.5 hover:bg-bg/15" aria-label="Auswahl aufheben"><X size={14} /></button>
        </div>
      )}
    </div>
  );
}

/** Row checkbox for bulk actions (belongs to the table's hidden bulk form). */
export const RowCheck = ({ id, label }: { id: number; label?: string }) => (
  <td className="w-10"><input type="checkbox" name="ids" value={id} form="bulk" aria-label={label ?? `Auswahl ${id}`} className="h-4 w-4 accent-primary" /></td>
);

function withParams(params: URLSearchParams, patch: Record<string, string | null>) {
  const next = new URLSearchParams(params);
  for (const [k, v] of Object.entries(patch)) v === null ? next.delete(k) : next.set(k, v);
  return `?${next}`;
}

function SortLink({ sort, meta, children }: { sort: string; meta: ListMeta; children: ReactNode }) {
  const [params] = useSearchParams();
  const active = meta.sort === sort;
  const dir = active && meta.dir === "asc" ? "desc" : "asc";
  const Icon = !active ? ChevronsUpDown : meta.dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <Link to={withParams(params, { sort, dir, page: null })} preventScrollReset className={cn("inline-flex items-center gap-1 transition-colors hover:text-fg", active && "text-fg")}>
      {children} <Icon size={11} className={active ? "" : "opacity-40"} />
    </Link>
  );
}

export function Pager({ meta }: { meta: ListMeta }) {
  const [params] = useSearchParams();
  if (meta.pages <= 1) return null;
  const from = (meta.page - 1) * meta.perPage + 1;
  const to = Math.min(meta.total, meta.page * meta.perPage);
  const link = (page: number) => withParams(params, { page: page === 1 ? null : String(page) });
  return (
    <nav className="mt-4 flex items-center justify-between gap-4 text-note text-muted-fg" aria-label="Seiten">
      <span className="tabular-nums">{from}–{to} von {meta.total}</span>
      <span className="flex items-center gap-1">
        <Link to={link(meta.page - 1)} preventScrollReset aria-disabled={meta.page <= 1} className={cn(buttonClass({ variant: "secondary", size: "sm" }), meta.page <= 1 && "pointer-events-none opacity-40")}><ChevronLeft size={14} /> Zurück</Link>
        <span className="px-2 tabular-nums">{meta.page} / {meta.pages}</span>
        <Link to={link(meta.page + 1)} preventScrollReset aria-disabled={meta.page >= meta.pages} className={cn(buttonClass({ variant: "secondary", size: "sm" }), meta.page >= meta.pages && "pointer-events-none opacity-40")}>Weiter <ChevronRight size={14} /></Link>
      </span>
    </nav>
  );
}

/**
 * Search + filter bar. Search submits while typing (debounced), filters on change;
 * sort is kept, paging resets. Put <Select name="…"> filters in children.
 */
export function ListToolbar({ placeholder, children, meta, actions }: { placeholder: string; children?: ReactNode; meta?: ListMeta; actions?: ReactNode }) {
  const [params] = useSearchParams();
  const submit = useSubmit();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const send = (form: HTMLFormElement, delay = 0) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => submit(form, { replace: true, preventScrollReset: true }), delay);
  };
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <Form method="get" role="search" onChange={(e) => send(e.currentTarget, (e.target as HTMLElement).tagName === "INPUT" ? 250 : 0)} onSubmit={() => clearTimeout(timer.current)} className="flex flex-1 flex-wrap items-center gap-3">
        <div className="relative min-w-60 max-w-md flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
          <Input type="search" name="q" defaultValue={params.get("q") ?? ""} placeholder={placeholder} size="sm" className="pl-9" aria-label="Suchen" />
        </div>
        {children}
        {["sort", "dir", "per"].map((k) => params.get(k) && <input key={k} type="hidden" name={k} value={params.get(k)!} />)}
        {meta && <span className="text-note text-muted-fg tabular-nums">{meta.total} {meta.total === 1 ? "Eintrag" : "Einträge"}</span>}
      </Form>
      {actions}
    </div>
  );
}

/** Localized field: one input per active locale behind a compact language switch (all values are submitted). */
export function LocalizedInput({ name, value, locales, multiline = false, rows = 3, label }: { name: string; value?: Localized; locales: string[]; multiline?: boolean; rows?: number; label?: string }) {
  const active = LOCALES.filter((l) => locales.includes(l));
  const [current, setCurrent] = useState(active[0]);
  return (
    <div className="grid content-start gap-1.5">
      <div className="flex h-6 items-end justify-between gap-3">
        {label && <span className="text-field-label truncate">{label}</span>}
        {active.length > 1 && (
          <div className="ml-auto flex rounded-control bg-muted p-0.5" role="tablist" aria-label="Sprache">
            {active.map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={current === l}
                onClick={() => setCurrent(l)}
                className={cn("relative rounded-badge px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider transition-colors", current === l ? "bg-surface text-fg shadow-sm" : "text-muted-fg hover:text-fg")}
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
    <div className="sticky bottom-0 z-10 -mx-4 mt-8 flex items-center justify-end gap-3 border-t border-border bg-bg/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:-mx-10 md:px-10 md:py-4">
      {saved && !busy && <span className="flex items-center gap-1.5 text-sm text-success"><Check size={16} /> Gespeichert</span>}
      <Button type="submit" disabled={busy}>{busy ? "Speichert …" : label}</Button>
    </div>
  );
}

export function Toggle({ name, label, description, defaultChecked, disabled }: { name: string; label: string; description?: string; defaultChecked?: boolean; disabled?: boolean }) {
  return (
    <label className={cn("flex items-start justify-between gap-6 py-3", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
      <span className="grid min-w-0 gap-0.5 [overflow-wrap:anywhere]">
        <span className="text-sm font-medium">{label}</span>
        {description && <span className="text-note text-muted-fg">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} className="peer sr-only" />
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
