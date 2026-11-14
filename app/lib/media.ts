/**
 * Responsive content images (hero, categories, blocks, story, producer portraits, unoptimised product photos):
 * /media/img?src=…&w=… returns a WebP of that width (routes/resources/media-img.ts), the browser picks one via srcset.
 * Only own sources are resized: local paths and the configured storage origins (no open image proxy).
 */
export const MEDIA_WIDTHS = [320, 480, 640, 828, 1080, 1280, 1600, 1920] as const;

export const mediaUrl = (src: string, w: number) => `/media/img?src=${encodeURIComponent(src)}&w=${w}`;

export function canResize(src: string | null | undefined, origins: readonly string[] = []): src is string {
  if (!src || src.startsWith("data:") || /\.(svg|gif)(\?|#|$)/i.test(src)) return false;
  if (/\/img\/[^/?#]+\.webp$/.test(src)) return false; // already optimised (product image job: 480 + 1200 px)
  if (src.startsWith("/")) return !src.startsWith("//") && !src.includes("..") && !src.startsWith("/media/");
  try { return origins.includes(new URL(src).origin); } catch { return false; }
}

/** src + srcSet for an <img>; unchanged src when the image cannot be resized */
export function responsive(src: string | null | undefined, origins: readonly string[] = [], max = 1920) {
  if (!canResize(src, origins)) return { src: src ?? undefined, srcSet: undefined };
  const widths = MEDIA_WIDTHS.filter((w) => w <= max);
  return { src: mediaUrl(src, widths.at(-1)!), srcSet: widths.map((w) => `${mediaUrl(src, w)} ${w}w`).join(", ") };
}
