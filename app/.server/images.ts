import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, asc, count, eq, isNotNull, like, not } from "drizzle-orm";
import { editKey, isNoEdit, NO_EDIT, parseEdit, type ImageEdit } from "~/lib/image-edit";
import type { Shop } from "~/lib/settings";
import { getDb, schema } from "./db";
import { renderEdit } from "./image-edit";
import { getSetting } from "./settings";
import { outOfTime } from "./job-runtime";
import { persistentStorage, readUpload, saveBuffer } from "./storage";

/**
 * Image optimizer: product photos (uploads, ERP/supplier URLs, demo files) → WebP in two sizes,
 * stored under img/ (local uploads or S3) and served with long cache headers:
 *   img/<name>-<hash>.webp      max. 1200 px (product page, zoom)
 *   img/<name>-<hash>-480.webp  480 px (cards, lists) — picked by the browser through srcset
 * The product's image URL is replaced; photos already optimized are skipped. Job "images" (Admin › vinX/Jobs, cron),
 * and new uploads in Admin › Produkte are optimized right away.
 */
export const SIZES = { full: 1200, thumb: 480 } as const;
export const isOptimized = (url: string | null | undefined) => !!url && /\/img\/[^/]+\.webp$/.test(url) && !/-480\.webp$/.test(url);
/** srcset for an optimized image (null for others) */
export const thumbOf = (url: string) => url.replace(/\.webp$/, "-480.webp");

