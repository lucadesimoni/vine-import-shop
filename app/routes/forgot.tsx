import { data, Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/forgot";
import { shopContext } from "~/.server/context";
import { findUserByEmail, throttle, registerFailure } from "~/.server/auth";
import { sendTokenMail } from "~/.server/password-reset";
import { metaT, useI18n } from "~/lib/i18n";
import { Button, Card, Eyebrow, Field, Input, Notice } from "~/components/ui";

export async function action({ request, context }: Route.ActionArgs) {
  const ctx = context.get(shopContext);
  const email = String((await request.formData()).get("email") ?? "").trim().toLowerCase();
  const key = `reset|${request.headers.get("X-Forwarded-For") ?? "local"}`;
  if (throttle(key)) return data({ error: ctx.t("auth.throttled") }, { status: 429 });
  registerFailure(key); // counts requests per client to limit mail flooding
  const user = email ? await findUserByEmail(email) : null;
  if (user) await sendTokenMail(user.id, "reset", new URL(request.url).origin);
  return { sent: true }; // same answer whether or not the address exists
}

export const meta: Route.MetaFunction = ({ matches }) => [{ title: metaT(matches)("auth.forgot") }, { name: "robots", content: "noindex" }];

export default function Forgot({ actionData }: Route.ComponentProps) {
  const { t } = useI18n();
  const busy = useNavigation().state === "submitting";
  return (
    <div className="container-page grid justify-items-center section-y">
      <Card className="grid w-full max-w-md gap-6 p-6 sm:p-8">
        <div className="grid gap-3">
          <Eyebrow line>{t("auth.login")}</Eyebrow>
          <h1 className="text-h2">{t("auth.forgot")}</h1>
          <p className="text-muted-fg">{t("auth.forgotText")}</p>
        </div>
        {actionData && "error" in actionData && <Notice tone="danger">{actionData.error}</Notice>}
        {actionData && "sent" in actionData ? (
          <Notice tone="success">{t("auth.resetSent")}</Notice>
        ) : (
          <Form method="post" className="grid gap-5">
            <Field label={t("form.email")}>{(id) => <Input id={id} name="email" type="email" autoComplete="email" required autoFocus />}</Field>
            <Button type="submit" size="lg" disabled={busy}>{t("auth.sendLink")}</Button>
          </Form>
        )}
        <Link to="/login" className="text-sm text-muted-fg underline underline-offset-4 hover:text-fg">{t("common.back")}</Link>
      </Card>
    </div>
  );
}
