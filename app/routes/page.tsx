import { data } from "react-router";
import type { Route } from "./+types/page";
import { shopContext } from "~/.server/context";
import { findPage } from "~/.server/pages";
import { resolveBlocks } from "~/.server/blocks";
import { tl } from "~/lib/localized";
import { renderMarkdown } from "~/lib/markdown";
import { Blocks } from "~/components/blocks";

/** Content pages: page-builder blocks when set, otherwise the classic markdown body (legal pages etc.). */
export async function loader({ params, context }: Route.LoaderArgs) {
  const ctx = context.get(shopContext);
  const page = await findPage(params.slug, ctx.storefront?.id ?? null);
  if (!page) throw data("Not found", { status: 404 });
  const blocks = page.blocks?.length ? await resolveBlocks(ctx, page.blocks) : null;
  return { title: tl(page.title, ctx.locale), html: blocks ? "" : renderMarkdown(tl(page.body, ctx.locale)), blocks };
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: loaderData?.title ?? "" }];

export default function Page({ loaderData }: Route.ComponentProps) {
  const { title, html, blocks } = loaderData;
  if (blocks) {
    // a page that starts with a hero carries its own heading
    const ownHeading = blocks[0]?.type === "hero";
    return (
      <>
        {!ownHeading && <h1 className="text-h1 container-page pt-8 md:pt-20">{title}</h1>}
        <Blocks blocks={blocks} />
      </>
    );
  }
  return (
    <article className="container-page max-w-3xl section-y">
      <h1 className="text-h1 mb-10">{title}</h1>
      <div className="prose-shop" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