export async function load(src: string): Promise<Uint8Array> {
  if (src.startsWith("/uploads/")) {
    const f = await readUpload(src.slice("/uploads/".length));
    if (!f) throw new Error("upload not found");
    return f.body;
  }
  if (src.startsWith("/")) {
    // static files (public/, e.g. demo photos) — in the build they live in build/client
    for (const dir of ["public", "build/client"]) {
      try { return new Uint8Array(await readFile(join(process.cwd(), dir, src))); } catch { /* next */ }
    }
    throw new Error("file not found");
  }
  if (!/^https?:\/\//.test(src)) throw new Error("unsupported source");
  const res = await fetch(src, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": "shop-image-optimizer" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > 25 * 1024 * 1024) throw new Error("too large");
  return new Uint8Array(await res.arrayBuffer());
}

/** the shop's image standard as an edit (null when switched off) */
export function standardEdit(images: Shop["images"]): ImageEdit | null {
  if (!images.enabled) return null;
  return { ...NO_EDIT, cutout: images.cutout, tolerance: images.tolerance, trim: images.trim, ratio: images.ratio, padding: images.padding, background: images.background, shadow: images.shadow, auto: true };
}

/**
 * Render one image from its original with an edit (default: none = plain optimisation) → WebP 1200 + 480 px.
 * Returns the new URL (full size) and the byte sizes before/after.
 */
export async function optimizeImage(src: string, name: string, edit: ImageEdit = NO_EDIT) {
  const sharp = (await import("sharp")).default;
  const input = await load(src);
  let base = isNoEdit(edit) ? sharp(input, { failOn: "none" }).rotate() : await renderEdit(input, edit);
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw new Error("not an image");
  // no transparency left (e.g. white canvas) → drop the alpha channel, smaller files
  if (!isNoEdit(edit) && (await base.clone().stats()).isOpaque) base = base.removeAlpha();
  const [full, thumb] = await Promise.all(
    [SIZES.full, SIZES.thumb].map((w) => base.clone().resize({ width: w, height: w, fit: "inside", withoutEnlargement: true }).webp({ quality: w > 600 ? 82 : 78, alphaQuality: 90, effort: 4 }).toBuffer()),
  );
  const hash = createHash("sha1").update(input).update(isNoEdit(edit) ? "" : editKey(edit)).digest("hex").slice(0, 10);
  const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "image";
  const url = await saveBuffer(`img/${slug}-${hash}.webp`, new Uint8Array(full), "image/webp");
  await saveBuffer(`img/${slug}-${hash}-480.webp`, new Uint8Array(thumb), "image/webp");
  return { url, before: input.byteLength, after: full.byteLength };
}

/** Job: optimize the next batch of product images that are not optimized yet. */
export async function optimizeProductImages(limit = 40) {
  // serverless file systems are temporary: optimized files would vanish → only with S3-compatible storage
  if (!persistentStorage()) return { ok: true, items: 0, message: "Übersprungen: auf Vercel braucht der Bild-Optimierer dauerhaften Speicher (Supabase Storage oder STORAGE_DRIVER=s3)" };
  const db = await getDb();
  const p = schema.products;
  const std = standardEdit((await getSetting("shop")).images);
  const rows = await db.select({ id: p.id, slug: p.slug, image: p.image, imageSource: p.imageSource, imageEdit: p.imageEdit }).from(p)
    .where(and(isNotNull(p.image), not(like(p.image, "%/img/%.webp")))).limit(limit);
  let done = 0, failed = 0, before = 0, after = 0;
  const errors: string[] = [];
  for (const r of rows) {
    if (outOfTime()) break;
    try {
      // a new image keeps its original as source and gets the shop's image standard (unless edited by hand)
      const edit = r.imageEdit && !r.imageEdit.auto ? parseEdit(r.imageEdit) : std ?? NO_EDIT;
      const o = await optimizeImage(r.image!, r.slug, edit);
      await db.update(p).set({ image: o.url, imageSource: r.image, imageEdit: isNoEdit(edit) ? null : edit, updatedAt: new Date() }).where(eq(p.id, r.id));
      done++; before += o.before; after += o.after;
    } catch (e) {
      failed++;
      if (errors.length < 3) errors.push(`${r.slug}: ${(e as Error).message}`);
    }
  }
  const [{ n }] = await db.select({ n: count() }).from(p).where(and(isNotNull(p.image), not(like(p.image, "%/img/%.webp"))));
  const mb = (b: number) => (b / 1048576).toFixed(1);
  return {
    ok: failed === 0 || done > 0,
    items: done,
    message: `${done} Bilder optimiert (${mb(before)} → ${mb(after)} MB)${failed ? `, ${failed} fehlgeschlagen: ${errors.join("; ")}` : ""}${n ? ` — ${n} weitere ausstehend (nächster Lauf)` : ""}`,
  };
}

/**
 * Job "images:harmonize": applies the image standard (Admin › Einstellungen › Produktbilder) to every product image
 * that was not edited by hand — or, with the standard off, renders them plain again. Resumable (time budget).
 */
export async function harmonizeProductImages() {
  if (!persistentStorage()) return { ok: true, items: 0, message: "Übersprungen: dauerhafter Bildspeicher nötig (Supabase Storage oder STORAGE_DRIVER=s3)" };
  const { job } = await import("./vinx/sync");
  return job("images:harmonize", async (resume) => {
    const db = await getDb();
    const p = schema.products;
    const std = standardEdit((await getSetting("shop")).images);
    const target = std ?? NO_EDIT;
    const rows = await db.select({ id: p.id, slug: p.slug, image: p.image, imageSource: p.imageSource, imageEdit: p.imageEdit })
      .from(p).where(isNotNull(p.image)).orderBy(asc(p.id)).offset(resume);
    let seen = 0, done = 0, manual = 0, failed = 0, partial = false;
    const errors: string[] = [];
    for (const r of rows) {
      if (seen > 0 && outOfTime()) { partial = true; break; }
      seen++;
      if (r.imageEdit && !r.imageEdit.auto) { manual++; continue; } // edited by hand: never overwritten
      const current = r.imageEdit ? editKey(parseEdit(r.imageEdit)) : editKey(NO_EDIT);
      if (current === editKey(target) && isOptimized(r.image)) continue;
      try {
        const source = r.imageSource ?? r.image!;
        const o = await optimizeImage(source, r.slug, target);
        await db.update(p).set({ image: o.url, imageSource: source, imageEdit: isNoEdit(target) ? null : target, updatedAt: new Date() }).where(eq(p.id, r.id));
        done++;
      } catch (e) {
        failed++;
        if (errors.length < 3) errors.push(`${r.slug}: ${(e as Error).message}`);
      }
    }
    return {
      items: partial ? resume + seen : done,
      partial,
      message: `${done} Bilder ${std ? "nach Standard aufbereitet" : "zurückgesetzt"}${manual ? `, ${manual} von Hand bearbeitete unverändert` : ""}${failed ? `, ${failed} fehlgeschlagen: ${errors.join("; ")}` : ""}`,
    };
  });
}
