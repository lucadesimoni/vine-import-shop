import type { Route } from "./+types/robots";

export function loader({ request }: Route.LoaderArgs) {
  const origin = new URL(request.url).origin;
  return new Response(`User-agent: *\nDisallow: /admin\nDisallow: /account\nDisallow: /checkout\nDisallow: /order-list\nDisallow: /portal\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`, { headers: { "Content-Type": "text/plain" } });
}
