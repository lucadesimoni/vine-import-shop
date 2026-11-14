import type { ComponentProps } from "react";
import { responsive } from "~/lib/media";
import { useRootData } from "~/lib/root-data";

/**
 * <img> for content images: own images get a WebP srcset from /media/img (right size per screen), everything else
 * passes through unchanged. `sizes` should describe the rendered width (default: full viewport).
 */
export function Img({ src, sizes = "100vw", max, ...rest }: ComponentProps<"img"> & { max?: number }) {
  const root = useRootData();
  const r = responsive(typeof src === "string" ? src : undefined, root?.mediaOrigins ?? [], max);
  return <img src={r.src} srcSet={r.srcSet} sizes={r.srcSet ? sizes : undefined} decoding="async" {...rest} />;
}
