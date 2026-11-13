import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlignLeft, ArrowDown, ArrowUp, BadgeCheck, ChevronDown, CircleHelp, Columns2, Copy, Eye, EyeOff, GripVertical, Image, ImagePlus, LayoutGrid,
  Loader2, Map as MapIcon, Megaphone, Plus, Quote, Sparkles, Trash2, Upload, Wine, Grape, Puzzle, X, type LucideIcon,
} from "lucide-react";
import { BLOCKS, blockDef, newBlock, newBlockId, type Block, type BlockDef, type Field } from "~/lib/blocks";
import { LOCALES, type Localized } from "~/lib/localized";
import { cn } from "~/lib/cn";
import { CUSTOM_BLOCKS } from "./blocks";
import { Button, Input, Select, Textarea } from "./ui";

/**
 * Page-builder editor: drag & drop (handle) or arrows to reorder, eye to hide, duplicate, delete,
 * add from the block library, edit fields inline. The result is submitted as JSON in a hidden input
 * and sanitised on the server (.server/blocks.ts → sanitizeBlocks).
 */

const ICONS: Record<string, LucideIcon> = {
  image: Image, "layout-grid": LayoutGrid, wine: Wine, sparkles: Sparkles, "columns-2": Columns2, "align-left": AlignLeft, megaphone: Megaphone,
  grape: Grape, map: MapIcon, "badge-check": BadgeCheck, quote: Quote, "image-plus": ImagePlus, "circle-help": CircleHelp,
};
const Icon = ({ name, size = 16 }: { name: string; size?: number }) => {
  const I = ICONS[name] ?? Puzzle;
  return <I size={size} strokeWidth={1.6} />;
};

export type EditorOptions = { products: [string, string][]; categories: [string, string][]; producers: [string, string][] };

