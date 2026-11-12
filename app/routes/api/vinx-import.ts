import { timingSafeEqual } from "node:crypto";
import type { Route } from "./+types/vinx-import";
import { decodeUpload } from "~/.server/vinx/csv";
import { erpClient, syncArticles, syncPrices, syncStock } from "~/.server/vinx/sync";

/**
 * File-exchange endpoint for CSV/XML-export setups (works on serverless hosts):
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" -F articles=@artikel.csv -F stock=@lager.csv https://…/api/vinx/import
 */
export async function action({ request }: Route.ActionArgs) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (request.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const form = await request.formData();
  const read = async (k: string) => {
    const f = form.get(k);
    return f instanceof File ? decodeUpload(await f.arrayBuffer()) : undefined;
  };
  const files = { articles: await read("articles"), stock: await read("stock"), prices: await read("prices") };
  const client = await erpClient(undefined, files);
  return Response.json({
    articles: files.articles ? await syncArticles(client, true) : null,
    stock: files.stock ? await syncStock(client) : null,
    prices: files.prices ? await syncPrices(client) : null,
  });
}
