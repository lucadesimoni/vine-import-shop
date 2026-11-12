import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { Route } from "./+types/backup-download";
import { requireStaff } from "~/.server/auth";
import { backupPath } from "~/.server/maintenance";

/** Staff-only download of a backup file (offsite copy). */
export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireStaff(request);
  if (user.role !== "admin") throw new Response("Forbidden", { status: 403 });
  let path: string;
  try { path = backupPath(params.name); } catch { throw new Response("Not found", { status: 404 }); }
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${params.name}"`, "Cache-Control": "no-store" },
  });
}
