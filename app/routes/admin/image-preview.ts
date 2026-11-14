import { eq } from "drizzle-orm";
import type { Route } from "./+types/image-preview";
import { requireStaff } from "~/.server/auth";
import { getDb, schema } from "~/.server/db";
import { renderEdit } from "~/.server/image-edit";
import { load } from "~/.server/images";
import { parseEdit } from "~/lib/image-edit";

/**
 * Live preview for the image editor: GET /admin/products/:id/image-preview?stage=base|result&edit={json}
 * base   = orientation + straighten (the crop frame works on it)
 * result = all steps, as the shop will show it
 * Originals are cached in memory for a few minutes so dragging a slider does not refetch remote images.
 */
const cache = new Map<string, { at: number; data: Uint8Array }>();
async function original(src: string) {
  const hit = cache.get(src);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.data;
  const data = await load(src);
  cache.set(src, { at: Date.now(), data });
  if (cache.size > 12) cache.delete(cache.keys().next().value!);
  return data;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireStaff(request);
  const db = await getDb();
  const p = await db.query.products.findFirst({ where: eq(schema.products.id, Number(params.id)), columns: { image: true, imageSource: true } });
  const src = p?.imageSource ?? p?.image;
  if (!src) throw new Response("no image", { status: 404 });
  const url = new URL(request.url);
  const stage = url.searchParams.get("stage") === "base" ? "base" : "result";
  let edit;
  try { edit = parseEdit(JSON.parse(url.searchParams.get("edit") ?? "{}")); } catch { edit = parseEdit({}); }
  const img = await renderEdit(await original(src), edit, stage, 1400);
  const body = await img.resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true }).webp({ quality: 80, alphaQuality: 90 }).toBuffer();
  return new Response(new Uint8Array(body), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=300" } });
}
