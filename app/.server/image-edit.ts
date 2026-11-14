import type { Sharp } from "sharp";
import { RATIOS, type ImageEdit } from "~/lib/image-edit";

/**
 * Renders a product image from its original and the edit parameters (app/lib/image-edit.ts):
 *   EXIF orientation → quarter turns / mirror → straighten (corners cropped) → crop
 *   → cut-out of a light background (flood fill from the edges: white labels inside the product stay)
 *   → trim empty margins → canvas (ratio, padding, colour) → soft shadow
 * Works on raw RGBA between the steps, at most WORK px, so a preview takes well under a second.
 */
const WORK = 2000;
type Raw = { data: Buffer; width: number; height: number };

async function lib() {
  return (await import("sharp")).default;
}
async function toRaw(s: Sharp): Promise<Raw> {
  const { data, info } = await s.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
async function fromRaw(r: Raw) {
  return (await lib())(r.data, { raw: { width: r.width, height: r.height, channels: 4 } });
}

/** after a fine rotation by `deg`, size of the largest centred rectangle of the original ratio without empty corners */
export function straightenSize(w: number, h: number, deg: number) {
  const t = (Math.abs(deg) * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  const k = Math.min(w / (w * c + h * s), h / (w * s + h * c));
  return { width: Math.max(1, Math.floor(w * k)), height: Math.max(1, Math.floor(h * k)) };
}

/** background colour estimate: per-channel median of the border pixels */
export function borderColor(r: Raw): [number, number, number] {
  const ch: number[][] = [[], [], []];
  const push = (x: number, y: number) => { const i = (y * r.width + x) * 4; for (let k = 0; k < 3; k++) ch[k].push(r.data[i + k]); };
  const step = Math.max(1, Math.floor((r.width + r.height) / 800));
  for (let x = 0; x < r.width; x += step) { push(x, 0); push(x, r.height - 1); }
  for (let y = 0; y < r.height; y += step) { push(0, y); push(r.width - 1, y); }
  return ch.map((a) => a.sort((p, q) => p - q)[a.length >> 1]) as [number, number, number];
}
const dist = (d: Buffer, i: number, bg: [number, number, number]) => Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]);

/**
 * Makes the background transparent: everything connected to the image border whose colour is within the tolerance
 * of the border colour. Pixels just above the tolerance get partial alpha (soft, anti-aliased edge).
 * Returns null when it would remove (almost) everything — then the photo has no even background.
 */
