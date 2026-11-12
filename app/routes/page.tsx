import { eq } from "drizzle-orm";
import { data } from "react-router";
import type { Route } from "./+types/page";
import { shopContext } from "~/.server/context";
import { getDb, schema } from "~/.server/db";
import { tl } from "~/lib/localized";
import { renderMarkdown } from "~/lib/markdown";

export async function loader({ params, context }: Route.LoaderArgs) {
  const ctx = context.get(shopContext);
  const db = await getDb();
  const page = await db.query.pages.findFirst({ where: eq(schema.pages.slug, params.slug) });
  if (!page) throw data("Not found", { status: 404 });
  return { title: tl(page.title, ctx.locale), html: renderMarkdown(tl(page.body, ctx.locale)) };
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: loaderData?.title ?? "" }];

export default function Page({ loaderData }: Route.ComponentProps) {
  return (
    <article className="container-page max-w-3xl py-20 md:py-28">
      <h1 className="text-h1 mb-10">{loaderData.title}</h1>
      <div className="prose-shop" dangerouslySetInnerHTML={{ __html: loaderData.html }} />
    </article>
  );
}
