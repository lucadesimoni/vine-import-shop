import { data, Form, Link, redirect, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/login";
import { shopContext } from "~/.server/context";
import { clearFailures, findUserByEmail, login, registerFailure, safeRedirect, throttle, verifyPassword } from "~/.server/auth";
import { useI18n, metaT } from "~/lib/i18n";
import { channelPath, usePath } from "~/lib/channel";
import { Logo } from "~/components/shop";
import { Button, ButtonLink, Card, Eyebrow, Field, Input, Notice } from "~/components/ui";

export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(shopContext);
  if (ctx.user) throw redirect(ctx.user.role === "customer" ? (ctx.channel.portal ? "/portal" : "/account") : "/admin");
  return { demo: (process.env.DEMO_DATA ?? "true") !== "false", demoAdmin: !process.env.ADMIN_EMAIL };
}

export async function action({ request, context }: Route.ActionArgs) {
  const ctx = context.get(shopContext);
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const key = `${request.headers.get("X-Forwarded-For") ?? "local"}|${email}`;
  if (throttle(key)) return data({ error: ctx.t("auth.throttled") }, { status: 429 });
  const user = await findUserByEmail(email, ctx.storefront?.id ?? null);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    registerFailure(key);
    return data({ error: ctx.t("auth.failed") }, { status: 401 });
  }
  clearFailures(key);
  const home = user.role !== "customer" ? "/admin" : ctx.channel.portal ? "/portal" : channelPath("/account", false);
  return login(request, user.id, safeRedirect(form.get("next"), home));
}

export const meta: Route.MetaFunction = ({ matches }) => [{ title: metaT(matches)("nav.login") }, { name: "robots", content: "noindex" }];

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const busy = useNavigation().state === "submitting";
  const to = usePath();
  const page = (
    <div className="container-page grid gap-10 section-y lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)] lg:gap-20">
      <Card className="grid gap-8 p-8 md:p-10">
        <div className="grid gap-3">
          <Eyebrow line>{to.portal ? t("portal.title") : t("auth.login")}</Eyebrow>
          <h1 className={to.portal ? "text-h2" : "text-h1"}>{to.portal ? t("portal.loginTitle") : t("auth.loginTitle")}</h1>
        </div>
        {actionData?.error && <Notice tone="danger">{actionData.error}</Notice>}
        <Form method="post" className="grid gap-5">
          <input type="hidden" name="next" value={params.get("next") ?? ""} />
          <Field label={t("form.email")}>{(id) => <Input id={id} name="email" type="email" autoComplete="email" required autoFocus />}</Field>
          <Field label={t("form.password")}>{(id) => <Input id={id} name="password" type="password" autoComplete="current-password" required />}</Field>
          <Link to="/login/forgot" className="-mt-2 w-fit text-note text-muted-fg underline-offset-4 hover:text-fg hover:underline">{t("auth.forgot")}</Link>
          <Button type="submit" size="lg" disabled={busy}>{t("auth.login")}</Button>
        </Form>
        {!to.portal && <p className="text-sm text-muted-fg">{t("auth.noAccount")} <Link to="/register" className="text-fg underline underline-offset-4">{t("auth.register")}</Link></p>}
      </Card>
      <div className="grid content-center gap-8">
        <div className="grid gap-4">
          <h2 className="text-h2">{t("auth.tradeTitle")}</h2>
          <p className="text-lead max-w-md text-muted-fg">{to.portal ? t("portal.loginText") : t("auth.tradeText")}</p>
          <ButtonLink to="/trade#apply" variant="secondary" className="w-fit">{t("trade.apply")}</ButtonLink>
        </div>
        {loaderData.demo && (
          <div className="grid gap-2 rounded-control border border-dashed border-border-strong p-5 text-sm">
            <p className="text-eyebrow text-2xs text-muted-fg">Demo</p>
            <code>gastro@demo.ch · gastro-demo-1234</code>
            {!to.portal && <code>kunde@demo.ch · kunde-demo-1234</code>}
            {!to.portal && loaderData.demoAdmin && <code>admin@example.com · admin-demo-1234</code>}
          </div>
        )}
      </div>
    </div>
  );
  if (!to.portal) return page;
  return (
    <div className="min-h-screen bg-bg">
      <div className="border-b border-border bg-surface"><div className="container-page flex h-20 items-center"><Logo to="/portal" sub={t("portal.title")} /></div></div>
      {page}
    </div>
  );
}
