import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useFetcher } from "react-router";
import { Crop, FlipHorizontal2, Loader2, RotateCcw, RotateCw, Undo2, Wand2, X } from "lucide-react";
import { NO_EDIT, RATIOS, parseEdit, type ImageEdit, type Ratio } from "~/lib/image-edit";
import { cn } from "~/lib/cn";
import { Button } from "~/components/ui";

/**
 * Product image editor (admin). Non-destructive: it only sends edit parameters; the server renders the shop image
 * from the original (app/.server/image-edit.ts). Left: the oriented original with a crop frame. Right: live result.
 */
type Props = { productId: number; edit: ImageEdit | null; standard: ImageEdit | null; onClose: () => void };
type Box = { x: number; y: number; w: number; h: number };
const FULL: Box = { x: 0, y: 0, w: 1, h: 1 };

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function ImageEditor({ productId, edit, standard, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [e, setE] = useState<ImageEdit>(() => parseEdit(edit ?? NO_EDIT));
  const [cropping, setCropping] = useState(false);
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const set = (patch: Partial<ImageEdit>) => setE((x) => ({ ...x, ...patch }));

  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { if (fetcher.state === "idle" && fetcher.data?.ok) onClose(); }, [fetcher.state, fetcher.data, onClose]);

  // orientation changes invalidate the crop frame (it is relative to the oriented image)
  const turn = (d: 90 | -90) => set({ rotate: (((e.rotate + d) % 360) + 360) % 360 as ImageEdit["rotate"], crop: null });
  const base = useDebounced(JSON.stringify({ rotate: e.rotate, flip: e.flip, straighten: e.straighten }), 250);
  const result = useDebounced(JSON.stringify({ ...e, auto: undefined }), 350);
  const src = (stage: string, edit: string) => `/admin/products/${productId}/image-preview?stage=${stage}&edit=${encodeURIComponent(edit)}`;

  return (
    <dialog ref={dialog} onClose={onClose} className="m-auto w-[min(1100px,calc(100vw-1.5rem))] max-h-[calc(100vh-1.5rem)] overflow-hidden rounded-surface border border-border bg-bg p-0 text-fg shadow-2xl backdrop:bg-black/50">
      <div className="flex max-h-[calc(100vh-1.5rem)] flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
          <h2 className="font-display text-xl">Bild bearbeiten</h2>
          <button type="button" onClick={() => dialog.current?.close()} className="rounded-control p-2 text-muted-fg hover:bg-muted hover:text-fg" aria-label="Schliessen"><X size={18} /></button>
        </header>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_280px]">
          <figure className="grid content-start gap-2">
            <figcaption className="text-eyebrow text-2xs text-muted-fg">Original {cropping ? "· Ausschnitt ziehen" : ""}</figcaption>
            <CropFrame src={src("base", base)} box={e.crop ?? FULL} active={cropping} ratio={RATIOS[e.ratio]} onChange={(b) => set({ crop: b.w > 0.995 && b.h > 0.995 ? null : b })} />
          </figure>
          <figure className="grid content-start gap-2">
            <figcaption className="text-eyebrow text-2xs text-muted-fg">Ergebnis im Shop</figcaption>
            <Preview src={src("result", result)} />
          </figure>

          <div className="grid content-start gap-5 text-sm">
            <Group label="Ausrichtung">
              <div className="flex flex-wrap gap-2">
                <Tool onClick={() => turn(-90)} label="90° links"><RotateCcw size={16} /></Tool>
                <Tool onClick={() => turn(90)} label="90° rechts"><RotateCw size={16} /></Tool>
                <Tool onClick={() => set({ flip: !e.flip, crop: null })} label="Spiegeln" active={e.flip}><FlipHorizontal2 size={16} /></Tool>
                <Tool onClick={() => setCropping((c) => !c)} label="Zuschneiden" active={cropping || !!e.crop}><Crop size={16} /></Tool>
              </div>
              <Range label="Gerade richten" value={e.straighten} min={-15} max={15} step={0.5} unit="°" onChange={(v) => set({ straighten: v, crop: null })} />
              {e.crop && <button type="button" className="w-fit text-note text-muted-fg underline underline-offset-4 hover:text-fg" onClick={() => set({ crop: null })}>Ausschnitt entfernen</button>}
            </Group>

            <Group label="Freistellen">
              <Switch label="Hellen Hintergrund entfernen" checked={e.cutout} onChange={(v) => set({ cutout: v })} />
              {e.cutout && <Range label="Toleranz" value={e.tolerance} min={1} max={60} step={1} onChange={(v) => set({ tolerance: v })} />}
              <Switch label="Leere Ränder entfernen" checked={e.trim} onChange={(v) => set({ trim: v })} />
            </Group>

            <Group label="Fläche">
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(RATIOS) as Ratio[]).map((r) => (
                  <button key={r} type="button" onClick={() => set({ ratio: r })} aria-pressed={e.ratio === r}
                    className={cn("rounded-control border px-2.5 py-1 text-note", e.ratio === r ? "border-fg bg-fg text-bg" : "border-border hover:border-border-strong")}>
                    {r === "original" ? "Original" : r}
                  </button>
                ))}
              </div>
              <Range label="Rand" value={e.padding} min={0} max={25} step={1} unit="%" onChange={(v) => set({ padding: v })} />
              <div className="flex flex-wrap items-center gap-2">
                {[["transparent", "Transparent"], ["white", "Weiss"]].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => set({ background: v })} aria-pressed={e.background === v}
                    className={cn("rounded-control border px-2.5 py-1 text-note", e.background === v ? "border-fg bg-fg text-bg" : "border-border hover:border-border-strong")}>{l}</button>
                ))}
                <label className="flex items-center gap-1.5 text-note">
                  <input type="color" value={e.background.startsWith("#") ? e.background : "#f4efe9"} onChange={(x) => set({ background: x.target.value })} className="h-7 w-9 cursor-pointer rounded-control border border-border bg-transparent" aria-label="Hintergrundfarbe" />
                  Farbe
                </label>
              </div>
              <Switch label="Weicher Schatten" checked={e.shadow} onChange={(v) => set({ shadow: v })} />
            </Group>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {standard && <Button type="button" size="sm" variant="secondary" onClick={() => setE({ ...parseEdit(standard), rotate: e.rotate, flip: e.flip, straighten: e.straighten, crop: e.crop })}><Wand2 size={14} /> Bildstandard</Button>}
              <Button type="button" size="sm" variant="ghost" onClick={() => { setE(NO_EDIT); setCropping(false); }}><Undo2 size={14} /> Zurücksetzen</Button>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p className="text-note text-muted-fg">{fetcher.data?.error ?? "Das Original bleibt erhalten — jede Änderung lässt sich zurücksetzen."}</p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>Abbrechen</Button>
            <Button type="button" disabled={fetcher.state !== "idle"} onClick={() => fetcher.submit({ intent: "image-edit", edit: JSON.stringify(e) }, { method: "post" })}>
              {fetcher.state !== "idle" && <Loader2 size={14} className="animate-spin" />} Übernehmen
            </Button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return <fieldset className="grid gap-3"><legend className="mb-1 text-eyebrow text-2xs text-muted-fg">{label}</legend>{children}</fieldset>;
}
function Tool({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} aria-pressed={active}
      className={cn("grid h-9 w-9 place-items-center rounded-control border transition-colors", active ? "border-fg bg-fg text-bg" : "border-border hover:border-border-strong")}>
      {children}
    </button>
  );
}
function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(x) => onChange(x.target.checked)} className="h-4 w-4 accent-primary" />
    </label>
  );
}
function Range({ label, value, min, max, step, unit = "", onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="grid gap-1">
      <span className="flex justify-between text-note"><span>{label}</span><span className="tabular-nums text-muted-fg">{value}{unit}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(x) => onChange(Number(x.target.value))} className="accent-primary" />
    </label>
  );
}

