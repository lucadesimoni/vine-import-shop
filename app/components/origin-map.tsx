import { Link } from "react-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import world from "~/lib/maps/world.json";
import type { Locale } from "~/lib/localized";
import { countryName } from "~/lib/maps/names";
import { regionLabel, type RegionMapData } from "~/lib/maps/regions";
export { countryName };
import { cn } from "~/lib/cn";

/**
 * Origin maps, drawn entirely from design tokens (works with any brand palette and dark mode).
 *  - RegionMap: region map of one country (lib/maps/regions/<iso>.json, loaded by the route loader)
 *  - WorldDotMap: abstract dot-matrix world map for multi-country assortments
 * Shading encodes the number of products per area; every area is a real link (keyboard + SEO).
 */

/** 0 → muted, 1..max → 22%..88% primary mixed into the surface colour. */
function shade(count: number, max: number) {
  if (!count) return "var(--t-muted)";
  const pct = Math.round(22 + 66 * Math.sqrt(count / Math.max(1, max)));
  return `color-mix(in oklab, var(--t-primary) ${pct}%, var(--t-card))`;
}

type Area = { id: string; count: number };

/** count marker: a circle for short numbers, a pill that grows with the digits ("1253" stays inside) */
function CountMarker({ x, y, n, h, active, stroke }: { x: number; y: number; n: number; h: number; active: boolean; stroke: number }) {
  const w = Math.max(h, String(n).length * h * 0.36 + h * 0.5);
  return (
    <>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={h / 2} fill={active ? "var(--t-on-primary)" : "var(--t-card)"} stroke="var(--t-primary)" strokeWidth={active ? stroke * 1.7 : stroke} className="drop-shadow-sm" />
      <text x={x} y={y} dy="0.35em" textAnchor="middle" fontSize={h * 0.46} fontWeight={600} fill="var(--t-primary)" className="font-sans tabular-nums">{n}</text>
    </>
  );
}
const markerWidth = (n: number, h: number) => Math.max(h, String(n).length * h * 0.36 + h * 0.5);

/** nudge overlapping markers apart (a few relaxation passes; positions in map units) */
function spread<T extends { x: number; y: number; w: number; h: number }>(items: T[]): T[] {
  const out = items.map((m) => ({ ...m }));
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      const ox = (a.w + b.w) / 2 + a.h * 0.15 - Math.abs(a.x - b.x), oy = (a.h + b.h) / 2 + a.h * 0.15 - Math.abs(a.y - b.y);
      if (ox <= 0 || oy <= 0) continue;
      moved = true;
      // separate along the axis with the smaller overlap, half each
      if (ox < oy) { const d = (ox / 2) * (a.x <= b.x ? -1 : 1); a.x += d; b.x -= d; }
      else { const d = (oy / 2) * (a.y <= b.y ? -1 : 1); a.y += d; b.y -= d; }
    }
    if (!moved) break;
  }
  return out;
}

