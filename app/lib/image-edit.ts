/**
 * Non-destructive product-image edits. The original stays in products.image_source; these parameters describe how
 * the shop image is rendered from it (server: app/.server/image-edit.ts). Every edit starts from the original, so
 * nothing degrades and "reset" always works.
 */
export const RATIOS = { original: null, "1:1": 1, "3:4": 3 / 4, "4:5": 4 / 5, "2:3": 2 / 3 } as const;
export type Ratio = keyof typeof RATIOS;

export type ImageEdit = {
  /** quarter turns clockwise */
  rotate: 0 | 90 | 180 | 270;
  /** fine rotation in degrees (−15 … 15), corners are cropped away */
  straighten: number;
  flip: boolean;
  /** crop of the rotated image, relative 0…1; null = whole image */
  crop: { x: number; y: number; w: number; h: number } | null;
  /** make a light, even background transparent (packshots on white/grey) */
  cutout: boolean;
  /** cutout tolerance 1…60 (colour distance to the background) */
  tolerance: number;
  /** remove empty margins around the product */
  trim: boolean;
  /** place the product on a canvas of this ratio, centred, with padding (% of the canvas) */
  ratio: Ratio;
  padding: number;
  /** canvas colour: transparent, white or #rrggbb */
  background: string;
  /** soft shadow under the product (needs a cut-out or transparent image) */
  shadow: boolean;
  /** set by the bulk "harmonize" job: replaced when the standard changes, unlike a manual edit */
  auto?: boolean;
};

export const NO_EDIT: ImageEdit = { rotate: 0, straighten: 0, flip: false, crop: null, cutout: false, tolerance: 10, trim: false, ratio: "original", padding: 0, background: "transparent", shadow: false };

const clamp = (n: unknown, lo: number, hi: number, d: number) => { const v = Number(n); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };

/** untrusted input (form JSON, database) → a valid edit */
export function parseEdit(raw: unknown): ImageEdit {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const c = o.crop as Record<string, unknown> | null | undefined;
  let crop: ImageEdit["crop"] = null;
  if (c && typeof c === "object") {
    const x = clamp(c.x, 0, 1, 0), y = clamp(c.y, 0, 1, 0);
    const w = clamp(c.w, 0.02, 1 - x, 1 - x), h = clamp(c.h, 0.02, 1 - y, 1 - y);
    if (!(x === 0 && y === 0 && w > 0.999 && h > 0.999)) crop = { x, y, w, h };
  }
  const rot = Number(o.rotate);
  const bg = String(o.background ?? "transparent");
  return {
    rotate: ([0, 90, 180, 270] as const).find((r) => r === rot) ?? 0,
    straighten: Math.round(clamp(o.straighten, -15, 15, 0) * 10) / 10,
    flip: o.flip === true,
    crop,
    cutout: o.cutout === true,
    tolerance: Math.round(clamp(o.tolerance, 1, 60, 10)),
    trim: o.trim === true,
    ratio: (Object.keys(RATIOS) as Ratio[]).includes(o.ratio as Ratio) ? (o.ratio as Ratio) : "original",
    padding: Math.round(clamp(o.padding, 0, 25, 0)),
    background: bg === "white" || bg === "transparent" || /^#[0-9a-f]{6}$/i.test(bg) ? bg.toLowerCase() : "transparent",
    shadow: o.shadow === true,
    ...(o.auto === true ? { auto: true } : {}),
  };
}

export const isNoEdit = (e: ImageEdit) =>
  e.rotate === 0 && e.straighten === 0 && !e.flip && !e.crop && !e.cutout && !e.trim && e.ratio === "original" && !e.shadow;

/** stable key of an edit (file names, caching) */
export const editKey = (e: ImageEdit) => JSON.stringify({ ...e, auto: undefined });
