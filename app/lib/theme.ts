import type { Brand } from "./settings";

/* ─── Colour maths (tiny, dependency-free) ─────────────────────────────── */
type RGB = [number, number, number];
const toRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const toHex = (c: RGB) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
/** mix(a, b, t): t = share of b (0..1) */
export const mix = (a: string, b: string, t: number) => { const x = toRgb(a), y = toRgb(b); return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as RGB); };
const lum = (hex: string) => { const [r, g, b] = toRgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const toHsl = (hex: string): RGB => {
  const [r, g, b] = toRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
};
const fromHsl = ([h, s, l]: RGB) => {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
};
/** Raise HSL lightness (hue & saturation kept → the brand colour stays recognisable) until `min` contrast on `bg`. */
const ensure = (fg: string, bg: string, min: number) => {
  const [h, s, l0] = toHsl(fg);
  let c = fg;
  for (let l = l0; l <= 0.92 && contrast(c, bg) < min; l += 0.025) c = fromHsl([h, Math.min(1, s * 1.04), l]);
  return c;
};
const readableOn = (bg: string, light = "#ffffff", dark = "#141012") => (contrast(light, bg) >= contrast(dark, bg) ? light : dark);

export type Palette = {
  bg: string; fg: string; card: string; primary: string; onPrimary: string; muted: string; mutedFg: string; accent: string; border: string;
  inverse: string; onInverse: string; media: string; scrim: string; shadow: string;
  success: string; successSoft: string; warning: string; warningSoft: string; danger: string; dangerSoft: string; onDanger: string;
  /** product-material tones for packshot placeholders */
  artOil: string; artGlass: string; artSpirit: string; artDairy: string;
};
const ART = { artOil: "#7d7a2e", artGlass: "#c9c48f", artSpirit: "#b8c0c2", artDairy: "#f1ede6" };

/** Light palette = the brand colours from the admin + fixed, accessible status colours. */
export function lightPalette(brand: Brand): Palette {
  const c = brand.colors;
  return {
    bg: c.background, fg: c.foreground, card: c.card, primary: c.primary, onPrimary: c.primaryForeground, muted: c.muted, mutedFg: c.mutedForeground,
    accent: c.accent, border: c.border, inverse: c.inverse, onInverse: c.inverseForeground,
    media: c.card, scrim: "#000000", shadow: "#000000",
    success: "#2f6b45", successSoft: mix(c.card, "#2f6b45", 0.1), warning: "#8a5a12", warningSoft: mix(c.card, "#b9822b", 0.13),
    danger: "#a12a2a", dangerSoft: mix(c.card, "#a12a2a", 0.09), onDanger: "#ffffff",
    ...ART,
  };
}

/** Dark palette derived from the brand (so every tenant gets one), overridable key-by-key in settings. */
export function darkPalette(brand: Brand): Palette {
  const c = brand.colors;
  const o = brand.colorsDark as Partial<Record<keyof Brand["colors"], string>>;
  const bg = o.background ?? mix(c.foreground, "#000000", 0.38);
  const card = o.card ?? mix(bg, "#ffffff", 0.045);
  const fg = o.foreground ?? mix(c.background, bg, 0.06);
  const primary = o.primary ?? ensure(c.primary, card, 3.6);
  const accent = o.accent ?? ensure(c.accent, card, 3);
  const inverse = o.inverse ?? mix(c.inverse, "#000000", 0.35);
  return {
    bg, fg, card, primary,
    onPrimary: o.primaryForeground ?? readableOn(primary),
    muted: o.muted ?? mix(bg, "#ffffff", 0.085),
    mutedFg: o.mutedForeground ?? ensure(mix(fg, bg, 0.4), card, 4.6),
    accent,
    border: o.border ?? mix(bg, "#ffffff", 0.13),
    inverse, onInverse: o.inverseForeground ?? readableOn(inverse, c.inverseForeground),
    media: c.card, // packshots keep their light stage so white-background photos blend seamlessly
    scrim: "#000000", shadow: "#000000",
    success: "#7cc196", successSoft: mix(card, "#7cc196", 0.14), warning: "#e0b25c", warningSoft: mix(card, "#e0b25c", 0.14),
    danger: "#f08a8a", dangerSoft: mix(card, "#f08a8a", 0.13), onDanger: "#1a0d0d",
    ...ART, // packshots sit on the light media stage in both modes
  };
}

const COLOR_VARS: Record<keyof Palette, string> = {
  bg: "--t-bg", fg: "--t-fg", card: "--t-card", primary: "--t-primary", onPrimary: "--t-on-primary", muted: "--t-muted", mutedFg: "--t-muted-fg",
  accent: "--t-accent", border: "--t-border", inverse: "--t-inverse", onInverse: "--t-on-inverse", media: "--t-media", scrim: "--t-scrim", shadow: "--t-shadow",
  success: "--t-success", successSoft: "--t-success-soft", warning: "--t-warning", warningSoft: "--t-warning-soft", danger: "--t-danger", dangerSoft: "--t-danger-soft", onDanger: "--t-on-danger",
  artOil: "--t-art-oil", artGlass: "--t-art-glass", artSpirit: "--t-art-spirit", artDairy: "--t-art-dairy",
};
const colorVars = (p: Palette) => Object.fromEntries(Object.entries(COLOR_VARS).map(([k, v]) => [v, p[k as keyof Palette]]));

/** Brand settings → CSS custom properties consumed by the token layer in app.css. */
export function themeVars(brand: Brand): Record<string, string> {
  const r = brand.radius;
  // Shape roles (design language): surfaces > controls > badges; buttons & chips follow buttonStyle.
  const btn = brand.buttonStyle === "pill" ? "999px" : brand.buttonStyle === "square" ? "0px" : `${r}px`;
  const badge = brand.buttonStyle === "pill" ? "999px" : `${Math.round(r * 0.6)}px`;
  const upper = brand.buttonCase === "upper";
  return {
    ...colorVars(lightPalette(brand)),
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

const css = (vars: Record<string, string>) => Object.entries(vars).map(([k, v]) => `${k}:${v.replace(/[<>{};]/g, "")}`).join(";");

/** Light tokens on :root, dark tokens on [data-theme=dark] (set before paint, see root.tsx). */
export function themeCss(brand: Brand): string {
  const light = `:root{${css(themeVars(brand))};color-scheme:light}`;
  if (brand.darkMode === "off") return light;
  return `${light}:root[data-theme=dark]{${css(colorVars(darkPalette(brand)))};color-scheme:dark}`;
}

/** Bunny Fonts (GDPR-friendly, no IP logging) stylesheet URL for the selected pair. */
export function fontsHref(brand: Brand): string {
  const fam = (name: string, weights: string) => `${name.toLowerCase().replace(/\s+/g, "-")}:${weights}`;
  const families = [fam(brand.fonts.display, "400,500,600,400i"), fam(brand.fonts.body, "300,400,500,600,700")];
  return `https://fonts.bunny.net/css?family=${[...new Set(families)].join("|")}&display=swap`;
}