export function BlockEditor({ name, initial, locales, options, only }: { name: string; initial: Block[]; locales: string[]; options: EditorOptions; only?: string[] }) {
  const defs = useMemo(() => [...BLOCKS, ...CUSTOM_BLOCKS].filter((d) => !only || only.includes(d.type)), [only]);
  const [blocks, setBlocks] = useState<Block[]>(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [library, setLibrary] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const handle = useRef(false);
  const dirty = JSON.stringify(blocks) !== JSON.stringify(initial);

  const update = (id: string, patch: Partial<Block>) => setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const move = (from: number, to: number) => setBlocks((bs) => {
    if (to < 0 || to > bs.length || from === to || to === from + 1) return bs;
    const next = [...bs];
    const [x] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, x);
    return next;
  });
  const add = (def: BlockDef) => {
    const b = newBlock(def);
    setBlocks((bs) => [...bs, b]);
    setOpen(b.id);
    setLibrary(false);
    requestAnimationFrame(() => document.getElementById(`block-${b.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  return (
    <div className="grid gap-3">
      <input type="hidden" name={name} value={JSON.stringify(blocks)} />
      {dirty && <p className="flex items-center gap-2 text-note text-warning"><span className="h-1.5 w-1.5 rounded-full bg-warning" /> Ungespeicherte Änderungen</p>}

      <ol className="grid gap-2" onDragOver={(e) => e.preventDefault()}>
        {blocks.map((b, i) => {
          const def = blockDef(b.type, CUSTOM_BLOCKS);
          const expanded = open === b.id;
          return (
            <li
              key={b.id}
              id={`block-${b.id}`}
              draggable
              onDragStart={(e) => { if (!handle.current) { e.preventDefault(); return; } setDrag(i); e.dataTransfer.effectAllowed = "move"; }}
              onDragEnd={() => { setDrag(null); setOver(null); handle.current = false; }}
              onDragOver={(e) => { if (drag === null) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setOver(e.clientY < r.top + r.height / 2 ? i : i + 1); }}
              onDrop={(e) => { e.preventDefault(); if (drag !== null && over !== null) move(drag, over); setDrag(null); setOver(null); }}
              className={cn(
                "relative rounded-surface border bg-surface transition-[opacity,box-shadow]",
                expanded ? "border-border-strong shadow-card" : "border-border",
                !b.enabled && "opacity-60",
                drag === i && "opacity-40",
                over === i && drag !== null && drag !== i && "before:absolute before:-top-1.5 before:inset-x-2 before:h-0.5 before:rounded-full before:bg-primary",
                over === i + 1 && i === blocks.length - 1 && drag !== null && "after:absolute after:-bottom-1.5 after:inset-x-2 after:h-0.5 after:rounded-full after:bg-primary",
              )}
            >
              <div className="flex items-center gap-1 py-1.5 pl-1 pr-2 sm:gap-2">
                <span
                  onPointerDown={() => (handle.current = true)}
                  onPointerUp={() => (handle.current = false)}
                  className="hidden cursor-grab touch-none p-2 text-muted-fg hover:text-fg active:cursor-grabbing sm:block"
                  title="Ziehen zum Verschieben"
                  aria-hidden
                >
                  <GripVertical size={16} />
                </span>
                <button type="button" onClick={() => setOpen(expanded ? null : b.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-muted/60" aria-expanded={expanded}>
                  <span className="hidden h-8 w-8 shrink-0 place-items-center rounded-control bg-muted text-fg/80 min-[400px]:grid"><Icon name={def?.icon ?? "puzzle"} /></span>
                  <span className="grid min-w-0">
                    <span className="text-sm font-medium">{def?.label ?? b.type}</span>
                    <span className="truncate text-xs text-muted-fg">{def?.summary?.(b.data) || def?.description}</span>
                  </span>
                  <ChevronDown size={16} className={cn("ml-auto shrink-0 text-muted-fg transition-transform", expanded && "rotate-180")} />
                </button>
                <IconBtn label={b.enabled ? "Ausblenden" : "Einblenden"} onClick={() => update(b.id, { enabled: !b.enabled })}>{b.enabled ? <Eye size={16} /> : <EyeOff size={16} />}</IconBtn>
                <IconBtn label="Nach oben" onClick={() => move(i, i - 1)} disabled={i === 0}><ArrowUp size={16} /></IconBtn>
                <IconBtn label="Nach unten" onClick={() => move(i, i + 2)} disabled={i === blocks.length - 1}><ArrowDown size={16} /></IconBtn>
                <span className="hidden sm:contents">
                  <IconBtn label="Duplizieren" onClick={() => setBlocks((bs) => [...bs.slice(0, i + 1), { ...structuredClone(b), id: newBlockId() }, ...bs.slice(i + 1)])}><Copy size={15} /></IconBtn>
                  <IconBtn label="Entfernen" onClick={() => confirm(`„${def?.label ?? b.type}“ entfernen?`) && setBlocks((bs) => bs.filter((x) => x.id !== b.id))}><Trash2 size={15} /></IconBtn>
                </span>
              </div>
              {expanded && def && (
                <div className="grid gap-5 border-t border-border px-4 py-5 sm:px-6">
                  <Fields fields={def.fields} data={b.data} onChange={(data) => update(b.id, { data })} locales={locales} options={options} />
                  <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4 sm:hidden">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setBlocks((bs) => [...bs.slice(0, i + 1), { ...structuredClone(b), id: newBlockId() }, ...bs.slice(i + 1)])}><Copy size={14} /> Duplizieren</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => confirm("Entfernen?") && setBlocks((bs) => bs.filter((x) => x.id !== b.id))}><Trash2 size={14} /> Entfernen</Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {blocks.length === 0 && <p className="rounded-surface border border-dashed border-border-strong px-6 py-10 text-center text-sm text-muted-fg">Noch keine Bausteine — fügen Sie den ersten hinzu.</p>}

      {library ? (
        <div className="rounded-surface border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Baustein hinzufügen</p>
            <IconBtn label="Schliessen" onClick={() => setLibrary(false)}><X size={16} /></IconBtn>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {defs.map((d) => (
              <button key={d.type} type="button" onClick={() => add(d)} className="group flex items-start gap-3 rounded-control border border-border p-3 text-left transition-colors hover:border-primary hover:bg-primary-soft/40">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-muted text-fg/80 group-hover:bg-primary group-hover:text-on-primary"><Icon name={d.icon} /></span>
                <span className="grid gap-0.5"><span className="text-sm font-medium">{d.label}</span><span className="text-xs leading-snug text-muted-fg">{d.description}</span></span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setLibrary(true)} className="flex h-12 items-center justify-center gap-2 rounded-surface border border-dashed border-border-strong text-sm text-muted-fg transition-colors hover:border-primary hover:text-primary">
          <Plus size={16} /> Baustein hinzufügen
        </button>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className="grid h-8 w-8 shrink-0 place-items-center rounded-control text-muted-fg transition-colors hover:bg-muted hover:text-fg disabled:pointer-events-none disabled:opacity-30 sm:h-9 sm:w-9">
      {children}
    </button>
  );
}

/* ── Field editors ───────────────────────────────────────────────────── */

function Fields({ fields, data, onChange, locales, options }: { fields: Field[]; data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void; locales: string[]; options: EditorOptions }) {
  const set = (k: string, v: unknown) => onChange({ ...data, [k]: v });
  const wide = (f: Field) => ["locText", "markdown", "image", "list"].includes(f.type);
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {fields.filter((f) => !f.when || f.when.is.includes(String(data[f.when.key]))).map((f) => (
        <div key={f.key} className={cn("grid content-start gap-1.5", wide(f) && "md:col-span-2")}>
          {f.type !== "loc" && f.type !== "locText" && f.type !== "markdown" && <span className="text-field-label flex h-6 items-end truncate">{f.label}</span>}
          <FieldInput f={f} value={data[f.key]} onChange={(v) => set(f.key, v)} locales={locales} options={options} />
          {f.hint && <span className="text-xs text-muted-fg">{f.hint}</span>}
        </div>
      ))}
    </div>
  );
}

function FieldInput({ f, value, onChange, locales, options }: { f: Field; value: unknown; onChange: (v: unknown) => void; locales: string[]; options: EditorOptions }) {
  switch (f.type) {
    case "loc": case "locText": case "markdown":
      return <LocField label={f.label} value={(value as Localized) ?? {}} onChange={onChange} locales={locales} rows={f.type === "loc" ? 0 : f.type === "markdown" ? 6 : 3} />;
    case "text": case "url":
      return <Input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} size="sm" placeholder={f.type === "url" ? "/shop" : undefined} />;
    case "number":
      return <Input type="number" min={1} max={48} value={Number(value ?? 8)} onChange={(e) => onChange(Number(e.target.value))} size="sm" className="w-28" />;
    case "bool":
      return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-primary" />;
    case "select":
      return <Select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} size="sm">{f.options?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>;
    case "product": case "category": case "producer": {
      const list = f.type === "product" ? options.products : f.type === "category" ? options.categories : options.producers;
      return <Select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} size="sm"><option value="">—</option>{list.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>;
    }
    case "image":
      return <ImageField value={String(value ?? "")} onChange={onChange} />;
    case "list":
      return <ListField f={f} value={(value as Record<string, unknown>[]) ?? []} onChange={onChange} locales={locales} options={options} />;
  }
}

function LocField({ label, value, onChange, locales, rows }: { label: string; value: Localized; onChange: (v: Localized) => void; locales: string[]; rows: number }) {
  const active = LOCALES.filter((l) => locales.includes(l));
  const [cur, setCur] = useState(active[0]);
  return (
    <div className="grid gap-1.5">
      <div className="flex h-6 items-end justify-between gap-3">
        <span className="text-field-label truncate">{label}</span>
        {active.length > 1 && (
          <div className="flex rounded-control bg-muted p-0.5" role="tablist" aria-label="Sprache">
            {active.map((l) => (
              <button key={l} type="button" role="tab" aria-selected={cur === l} onClick={() => setCur(l)} className={cn("relative rounded-badge px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider", cur === l ? "bg-surface text-fg shadow-sm" : "text-muted-fg hover:text-fg")}>
                {l}
                {!value[l] && l !== active[0] && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-warning" />}
              </button>
            ))}
          </div>
        )}
      </div>
      {rows ? (
        <Textarea lang={cur} rows={rows} value={value[cur] ?? ""} onChange={(e) => onChange({ ...value, [cur]: e.target.value })} />
      ) : (
        <Input lang={cur} size="sm" value={value[cur] ?? ""} onChange={(e) => onChange({ ...value, [cur]: e.target.value })} />
      )}
    </div>
  );
}

function ImageField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upload = async (file: File) => {
    setBusy(true);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/admin/upload", { method: "POST", body: fd }).then((r) => r.json()).catch(() => ({ error: "Upload fehlgeschlagen" }));
    setBusy(false);
    if (res.url) onChange(res.url);
    else setError(res.error ?? "Upload fehlgeschlagen");
  };
  return (
    <div className="grid gap-3 sm:grid-cols-[180px_1fr] sm:items-start">
      <div className="relative aspect-video overflow-hidden rounded-control border border-border bg-muted">
        {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-muted-fg"><Image size={20} strokeWidth={1.4} /></span>}
      </div>
      <div className="grid gap-2">
        <label className="flex h-9 w-fit cursor-pointer items-center gap-2 rounded-btn border border-border-strong px-3 text-note hover:border-fg">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Bild hochladen
          <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        <Input size="sm" value={value} onChange={(e) => onChange(e.target.value)} placeholder="oder Bild-URL (https://…)" />
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  );
}

function ListField({ f, value, onChange, locales, options }: { f: Field; value: Record<string, unknown>[]; onChange: (v: Record<string, unknown>[]) => void; locales: string[]; options: EditorOptions }) {
  const blank = () => Object.fromEntries((f.fields ?? []).map((sf) => [sf.key, sf.type === "select" ? sf.options?.[0]?.[0] : ["loc", "locText", "markdown"].includes(sf.type) ? {} : ""]));
  return (
    <div className="grid gap-2">
      {value.map((item, i) => (
        <div key={i} className="grid gap-3 rounded-control border border-border bg-bg/50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-fg">{f.itemLabel} {i + 1}</span>
            <span className="flex">
              <IconBtn label="Nach oben" disabled={i === 0} onClick={() => { const n = [...value]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onChange(n); }}><ArrowUp size={14} /></IconBtn>
              <IconBtn label="Entfernen" onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 size={14} /></IconBtn>
            </span>
          </div>
          <Fields fields={f.fields ?? []} data={item} onChange={(d) => onChange(value.map((x, j) => (j === i ? d : x)))} locales={locales} options={options} />
        </div>
      ))}
      {(!f.max || value.length < f.max) && (
        <button type="button" onClick={() => onChange([...value, blank()])} className="flex h-9 w-fit items-center gap-2 rounded-btn px-2 text-note text-primary hover:underline">
          <Plus size={14} /> {f.itemLabel} hinzufügen
        </button>
      )}
    </div>
  );
}
