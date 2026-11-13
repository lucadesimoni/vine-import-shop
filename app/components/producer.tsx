import { cn } from "~/lib/cn";

const SIZES = { sm: "h-9 w-9 text-note", md: "h-14 w-14 text-lg", lg: "h-24 w-24 text-3xl md:h-28 md:w-28" } as const;

/** Producer / brand logo (maintained in Admin › Produzenten); sits on the light media stage in both themes; falls back to a token-styled monogram. */
export function ProducerLogo({ name, logo, size = "md", className }: { name: string; logo: string | null | undefined; size?: keyof typeof SIZES; className?: string }) {
  const initials = name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "·";
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-control border border-border", logo ? "bg-media" : "bg-card", SIZES[size], className)} aria-hidden={!logo}>
      {logo ? (
        <img src={logo} alt={name} loading="lazy" decoding="async" className="h-full w-full object-contain p-[12%]" />
      ) : (
        <span className="font-display tracking-wide text-primary">{initials}</span>
      )}
    </span>
  );
}
