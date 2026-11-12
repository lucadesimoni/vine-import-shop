import type { Route } from "./+types/home";
import { shopContext } from "~/.server/context";
import { getSetting } from "~/.server/settings";
import { homeBlocks, resolveBlocks } from "~/.server/blocks";
import { Blocks } from "~/components/blocks";

/** Home page = page-builder blocks (Admin › Inhalte › Startseite). */
export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(shopContext);
  const home = await getSetting("home");
  return { blocks: await resolveBlocks(ctx, homeBlocks(home)) };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return <Blocks blocks={loaderData.blocks} />;
}
