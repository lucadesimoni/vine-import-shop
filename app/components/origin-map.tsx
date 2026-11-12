import { Link } from "react-router";
import { memo } from "react";
import italy from "~/lib/maps/italy.json";
import world from "~/lib/maps/world.json";
import type { Locale } from "~/lib/localized";
import { countryName, regionName } from "~/lib/maps/names";
export { countryName, regionName };
import { cn } from "~/lib/cn";

/**
 * Origin maps, drawn entirely from design tokens (works with any brand palette and dark mode).
 *  - RegionMap: country region map (Italy bundled; add more JSON maps in lib/maps)
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

export const RegionMap = memo(function RegionMap({ data, selected, href, locale, label, className }: { data: Area[]; selected?: string | null; href: (id: string) => string; locale: Locale; label: string; className?: string }) {
  const counts = new Map(data.map((d) => [d.id, d.count]));
  const max = Math.max(1, ...data.map((d) => d.count));
  const ordered = [...italy.regions].sort((a, b) => Number(a.id === selected) - Number(b.id === selected));
  return (
    <svg viewBox={italy.viewBox} className={cn("block select-none", className ?? "h-auto w-full")} role="group" aria-label={label}>
      {ordered.map((r) => {
        const n = counts.get(r.id) ?? 0;
        const active = r.id === selected;
        const name = regionName(r.id, locale);
        const shape = (
          <path
            d={r.d}
            style={{ fill: active ? "var(--t-primary)" : shade(n, max) }}
            stroke="var(--t-bg)"
            strokeWidth={active ? 2.5 : 1.4}
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
      {italy.regions.filter((r) => counts.get(r.id)).map((r) => {
        const n = counts.get(r.id)!;
        const active = r.id === selected;
        const rad = 22 + Math.min(14, Math.sqrt(n) * 4);
        return (
          <Link key={r.id} to={href(r.id)} preventScrollReset tabIndex={-1} aria-hidden className="group cursor-pointer">
            <circle cx={r.cx} cy={r.cy} r={rad} fill={active ? "var(--t-on-primary)" : "var(--t-card)"} stroke="var(--t-primary)" strokeWidth={active ? 0 : 2.5} className="drop-shadow-sm" />
            <text x={r.cx} y={r.cy} dy="0.35em" textAnchor="middle" fontSize={rad * 0.9} fontWeight={600} fill="var(--t-primary)" className="font-sans tabular-nums">{n}</text>
            <text
              x={r.cx}
              y={r.cy - rad - 12}
              textAnchor="middle"
              fontSize={28}
              fontWeight={500}
              fill="var(--t-fg)"
              stroke="var(--t-bg)"
              strokeWidth={7}
              paintOrder="stroke"
              className={cn("font-sans transition-opacity duration-200", active ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
            >
              {regionName(r.id, locale)}
            </text>
          </Link>
        );
      })}
    </svg>
  );
});

const COLS = 3; // dots array stride: x, y, countryIndex
export const WorldDotMap = memo(function WorldDotMap({ data, selected, href, locale, label, compact = false }: { data: Area[]; selected?: string | null; href: (iso: string) => string; locale: Locale; label: string; compact?: boolean }) {
  const counts = new Map(data.map((d) => [d.id, d.count]));
  const max = Math.max(1, ...data.map((d) => d.count));
  const groups = world.countries.map(() => [] as [number, number][]);
  for (let i = 0; i < world.dots.length; i += COLS) groups[world.dots[i + 2]].push([world.dots[i], world.dots[i + 1]]);

  return (
    <svg viewBox={world.viewBox} className="block h-auto w-full select-none" role="group" aria-label={label}>
      {world.countries.map((c, idx) => {
        const n = counts.get(c.iso) ?? 0;
        const active = c.iso === selected;
        const dots = groups[idx].map(([x, y], k) => <circle key={k} cx={x} cy={y} r={n ? 0.9 : 0.68} />);
        if (!n) return <g key={c.iso} style={{ fill: "var(--t-muted-fg)" }} opacity={0.28} aria-hidden>{dots}</g>;
        const name = countryName(c.iso, locale);
        return (
          <Link key={c.iso} to={href(c.iso)} preventScrollReset aria-label={`${name}: ${n}`} aria-current={active ? "true" : undefined} className="group cursor-pointer outline-none">
            <title>{`${name} · ${n}`}</title>
            <g style={{ fill: active ? "var(--t-primary)" : shade(n, max) }} className="transition-opacity group-hover:opacity-75">{dots}</g>
          </Link>
        );
      })}
      {!compact &&
        world.countries.filter((c) => counts.get(c.iso)).map((c) => {
          const n = counts.get(c.iso)!;
          const active = c.iso === selected;
          return (
            <Link key={c.iso} to={href(c.iso)} preventScrollReset tabIndex={-1} aria-hidden className="group">
              <circle cx={c.cx} cy={c.cy} r={6.5} fill="var(--t-card)" stroke="var(--t-primary)" strokeWidth={active ? 1.2 : 0.7} className="drop-shadow-sm" />
              <text x={c.cx} y={c.cy} dy="0.35em" textAnchor="middle" fontSize={6} fontWeight={600} fill="var(--t-primary)" className="font-sans tabular-nums">{n}</text>
              <text x={c.cx} y={c.cy - 10} textAnchor="middle" fontSize={7} fontWeight={500} fill="var(--t-fg)" stroke="var(--t-bg)" strokeWidth={2} paintOrder="stroke" className={cn("font-sans transition-opacity", active ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                {countryName(c.iso, locale)}
              </text>
            </Link>
          );
        })}
    </svg>
  );
});
