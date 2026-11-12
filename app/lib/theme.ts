import type { Brand } from "./settings";

/** Brand settings → CSS custom properties consumed by the token layer in app.css. */
export function themeVars(brand: Brand): Record<string, string> {
  const c = brand.colors;
  const r = brand.radius;
  // Shape roles (design language): surfaces > controls > badges; buttons & chips follow buttonStyle.
  const btn = brand.buttonStyle === "pill" ? "999px" : brand.buttonStyle === "square" ? "0px" : `${r}px`;
  const badge = brand.buttonStyle === "pill" ? "999px" : `${Math.round(r * 0.6)}px`;
  const upper = brand.buttonCase === "upper";
  return {
    "--t-bg": c.background,
    "--t-fg": c.foreground,
    "--t-card": c.card,
    "--t-primary": c.primary,
    "--t-on-primary": c.primaryForeground,
    "--t-muted": c.muted,
    "--t-muted-fg": c.mutedForeground,
    "--t-accent": c.accent,
    "--t-border": c.border,
    "--t-inverse": c.inverse,
    "--t-on-inverse": c.inverseForeground,
    "--t-font-display": `"${brand.fonts.display}"`,
    "--t-font-body": `"${brand.fonts.body}"`,
    "--t-radius": `${r}px`,
    "--t-radius-surface": `${Math.round(r * 1.5)}px`,
    "--t-radius-control": `${r}px`,
    "--t-radius-badge": badge,
    "--t-radius-btn": btn,
    "--t-btn-case": upper ? "uppercase" : "none",
    "--t-btn-tracking": upper ? "0.14em" : "0",
    "--t-btn-scale": upper ? "0.86" : "1",
  };
}

export function themeCss(brand: Brand): string {
  const vars = Object.entries(themeVars(brand))
    .map(([k, v]) => `${k}:${v.replace(/[<>{};]/g, "")}`)
    .join(";");
  return `:root{${vars}}`;
}

/** Bunny Fonts (GDPR-friendly, no IP logging) stylesheet URL for the selected pair. */
export function fontsHref(brand: Brand): string {
  const fam = (name: string, weights: string) => `${name.toLowerCase().replace(/\s+/g, "-")}:${weights}`;
  const families = [fam(brand.fonts.display, "400,500,600,400i"), fam(brand.fonts.body, "300,400,500,600,700")];
  return `https://fonts.bunny.net/css?family=${[...new Set(families)].join("|")}&display=swap`;
}