/** bounding box of an absolute SVG path (our maps use M/L/Z only) */
function pathBox(d: string) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const m of d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)) {
    const x = Number(m[1]), y = Number(m[2]);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

type ZoomLabels = { zoomIn: string; zoomOut: string; reset: string; europe?: string };

export const RegionMap = memo(function RegionMap({ map, data, selected, href, locale, label, className, markers = true, zoomable = false, labels, focus, aspect }: { map: RegionMapData; data: Area[]; selected?: string | null; href: (id: string) => string; locale: Locale; label: string; className?: string; markers?: boolean; zoomable?: boolean; labels?: ZoomLabels; /** zoom onto this region with some context and mark it with a pin (producer page) */ focus?: string | null; /** view aspect (w/h) for `focus` */ aspect?: number }) {
  const counts = new Map(data.map((d) => [d.id, d.count]));
  const max = Math.max(1, ...data.map((d) => d.count));
  const ordered = [...map.regions].sort((a, b) => Number(a.id === selected) - Number(b.id === selected));
  const space = useMemo<Space>(() => {
    const [x, y, w, h] = map.viewBox.split(" ").map(Number);
    const b = { x, y, w, h };
    return { bounds: b, aspect: w / h, max: 6, base: b };
  }, [map.viewBox]);
  const z = useZoom(zoomable, space.base, space);
  // focus: the region's box, enlarged for context (neighbours visible), at least 22 % of the country, inside the map
  const focusRegion = focus ? map.regions.find((r) => r.id === focus) : null;
  const focusView = useMemo(() => {
    if (!focusRegion) return null;
    const b = pathBox(focusRegion.d), B = space.bounds, a = aspect ?? 4 / 3;
    let w = Math.max(b.w * 2.6, b.h * 2.6 * a, B.w * 0.22), h = w / a;
    if (w > B.w && h > B.h) return null; // the whole country fits anyway
    w = Math.min(w, Math.max(B.w, B.h * a)); h = w / a;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    return { x: Math.min(Math.max(cx - w / 2, B.x), B.x + B.w - w), y: Math.min(Math.max(cy - h / 2, B.y), B.y + B.h - h), w, h };
  }, [focusRegion, space, aspect]);
  const view = focusView ?? z.view;
  // markers and labels keep their on-screen size while zooming
  const s = focusView ? focusView.w / space.bounds.w : 1 / Math.max(1, z.k) ** 0.85;
  const placed = spread(map.regions.filter((r) => markers && counts.get(r.id)).map((r) => {
    const n = counts.get(r.id)!, h = (40 + Math.min(16, Math.sqrt(n) * 4)) * s;
    return { r, n, x: r.cx, y: r.cy, h, w: markerWidth(n, h) };
  }));
  const svg = (
    <svg ref={z.svgRef} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className={cn("block select-none", className ?? "h-auto w-full", zoomable && (z.k > 1.01 ? "cursor-grab touch-none active:cursor-grabbing" : "touch-pan-y"))} role="group" aria-label={label} {...z.handlers}>
      {ordered.map((r) => {
        const n = counts.get(r.id) ?? 0;
        const active = r.id === selected;
        const name = regionLabel(r, locale);
        const shape = (
          <path
            d={r.d}
            style={{ fill: active ? "var(--t-primary)" : shade(n, max) }}
            stroke="var(--t-bg)"
            strokeWidth={active ? 2.5 : 1.4}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            className={cn("transition-[fill,opacity] duration-200", n > 0 && !active && "group-hover:opacity-80 group-focus-visible:opacity-80")}
          />
        );
        return n > 0 ? (
          <Link key={r.id} to={href(r.id)} preventScrollReset aria-label={`${name}: ${n}`} aria-current={active ? "true" : undefined} className="group cursor-pointer outline-none">
            <title>{`${name} · ${n}`}</title>
            {shape}
          </Link>
        ) : (
          <g key={r.id} aria-hidden>{shape}</g>
        );
      })}
      {/* count markers + labels on top of all shapes */}
      {placed.map(({ r, n, x, y, h }) => {
        const active = r.id === selected;
        const rad = h / 2;
        return (
          <Link key={r.id} to={href(r.id)} preventScrollReset tabIndex={-1} aria-hidden className="group cursor-pointer">
            <CountMarker x={x} y={y} n={n} h={h} active={active} stroke={2.5 * s} />
            <text
              x={x}
              y={y - rad - 12 * s}
              textAnchor="middle"
              fontSize={28 * s}
              fontWeight={500}
              fill="var(--t-fg)"
              stroke="var(--t-bg)"
              strokeWidth={7 * s}
              paintOrder="stroke"
              className={cn("font-sans transition-opacity duration-200", active ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
            >
              {regionLabel(r, locale)}
            </text>
          </Link>
        );
      })}
      {/* pin on the focused region (producer page) */}
      {focusRegion && focusView && (() => {
        const ps = focusView.w * 0.05, x = focusRegion.cx, y = focusRegion.cy;
        // keep the label inside the view: below the pin near the top edge, aligned inwards near the sides
        const above = y - ps * 2.6 > focusView.y + ps * 1.1;
        const ly = above ? y - ps * 2.6 : y + ps * 1.3;
        const rel = (x - focusView.x) / focusView.w;
        const anchor = rel < 0.25 ? "start" : rel > 0.75 ? "end" : "middle";
        const lx = anchor === "start" ? x - ps * 0.8 : anchor === "end" ? x + ps * 0.8 : x;
        return (
          <g aria-hidden>
            <path d={`M${x},${y} c${-ps * 0.55},${-ps * 0.75} ${-ps * 0.8},${-ps * 1.1} ${-ps * 0.8},${-ps * 1.45} a${ps * 0.8},${ps * 0.8} 0 1 1 ${ps * 1.6},0 c0,${ps * 0.35} ${-ps * 0.25},${ps * 0.7} ${-ps * 0.8},${ps * 1.45}z`} fill="var(--t-fg)" stroke="var(--t-bg)" strokeWidth={ps * 0.12} />
            <circle cx={x} cy={y - ps * 1.45} r={ps * 0.32} fill="var(--t-bg)" />
            <text x={lx} y={ly} textAnchor={anchor} fontSize={ps * 0.95} fontWeight={600} fill="var(--t-fg)" stroke="var(--t-bg)" strokeWidth={ps * 0.28} paintOrder="stroke" className="font-sans">{regionLabel(focusRegion, locale)}</text>
          </g>
        );
      })()}
    </svg>
  );
  return zoomable ? <ZoomFrame z={z} max={space.max} labels={labels}>{svg}</ZoomFrame> : svg;
});

/** map + zoom controls (bottom right) */
function ZoomFrame({ z, max, labels, europe, children }: { z: ReturnType<typeof useZoom>; max: number; labels?: ZoomLabels; europe?: boolean; children: React.ReactNode }) {
  const btn = "flex size-9 items-center justify-center text-muted-fg transition-colors hover:bg-muted hover:text-fg disabled:pointer-events-none disabled:opacity-35";
  return (
    <div className="relative w-full">
      {children}
      {/* phones: below the map (never covers it); larger screens: in the corner */}
      <div className="ml-auto mt-2 flex w-fit overflow-hidden rounded-control border border-border bg-card/90 shadow-card backdrop-blur-sm sm:absolute sm:bottom-2 sm:right-2 sm:mt-0">
        {europe && <><button type="button" onClick={z.europe} className={cn(btn, "w-auto px-3 text-note font-medium")}>{labels?.europe ?? "Europa"}</button><span className="w-px bg-border" /></>}
        <button type="button" onClick={z.zoomOut} disabled={z.k <= 1.01} className={btn} aria-label={labels?.zoomOut}><Minus size={15} /></button>
        <button type="button" onClick={z.zoomIn} disabled={z.k >= max - 0.01} className={btn} aria-label={labels?.zoomIn}><Plus size={15} /></button>
        <button type="button" onClick={z.reset} disabled={z.k <= 1.01} className={btn} aria-label={labels?.reset}><Maximize2 size={14} /></button>
      </div>
    </div>
  );
}

const COLS = 3; // dots array stride: x, y, countryIndex
type View = { x: number; y: number; w: number; h: number };
const [BX, BY, BW, BH] = world.viewBox.split(" ").map(Number);
/** the zoomable map is taller than the world strip (more room for Europe); the extra height is ocean */
const ASPECT = 1.75;
const BASE: View = { x: BX, y: BY + (BH - BW / ASPECT) / 2, w: BW, h: BW / ASPECT };
const EUROPE: View = { x: 150, y: 2, w: 92, h: 92 / ASPECT };
const MAX_ZOOM = 10;
/** zoom level from which real country outlines replace the dot matrix */
const SHAPES_FROM = 2.2;

/** a zoomable map: its full extent, the view's aspect ratio, the largest zoom factor */
type Space = { bounds: View; aspect: number; max: number; base: View };
const WORLD: Space = { bounds: { x: BX, y: BY, w: BW, h: BH }, aspect: ASPECT, max: MAX_ZOOM, base: BASE };
function clampIn(sp: Space, v: View): View {
  const { x: X, y: Y, w: W, h: H } = sp.bounds;
  const w = Math.min(Math.max(W, H * sp.aspect), Math.max(W / sp.max, v.w));
  const h = w / sp.aspect;
  const x = w >= W ? X + (W - w) / 2 : Math.min(X + W - w, Math.max(X, v.x));
  const y = h >= H ? Y + (H - h) / 2 : Math.min(Y + H - h, Math.max(Y, v.y));
  return { w, h, x, y };
}
const clampView = (v: View) => clampIn(WORLD, v);
/** zoom by factor f around the map point (px, py) */
const zoomIn = (sp: Space, v: View, f: number, px = v.x + v.w / 2, py = v.y + v.h / 2) => clampIn(sp, { w: v.w / f, h: v.h / f, x: px - (px - v.x) / f, y: py - (py - v.y) / f });

/** Pan & zoom for the world map: buttons, ctrl/⌘ + wheel or trackpad pinch, touch pinch, drag, double click. */
/** initial view: the countries that have products, with some margin (whole world when they are spread out) */
function fitView(isos: string[]): View {
  const cs = world.countries.filter((c) => isos.includes(c.iso));
  if (!cs.length) return BASE;
  const xs = cs.map((c) => c.cx), ys = cs.map((c) => c.cy);
  const w = Math.max(70, (Math.max(...xs) - Math.min(...xs)) * 1.8, (Math.max(...ys) - Math.min(...ys)) * 1.8 * ASPECT);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  return clampView({ x: cx - w / 2, y: cy - w / ASPECT / 2, w, h: w / ASPECT });
}

/**
 * Pan & zoom for the maps: mouse wheel, trackpad pinch, touch pinch, drag, double click and buttons.
 * The wheel scrolls the page again once the map is fully zoomed out (or in), so it never traps the page.
 */
function useZoom(enabled: boolean, initial: View, sp: Space = WORLD) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomAt = (v: View, f: number, px?: number, py?: number) => zoomIn(sp, v, f, px, py);
  const [view, setView] = useState<View>(enabled ? initial : sp.bounds);
  const viewRef = useRef(view);
  viewRef.current = view;
  const anim = useRef(0);
  const moved = useRef(false);

  const animateTo = useCallback((to: View) => {
    cancelAnimationFrame(anim.current);
    const from = viewRef.current;
    const t0 = performance.now();
    const step = (t: number) => {
      // rAF timestamps can be slightly earlier than t0: clamp, or the ease-out curve overshoots backwards
      const k = Math.max(0, Math.min(1, (t - t0) / 280));
      const e = 1 - (1 - k) ** 3;
      setView({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e });
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, []);

  // client px → map coordinates
  const toMap = (cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return [v.x + ((cx - r.left) / r.width) * v.w, v.y + ((cy - r.top) / r.height) * v.h] as const;
  };

  useEffect(() => {
    const el = svgRef.current;
    if (!enabled || !el) return;
    const onWheel = (e: WheelEvent) => {
      const k = sp.bounds.w / viewRef.current.w;
      const out = e.deltaY > 0;
      // at the limit in the wheel's direction the page scrolls on (trackpad pinch = ctrl+wheel always zooms)
      if (!e.ctrlKey && ((out && k <= 1.001) || (!out && k >= sp.max - 0.001))) return;
      e.preventDefault();
      cancelAnimationFrame(anim.current);
      const [px, py] = toMap(e.clientX, e.clientY);
      setView((v) => zoomAt(v, Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * (e.ctrlKey ? 0.01 : 0.004)), px, py));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [enabled]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ x: number; y: number; dist: number; view: View } | null>(null);
  const handlers = enabled
    ? {
        onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => {
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const ps = [...pointers.current.values()];
          const cx = ps.reduce((a, p) => a + p.x, 0) / ps.length, cy = ps.reduce((a, p) => a + p.y, 0) / ps.length;
          start.current = { x: cx, y: cy, dist: ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0, view: viewRef.current };
          moved.current = false;
        },
        onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => {
          if (!pointers.current.has(e.pointerId) || !start.current) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const ps = [...pointers.current.values()];
          const cx = ps.reduce((a, p) => a + p.x, 0) / ps.length, cy = ps.reduce((a, p) => a + p.y, 0) / ps.length;
          const s0 = start.current;
          if (!moved.current && Math.hypot(cx - s0.x, cy - s0.y) < 5 && ps.length < 2) return;
          if (!moved.current) { moved.current = true; (e.currentTarget as Element).setPointerCapture(e.pointerId); cancelAnimationFrame(anim.current); }
          const r = svgRef.current!.getBoundingClientRect();
          let v = s0.view;
          if (ps.length > 1 && s0.dist) {
            const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
            v = zoomAt(v, d / s0.dist, v.x + ((s0.x - r.left) / r.width) * v.w, v.y + ((s0.y - r.top) / r.height) * v.h);
          }
          setView(clampIn(sp, { ...v, x: v.x - ((cx - s0.x) / r.width) * v.w, y: v.y - ((cy - s0.y) / r.height) * v.h }));
        },
        onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => {
          pointers.current.delete(e.pointerId);
          const ps = [...pointers.current.values()];
          start.current = ps.length ? { x: ps[0].x, y: ps[0].y, dist: 0, view: viewRef.current } : null;
        },
        onPointerCancel: (e: React.PointerEvent<SVGSVGElement>) => { pointers.current.delete(e.pointerId); start.current = null; },
        // a drag must not follow the country link under the pointer
        onClickCapture: (e: React.MouseEvent) => { if (moved.current) { e.preventDefault(); e.stopPropagation(); moved.current = false; } },
        onDoubleClick: (e: React.MouseEvent) => { const [px, py] = toMap(e.clientX, e.clientY); animateTo(zoomAt(viewRef.current, 2, px, py)); },
      }
    : {};
  const k = sp.bounds.w / view.w;
  return {
    svgRef, view, k, handlers,
    zoomIn: () => animateTo(zoomAt(viewRef.current, 1.8)),
    zoomOut: () => animateTo(zoomAt(viewRef.current, 1 / 1.8)),
    reset: () => animateTo(sp.base),
    europe: () => animateTo(EUROPE),
  };
}

export const WorldDotMap = memo(function WorldDotMap({ data, selected, href, locale, label, compact = false, zoomable = false, labels }: { data: Area[]; selected?: string | null; href: (iso: string) => string; locale: Locale; label: string; compact?: boolean; zoomable?: boolean; labels?: { zoomIn: string; zoomOut: string; reset: string; europe: string } }) {
  const counts = new Map(data.map((d) => [d.id, d.count]));
  const max = Math.max(1, ...data.map((d) => d.count));
  const groups = useMemo(() => {
    const g = world.countries.map(() => [] as [number, number][]);
    for (let i = 0; i < world.dots.length; i += COLS) g[world.dots[i + 2]].push([world.dots[i], world.dots[i + 1]]);
    return g;
  }, []);
  const z = useZoom(zoomable, useMemo(() => fitView(data.map((d) => d.id)), []));
  // compact (producer page): zoomed onto the selected country instead of the whole world
  const compactView = useMemo(() => (compact && selected ? fitView([selected]) : null), [compact, selected]);
  const k = compactView ? BW / compactView.w : z.k;
  const view = compactView ?? z.view;
  // country outlines are loaded on first zoom (kept out of the initial bundle)
  const [shapes, setShapes] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (zoomable && k >= SHAPES_FROM * 0.8 && !shapes) import("~/lib/maps/world-shapes.json").then((m) => setShapes(m.default as Record<string, string>));
  }, [zoomable, k, shapes]);
  const outlined = !!shapes && k >= SHAPES_FROM;
  const fill = (iso: string, n: number) => (iso === selected ? "var(--t-primary)" : shade(n, max));

  const svg = (
    <svg
      ref={z.svgRef}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      className={cn("block h-auto w-full select-none", zoomable && (k > 1.01 ? "cursor-grab touch-none active:cursor-grabbing" : "touch-pan-y"))}
      role="group"
      aria-label={label}
      {...z.handlers}
    >
      <g className="transition-opacity duration-300" style={{ opacity: outlined ? 0 : 1 }} aria-hidden={outlined || undefined}>
        {world.countries.map((c, idx) => {
          const n = counts.get(c.iso) ?? 0;
          const dots = groups[idx].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={n ? 0.9 : 0.68} />);
          if (!n || outlined) return <g key={c.iso} style={{ fill: n ? fill(c.iso, n) : "var(--t-muted-fg)" }} opacity={n ? 1 : 0.28} aria-hidden>{dots}</g>;
          const name = countryName(c.iso, locale);
          return (
            <Link key={c.iso} to={href(c.iso)} preventScrollReset aria-label={`${name}: ${n}`} aria-current={c.iso === selected ? "true" : undefined} className="group cursor-pointer outline-none">
              <title>{`${name} · ${n}`}</title>
              <g style={{ fill: fill(c.iso, n) }} className="transition-opacity group-hover:opacity-75">{dots}</g>
            </Link>
          );
        })}
      </g>
      {outlined && (
        <g>
          {world.countries.map((c) => {
            const d = shapes![c.iso];
            if (!d) return null;
            const n = counts.get(c.iso) ?? 0;
            const path = <path d={d} style={{ fill: n ? fill(c.iso, n) : "var(--t-muted)" }} stroke="var(--t-bg)" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeLinejoin="round" className={cn("transition-opacity", n > 0 && "group-hover:opacity-80")} />;
            if (!n) return <g key={c.iso} aria-hidden>{path}</g>;
            const name = countryName(c.iso, locale);
            return (
              <Link key={c.iso} to={href(c.iso)} preventScrollReset aria-label={`${name}: ${n}`} aria-current={c.iso === selected ? "true" : undefined} className="group cursor-pointer outline-none">
                <title>{`${name} · ${n}`}</title>
                {path}
              </Link>
            );
          })}
        </g>
      )}
      {!compact &&
        spread(world.countries.filter((c) => counts.get(c.iso)).map((c) => {
          // markers keep their on-screen size while zooming
          const s = 1 / Math.max(1, k) ** 0.85, n = counts.get(c.iso)!, h = 13 * s;
          return { c, n, s, x: c.cx, y: c.cy, h, w: markerWidth(n, h) };
        })).map(({ c, n, s, x, y, h }) => {
          const active = c.iso === selected;
          return (
            <Link key={c.iso} to={href(c.iso)} preventScrollReset tabIndex={-1} aria-hidden className="group">
              <CountMarker x={x} y={y} n={n} h={h} active={active} stroke={0.7 * s} />
              <text x={x} y={y - h / 2 - 3.5 * s} textAnchor="middle" fontSize={7 * s} fontWeight={500} fill="var(--t-fg)" stroke="var(--t-bg)" strokeWidth={2 * s} paintOrder="stroke" className={cn("font-sans transition-opacity", active ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                {countryName(c.iso, locale)}
              </text>
            </Link>
          );
        })}
    </svg>
  );
  return zoomable ? <ZoomFrame z={z} max={MAX_ZOOM} labels={labels} europe>{svg}</ZoomFrame> : svg;
});
