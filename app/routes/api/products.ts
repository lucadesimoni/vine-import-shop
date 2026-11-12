import type { Route } from "./+types/products";
import { buildShopContext } from "~/.server/context";
import { searchProducts } from "~/.server/catalog";

/** Public read-only catalog API (headless front-ends, marketplaces). Consumer view only. */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const ctx = await buildShopContext(new Request(request.url)); // anonymous context, never trade prices
  const res = await searchProducts(ctx, {
    q: url.searchParams.get("q") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    producer: url.searchParams.get("producer") ?? undefined,
    page: Number(url.searchParams.get("page") ?? 1),
    perPage: Math.min(100, Number(url.searchParams.get("per_page") ?? 24)),
  });
  return Response.json({ data: res.items, meta: { total: res.total, page: res.page, pages: res.pages } }, { headers: { "Cache-Control": "public, max-age=60", "Access-Control-Allow-Origin": process.env.API_CORS ?? "" } });
}
