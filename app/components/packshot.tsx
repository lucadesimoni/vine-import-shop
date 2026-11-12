import { Amphora, Droplet, Grape, Ham, Martini, Milk, Wheat, Wine, type LucideIcon } from "lucide-react";
import { cn } from "~/lib/cn";

/**
 * Editorial placeholder ("label card") for products without a photo.
 * Typographic, not a fake product drawing: soft brand-tinted stage, hairline frame, a fine line icon for the
 * product type, producer in small caps and the product name in the display face. Tokens only — fits every
 * brand and dark mode. Uses a container query: thumbnails show just the icon, cards show the full label.
 */

export type PackshotShape = "wine" | "sparkling" | "spirit" | "oil" | "pasta" | "cheese" | "dairy" | "jar" | "salumi";

export function shapeFor(p: { kind: string; color?: string | null; category?: string | null; name?: string; size?: string | null }): PackshotShape {
  const t = `${p.name ?? ""} ${p.category ?? ""}`.toLowerCase();
  if (p.kind === "wine") return p.color === "sparkling" ? "sparkling" : "wine";
  if (p.kind === "spirit") return "spirit";
  if (p.kind === "beverage") return "wine";
  if (/oli|oil|öl|condiment|aceto|balsam/.test(t)) return "oil";
  if (/pasta|spaghett|penne|pacch|rigat|ditalin|farina|mehl|risott|riso/.test(t)) return "pasta";
  if (/yogurt|ricotta|stracciat|burrata|latte|mozzarella|bufala/.test(t)) return "dairy";
  if (/käse|kaese|cheese|formagg|pecorino|parmig|grana/.test(t)) return "cheese";
  if (/wurst|salum|salam|salsicc|coppa|lardo|prosciut|speck|bresaola|mortadel/.test(t)) return "salumi";
  return "jar";
}

const ICON: Record<PackshotShape, LucideIcon> = {
  wine: Wine, sparkling: Wine, spirit: Martini, oil: Droplet, pasta: Wheat, cheese: Milk, dairy: Milk, jar: Amphora, salumi: Ham,
};

export function Packshot({ name, producer, shape, className }: { name: string; producer?: string | null; shape: PackshotShape; color?: string | null; className?: string }) {
  const Icon = shape === "wine" && /\bbianc|weiss|white/i.test(name) ? Grape : ICON[shape];
  return (
    <span
      role="img"
      aria-label={name}
      className={cn("@container absolute inset-0 grid place-items-center overflow-hidden", className)}
    >
      {/* hairline frame */}
      <span aria-hidden className="pointer-events-none absolute inset-0 hidden rounded-badge border @[9rem]:block" style={{ borderColor: "color-mix(in oklab, var(--t-primary) 22%, var(--t-media))" }} />
      <span className="relative grid w-[76%] justify-items-center gap-[0.55em] text-center text-[clamp(9px,6cqi,24px)]">
        <Icon aria-hidden strokeWidth={1.1} className="h-[2.4em] w-[2.4em] text-primary/70 @[9rem]:h-[2.1em] @[9rem]:w-[2.1em]" />
        <span aria-hidden className="hidden h-px w-[2.4em] bg-primary/40 @[9rem]:block" />
        {producer && <span className="hidden max-w-full truncate text-[0.68em] font-medium uppercase tracking-[0.22em] text-muted-fg @[9rem]:block">{producer}</span>}
        <span className="line-clamp-3 hidden font-display text-[1.25em] leading-[1.15] text-fg @[9rem]:block">{name}</span>
      </span>
    </span>
  );
}