export function cutout(r: Raw, tolerance: number): Raw | null {
  const { width: w, height: h } = r;
  const d = Buffer.from(r.data);
  const bg = borderColor(r);
  const T = tolerance * 2;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const tryPush = (p: number) => { if (!seen[p] && d[p * 4 + 3] > 0 && dist(d, p * 4, bg) <= T) { seen[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { tryPush(x); tryPush((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { tryPush(y * w); tryPush(y * w + w - 1); }
  let removed = 0;
  while (stack.length) {
    const p = stack.pop()!;
    removed++;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) tryPush(p - 1);
    if (x < w - 1) tryPush(p + 1);
    if (y > 0) tryPush(p - w);
    if (y < h - 1) tryPush(p + w);
  }
  if (removed > w * h * 0.97 || removed === 0) return null;
  for (let p = 0; p < w * h; p++) {
    if (seen[p]) { d[p * 4 + 3] = 0; continue; }
    // soft edge: a pixel next to the removed background fades in over one more tolerance step
    const x = p % w, y = (p / w) | 0;
    const nb = (x > 0 && seen[p - 1]) || (x < w - 1 && seen[p + 1]) || (y > 0 && seen[p - w]) || (y < h - 1 && seen[p + w]);
    if (nb) {
      const a = Math.min(1, Math.max(0, (dist(d, p * 4, bg) - T) / T));
      d[p * 4 + 3] = Math.round(d[p * 4 + 3] * (0.35 + 0.65 * a));
    }
  }
  return { data: d, width: w, height: h };
}

/** bounding box of the product: opaque pixels that differ from the border colour */
export function contentBox(r: Raw, tolerance: number) {
  const { width: w, height: h, data: d } = r;
  const bg = borderColor(r);
  const T = Math.max(6, tolerance * 2);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (d[i + 3] > 12 && (d[i + 3] < 250 || dist(d, i, bg) > T)) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

const rgba = (bg: string) =>
  bg === "transparent" ? { r: 255, g: 255, b: 255, alpha: 0 }
  : bg === "white" ? { r: 255, g: 255, b: 255, alpha: 1 }
  : { r: parseInt(bg.slice(1, 3), 16), g: parseInt(bg.slice(3, 5), 16), b: parseInt(bg.slice(5, 7), 16), alpha: 1 };

/**
 * stage "base": orientation + straighten only (what the crop frame in the editor works on);
 * stage "result": everything. Returns a sharp instance of the result (RGBA).
 */
export async function renderEdit(input: Uint8Array, e: ImageEdit, stage: "base" | "result" = "result", max = WORK): Promise<Sharp> {
  const sharp = await lib();
  // one step per operation (materialised in between), so the order is exactly: turn → mirror → straighten
  let r = await toRaw(sharp(input, { failOn: "none" }).rotate().resize({ width: max, height: max, fit: "inside", withoutEnlargement: true }));
  if (e.rotate) r = await toRaw((await fromRaw(r)).rotate(e.rotate));
  if (e.flip) r = await toRaw((await fromRaw(r)).flop());
  if (e.straighten) {
    const size = straightenSize(r.width, r.height, e.straighten);
    const rot = await toRaw((await fromRaw(r)).rotate(e.straighten, { background: { r: 0, g: 0, b: 0, alpha: 0 } }));
    const width = Math.min(size.width, rot.width), height = Math.min(size.height, rot.height);
    r = await toRaw((await fromRaw(rot)).extract({ left: Math.floor((rot.width - width) / 2), top: Math.floor((rot.height - height) / 2), width, height }));
  }
  if (stage === "base") return fromRaw(r);

  if (e.crop) {
    const left = Math.round(e.crop.x * r.width), top = Math.round(e.crop.y * r.height);
    const width = Math.max(1, Math.min(r.width - left, Math.round(e.crop.w * r.width)));
    const height = Math.max(1, Math.min(r.height - top, Math.round(e.crop.h * r.height)));
    r = await toRaw((await fromRaw(r)).extract({ left, top, width, height }));
  }
  if (e.cutout) r = cutout(r, e.tolerance) ?? r;
  if (e.trim) {
    const box = contentBox(r, e.tolerance);
    if (box && (box.width < r.width || box.height < r.height)) r = await toRaw((await fromRaw(r)).extract(box));
  }

  // canvas: ratio + padding around the content
  const ratio = RATIOS[e.ratio];
  const pad = e.padding / 100;
  let W = r.width, H = r.height;
  if (ratio || pad) {
    const inner = 1 - 2 * pad;
    H = Math.ceil(Math.max(r.height, ratio ? r.width / ratio : r.height) / inner);
    W = Math.ceil(ratio ? H * ratio : r.width / inner);
    if (!ratio) H = Math.ceil(r.height / inner);
  }
  const left = Math.floor((W - r.width) / 2), top = Math.floor((H - r.height) / 2);
  const product = await (await fromRaw(r)).png().toBuffer();
  const layers: { input: Buffer; left: number; top: number }[] = [];
  if (e.shadow) {
    // soft elliptical shadow under the product's base, as wide as the canvas layer (never larger than the canvas)
    const sw = Math.round(r.width * 0.8), sh = Math.max(6, Math.round(r.height * 0.05));
    const blur = Math.max(2, Math.round(sh / 2.5));
    const lh = sh + blur * 6;
    const sy = top + r.height - Math.round(sh * 0.6) - blur * 3;
    if (sy + lh > H) H = sy + lh; // keep the shadow on the canvas
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${lh}"><filter id="b" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="${blur}"/></filter><ellipse cx="${left + r.width / 2}" cy="${lh / 2}" rx="${sw / 2}" ry="${sh / 2}" fill="rgba(0,0,0,0.22)" filter="url(#b)"/></svg>`;
    layers.push({ input: Buffer.from(svg), left: 0, top: Math.max(0, sy) });
  }
  layers.push({ input: product, left, top });
  // materialised: sharp would otherwise apply a caller's resize() before the composite
  return fromRaw(await toRaw(sharp({ create: { width: W, height: H, channels: 4, background: rgba(e.background) } }).composite(layers)));
}
