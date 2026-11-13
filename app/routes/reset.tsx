import { data, Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/reset";
import { shopContext } from "~/.server/context";
import { commit, getSession, hashPassword } from "~/.server/auth";
import { consumeToken, userForToken } from "~/.server/password-reset";
import { metaT, useI18n } from "~/lib/i18n";
import { Button, Card, Eyebrow, Field, Input, Notice } from "~/components/ui";

export async function loader({ params }: Route.LoaderArgs) {
  const user = await userForToken(params.token);
  return { valid: !!user, email: user?.email ?? "" };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const ctx = context.get(shopContext);
  const user = await userForToken(params.token);
  if (!user) return data({ error: ctx.t("auth.resetInvalid") }, { status: 400 });
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  if (password.length < 10) return data({ error: ctx.t("auth.passwordShort") }, { status: 400 });
  if (password !== String(form.get("confirm") ?? "")) return data({ error: ctx.t("auth.passwordMismatch") }, { status: 400 });
  await consumeToken(user.id, await hashPassword(password));
  const session = await getSession(request);
  session.flash("toast", { kind: "success", text: ctx.t("auth.resetDone") });
  return redirect(user.tradeStatus === "approved" && ctx.channel.portalEnabled ? "/portal/login" : "/login", { headers: { "Set-Cookie": await commit(session) } });
}

export const meta: Route.MetaFunction = ({ matches }) => [{ title: metaT(matches)("auth.setPassword") }, { name: "robots", content: "noindex" }];

export default function Reset({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useI18n();
  const busy = useNavigation().state === "submitting";
  return (
    <div className="container-page grid justify-items-center section-y">
      <Card className="grid w-full max-w-md gap-6 p-6 sm:p-8">
        <div className="grid gap-3">
          <Eyebrow line>{t("auth.login")}</Eyebrow>
          <h1 className="text-h2">{t("auth.setPassword")}</h1>
          {loaderData.valid && <p className="text-muted-fg">{loaderData.email}</p>}
        </div>
        {!loaderData.valid ? (
          <>
            <Notice tone="danger">{t("auth.resetInvalid")}</Notice>
            <Link to="/login/forgot" className="text-sm underline underline-offset-4">{t("auth.forgot")}</Link>
          </>
        ) : (
          <Form method="post" className="grid gap-5">
            {actionData?.error && <Notice tone="danger">{actionData.error}</Notice>}
            <Field label={t("auth.newPassword")} hint={t("auth.passwordHint")}>{(id) => <Input id={id} name="password" type="password" autoComplete="new-password" minLength={10} required autoFocus />}</Field>
            <Field label={t("auth.confirmPassword")}>{(id) => <Input id={id} name="confirm" type="password" autoComplete="new-password" minLength={10} required />}</Field>
            <Button type="submit" size="lg" disabled={busy}>{t("auth.setPassword")}</Button>
          </Form>
        )}
      </Card>
    </div>
  );
}
