import type { Brand } from "./settings";

/** Brand settings → CSS custom properties consumed by the token layer in app.css. */
export function themeVars(brand: Brand): Record<string, string> {
  const c = brand.colors;
  const btn = brand.buttonStyle === "pill" ? "999px" : brand.buttonStyle === "square" ? "0px" : `${brand.radius}px`;
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
    "--t-radius": `${brand.radius}px`,
    "--t-radius-btn": btn,
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
