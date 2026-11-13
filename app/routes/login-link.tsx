import { data, Form, Link, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/login-link";
import { shopContext } from "~/.server/context";
import { homeAfterLogin, login, safeRedirect } from "~/.server/auth";
import { consumeLoginToken, peekLoginToken } from "~/.server/magic-link";
import { metaT, useI18n } from "~/lib/i18n";
import { Button, Card, Eyebrow, Notice } from "~/components/ui";

/** customers sign in only in their own shop (main shop or storefront) */
const sameShop = (user: { storefrontId: number | null }, storefrontId: number | null) => (user.storefrontId ?? null) === storefrontId;

export async function loader({ params, context }: Route.LoaderArgs) {
  const ctx = context.get(shopContext);
  // GET only shows the confirmation: link scanners in mail systems open links and must not use them up
  const user = await peekLoginToken(params.token);
  const ok = !!user && sameShop(user, ctx.storefront?.id ?? null);
  return { valid: ok, email: ok ? user.email : "" };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const ctx = context.get(shopContext);
  const peek = await peekLoginToken(params.token);
  if (!peek || !sameShop(peek, ctx.storefront?.id ?? null)) return data({ error: ctx.t("auth.magicInvalid") }, { status: 400 });
  const user = await consumeLoginToken(params.token);
  if (!user) return data({ error: ctx.t("auth.magicInvalid") }, { status: 400 });
  const next = new URL(request.url).searchParams.get("next");
  return login(request, user.id, safeRedirect(next, homeAfterLogin(user, ctx.channel)));
}

export const meta: Route.MetaFunction = ({ matches }) => [{ title: metaT(matches)("auth.magicTitle") }, { name: "robots", content: "noindex" }, { name: "referrer", content: "no-referrer" }];

export default function LoginLink({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const busy = useNavigation().state === "submitting";
  const failed = !loaderData.valid || !!actionData?.error;
  return (
    <div className="container-page grid justify-items-center section-y">
      <Card className="grid w-full max-w-md gap-6 p-6 sm:p-8">
        <div className="grid gap-3">
          <Eyebrow line>{t("auth.login")}</Eyebrow>
          <h1 className="text-h2">{t("auth.magicTitle")}</h1>
          {!failed && <p className="text-muted-fg [overflow-wrap:anywhere]">{t("auth.magicConfirm", { email: loaderData.email })}</p>}
        </div>
        {failed ? (
          <>
            <Notice tone="danger">{actionData?.error ?? t("auth.magicInvalid")}</Notice>
            <Link to="/login" className="text-sm underline underline-offset-4">{t("auth.magicSend")}</Link>
          </>
        ) : (
          <Form method="post" action={`?${params.toString()}`}>
            <Button type="submit" size="lg" className="w-full" disabled={busy} autoFocus>{t("auth.magicButton")}</Button>
          </Form>
        )}
      </Card>
    </div>
  );
}
