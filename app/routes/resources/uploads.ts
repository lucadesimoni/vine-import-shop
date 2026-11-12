import type { Route } from "./+types/uploads";
import { readUpload } from "~/.server/storage";

/** Serves locally stored uploads (STORAGE_DRIVER=local). With S3 the public URL is used directly. */
export async function loader({ params }: Route.LoaderArgs) {
  const file = await readUpload(params["*"] ?? "");
  if (!file) throw new Response("Not found", { status: 404 });
  return new Response(new Blob([file.body as BlobPart]), { headers: { "Content-Type": file.type, "Cache-Control": "public, max-age=604800, immutable" } });
}
