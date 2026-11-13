import type { Route } from "./+types/erp-document";
import { requireUser } from "~/.server/auth";
import { erpConnected } from "~/.server/erp-ownership";
import { erpClient } from "~/.server/vinx/sync";

/** ERP document download (vinX BaseData/Document) — only documents listed for the signed-in customer's ERP address. */
export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  if (!user.erpId || !(await erpConnected())) throw new Response("Not found", { status: 404 });
  const client = await erpClient();
  if (!client.documents || !client.document) throw new Response("Not found", { status: 404 });
  const mine = await client.documents(user.erpId);
  if (!mine.some((d) => d.id === params.id)) throw new Response("Not found", { status: 404 });
  const doc = await client.document(params.id);
  if (!doc) throw new Response("Not found", { status: 404 });
  return new Response(doc.body, {
    headers: {
      "Content-Type": doc.type,
      "Content-Disposition": `attachment; filename="${doc.name.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
