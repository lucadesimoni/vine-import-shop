import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, count, eq, isNotNull, like, not } from "drizzle-orm";
import { getDb, schema } from "./db";
import { readUpload, saveBuffer } from "./storage";

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

async function load(src: string): Promise<Uint8Array> {
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

/** Optimize one image; returns the new URL (full size) and the byte sizes before/after. */
export async function optimizeImage(src: string, name: string) {
  const sharp = (await import("sharp")).default;
  const input = await load(src);
  const base = sharp(input, { failOn: "none" }).rotate();
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw new Error("not an image");
  const [full, thumb] = await Promise.all(
    [SIZES.full, SIZES.thumb].map((w) => base.clone().resize({ width: w, height: w, fit: "inside", withoutEnlargement: true }).webp({ quality: w > 600 ? 82 : 78, effort: 4 }).toBuffer()),
  );
  const hash = createHash("sha1").update(input).digest("hex").slice(0, 10);
  const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "image";
  const url = await saveBuffer(`img/${slug}-${hash}.webp`, new Uint8Array(full), "image/webp");
  await saveBuffer(`img/${slug}-${hash}-480.webp`, new Uint8Array(thumb), "image/webp");
  return { url, before: input.byteLength, after: full.byteLength };
}

/** Job: optimize the next batch of product images that are not optimized yet. */
export async function optimizeProductImages(limit = 40) {
  const db = await getDb();
  const p = schema.products;
  const rows = await db.select({ id: p.id, slug: p.slug, image: p.image }).from(p)
    .where(and(isNotNull(p.image), not(like(p.image, "%/img/%.webp")))).limit(limit);
  let done = 0, failed = 0, before = 0, after = 0;
  const errors: string[] = [];
  for (const r of rows) {
    try {
      const o = await optimizeImage(r.image!, r.slug);
      await db.update(p).set({ image: o.url, updatedAt: new Date() }).where(eq(p.id, r.id));
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
