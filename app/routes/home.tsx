import type { Route } from "./+types/home";
import { shopContext } from "~/.server/context";
import { getSetting } from "~/.server/settings";
import { homeBlocks, resolveBlocks } from "~/.server/blocks";
import { Blocks } from "~/components/blocks";
import { homeLd, socialMeta } from "~/lib/seo";
import { tl } from "~/lib/localized";
import type { RootData } from "~/root";

/** Home page = page-builder blocks (Admin › Inhalte › Startseite). */
export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(shopContext);
  const home = await getSetting("home", ctx.storefront?.slug);
  return { blocks: await resolveBlocks(ctx, homeBlocks(home)) };
}

export const meta: Route.MetaFunction = ({ matches }) => {
  const root = matches[0].loaderData as RootData | undefined;
  if (!root) return [];
  const tagline = tl(root.brand.tagline, root.locale);
  return [
    { title: `${root.brand.name}${tagline ? ` — ${tagline}` : ""}` },
    ...socialMeta({ title: root.brand.name, description: tagline || undefined, url: `${root.origin}/`, image: root.brand.logoUrl || null, siteName: root.brand.name }),
    { "script:ld+json": homeLd(root.brand, root.origin) },
  ];
};

export default function Home({ loaderData }: Route.ComponentProps) {
  return <Blocks blocks={loaderData.blocks} />;
}