/** preview image on a checkerboard (shows transparency), with a loading veil while the next render arrives */
function Preview({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(src);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setBusy(true); const i = new Image(); i.onload = () => { setLoaded(src); setBusy(false); }; i.onerror = () => setBusy(false); i.src = src; }, [src]);
  return (
    <div className="relative grid aspect-square place-items-center overflow-hidden rounded-surface border border-border [background:repeating-conic-gradient(var(--color-muted)_0_25%,transparent_0_50%)_0_0/18px_18px]">
      <img src={loaded} alt="" className="max-h-full max-w-full object-contain" />
      {busy && <Loader2 size={20} className="absolute right-3 top-3 animate-spin text-muted-fg" />}
    </div>
  );
}

/** the oriented original with a movable/resizable crop frame (relative coordinates) */
function CropFrame({ src, box, active, ratio, onChange }: { src: string; box: Box; active: boolean; ratio: number | null; onChange: (b: Box) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(1);
  const drag = useRef<{ mode: string; x: number; y: number; b: Box } | null>(null);

  const start = (mode: string) => (ev: ReactPointerEvent) => {
    if (!active) return;
    ev.preventDefault(); ev.stopPropagation();
    (ev.target as Element).setPointerCapture(ev.pointerId);
    drag.current = { mode, x: ev.clientX, y: ev.clientY, b: box };
  };
  const move = (ev: ReactPointerEvent) => {
    const d = drag.current, el = wrap.current?.querySelector("img");
    if (!d || !el) return;
    const r = el.getBoundingClientRect();
    const dx = (ev.clientX - d.x) / r.width, dy = (ev.clientY - d.y) / r.height;
    let { x, y, w, h } = d.b;
    if (d.mode === "move") { x = Math.min(1 - w, Math.max(0, x + dx)); y = Math.min(1 - h, Math.max(0, y + dy)); }
    else {
      if (d.mode.includes("w")) { const nx = Math.min(x + w - 0.05, Math.max(0, x + dx)); w += x - nx; x = nx; }
      if (d.mode.includes("e")) w = Math.min(1 - x, Math.max(0.05, w + dx));
      if (d.mode.includes("n")) { const ny = Math.min(y + h - 0.05, Math.max(0, y + dy)); h += y - ny; y = ny; }
      if (d.mode.includes("s")) h = Math.min(1 - y, Math.max(0.05, h + dy));
      // keep the canvas ratio when one is chosen (in pixels, i.e. corrected by the image's own aspect)
      if (ratio) { const hh = (w * aspect) / ratio; if (y + hh <= 1) h = hh; else { h = 1 - y; w = (h * ratio) / aspect; } }
    }
    onChange({ x, y, w, h });
  };
  const end = () => { drag.current = null; };
  // keyboard: arrows move the frame (1 %, with Shift 5 %), Alt + arrows resize it (keeps the ratio when one is set)
  const onKey = (ev: React.KeyboardEvent) => {
    const step = ev.shiftKey ? 0.05 : 0.01;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
    if (!d) return;
    ev.preventDefault();
    let { x, y, w, h } = box;
    if (ev.altKey) {
      w = Math.min(1 - x, Math.max(0.05, w + d[0])); h = Math.min(1 - y, Math.max(0.05, h + d[1]));
      if (ratio) { const hh = (w * aspect) / ratio; if (y + hh <= 1) h = hh; else { h = 1 - y; w = (h * ratio) / aspect; } }
    } else { x = Math.min(1 - w, Math.max(0, x + d[0])); y = Math.min(1 - h, Math.max(0, y + d[1])); }
    onChange({ x, y, w, h });
  };
  const handle = "absolute h-3.5 w-3.5 rounded-full border-2 border-white bg-primary shadow";

  return (
    <div ref={wrap} className="relative grid aspect-square place-items-center overflow-hidden rounded-surface border border-border bg-muted/50" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <div className="relative inline-block max-h-full max-w-full">
        <img src={src} alt="" className="block max-h-[min(60vh,520px)] max-w-full select-none object-contain" draggable={false}
          onLoad={(x) => setAspect(x.currentTarget.naturalWidth / x.currentTarget.naturalHeight || 1)} />
        {(active || box !== FULL) && (
          <div className={cn("absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] outline-none focus-visible:ring-2 focus-visible:ring-primary", active ? "cursor-move" : "pointer-events-none")}
            tabIndex={active ? 0 : -1} aria-label="Ausschnitt: Pfeiltasten verschieben, Alt + Pfeiltasten ändern die Grösse"
            aria-valuetext={`x ${Math.round(box.x * 100)} %, y ${Math.round(box.y * 100)} %, ${Math.round(box.w * 100)} × ${Math.round(box.h * 100)} %`}
            onKeyDown={active ? onKey : undefined}
            style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
            onPointerDown={start("move")}>
            {active && ["nw", "ne", "sw", "se"].map((c) => (
              <span key={c} onPointerDown={start(c)} className={cn(handle, c.includes("n") ? "-top-2" : "-bottom-2", c.includes("w") ? "-left-2" : "-right-2", c === "nw" || c === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize")} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
