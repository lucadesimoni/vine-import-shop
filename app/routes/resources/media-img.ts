import type { Route } from "./+types/media-img";
import { load } from "~/.server/images";
import { mediaOrigins } from "~/.server/storage";
import { canResize, MEDIA_WIDTHS } from "~/lib/media";

/**
 * GET /media/img?src=/demo/hero.jpg&w=828 → WebP in that width (never enlarged). Own sources only (canResize).
 * Rendered images are kept in a small in-memory LRU; the response is cacheable for a year by CDNs (Vercel, Cloudflare)
 * and for a week by browsers — the source URL is part of the key, uploads get unique names.
 */
const MAX_BYTES = 64 * 1024 * 1024;
const cache = new Map<string, Buffer>();
let bytes = 0;
const pending = new Map<string, Promise<Buffer>>();

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const src = url.searchParams.get("src") ?? "";
  const w = Number(url.searchParams.get("w"));
  if (!canResize(src, mediaOrigins()) || !(MEDIA_WIDTHS as readonly number[]).includes(w)) return new Response("Bad request", { status: 400 });
  const key = `${w}|${src}`;
  let body = cache.get(key);
  if (body) { cache.delete(key); cache.set(key, body); } // LRU: most recent last
  else {
    // concurrent requests for the same image share one render
    const job = pending.get(key) ?? (async () => {
      const sharp = (await import("sharp")).default;
      const input = await load(src);
      return sharp(input, { failOn: "none" }).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toBuffer();
    })();
    pending.set(key, job);
    try { body = await job; } catch { return new Response("Not found", { status: 404 }); } finally { pending.delete(key); }
    cache.set(key, body);
    bytes += body.length;
    for (const [k, v] of cache) { if (bytes <= MAX_BYTES) break; cache.delete(k); bytes -= v.length; }
  }
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=604800, s-maxage=31536000, stale-while-revalidate=604800"},
  });
}
