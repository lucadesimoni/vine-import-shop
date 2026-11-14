import { data, Form, Link, redirect, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/login";
import { shopContext } from "~/.server/context";
import { clearAttempts, clientIp, countAttempt, findUserByEmail, homeAfterLogin, login, requestLimited, safeRedirect, verifyPassword } from "~/.server/auth";
import { sendLoginLink } from "~/.server/magic-link";
import { useI18n, metaT } from "~/lib/i18n";
import { usePath } from "~/lib/channel";
import { Logo } from "~/components/shop";
import { Mail } from "lucide-react";
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
  if (form.get("intent") === "link") {
    // sign-in link for registered customers; same answer whether or not the address exists
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) return data({ error: ctx.t("auth.emailRequired") }, { status: 400 });
    // per client and per address: limits mail flooding of one inbox from many clients
    const lk: [string, number][] = [[`link|${clientIp(request)}`, 8], [`link-email|${email}`, 5]];
    if (await requestLimited(lk)) return data({ error: ctx.t("auth.throttled") }, { status: 429 });
    await countAttempt(lk, 60 * 60_000);
    const user = await findUserByEmail(email, ctx.storefront?.id ?? null);
    if (user?.role === "customer" && (user.storefrontId ?? null) === (ctx.storefront?.id ?? null)) await sendLoginLink(user, new URL(request.url).origin, String(form.get("next") ?? ""));
    return { linkSent: true as const };
  }
  // failed sign-ins per client+address, per client (password spraying) and per address (attack from many clients)
  const ip = clientIp(request);
  const keys: [string, number][] = [[`login|${ip}|${email}`, 8], [`login-ip|${ip}`, 40], [`login-email|${email}`, 30]];
  if (await requestLimited(keys)) return data({ error: ctx.t("auth.throttled") }, { status: 429 });
  const user = await findUserByEmail(email, ctx.storefront?.id ?? null);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    await countAttempt(keys);
    return data({ error: ctx.t("auth.failed") }, { status: 401 });
  }
  await clearAttempts(keys[0][0]);
  if (user.role !== "customer") {
    const { audit } = await import("~/.server/audit");
    await audit(user, { action: "user.login", entity: "user", entityId: user.id, summary: `Anmeldung im Admin (${clientIp(request)})` });
  }
  return login(request, user.id, safeRedirect(form.get("next"), homeAfterLogin(user, ctx.channel)));
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
        {actionData && "error" in actionData && <Notice tone="danger">{actionData.error}</Notice>}
        {actionData && "linkSent" in actionData && <Notice tone="success">{t("auth.magicSent")}</Notice>}
        <Form method="post" className="grid gap-5">
          <input type="hidden" name="next" value={params.get("next") ?? ""} />
          <Field label={t("form.email")}>{(id) => <Input id={id} name="email" type="email" autoComplete="email" required autoFocus />}</Field>
          <Field label={t("form.password")}>{(id) => <Input id={id} name="password" type="password" autoComplete="current-password" required />}</Field>
          <Link to="/login/forgot" className="-mt-2 w-fit text-note text-muted-fg underline-offset-4 hover:text-fg hover:underline">{t("auth.forgot")}</Link>
          <Button type="submit" size="lg" disabled={busy}>{t("auth.login")}</Button>
          <div className="flex items-center gap-3 text-note text-muted-fg" aria-hidden><span className="h-px flex-1 bg-border" />{t("auth.or")}<span className="h-px flex-1 bg-border" /></div>
          <div className="grid gap-2">
            <Button type="submit" name="intent" value="link" variant="secondary" size="lg" formNoValidate disabled={busy}><Mail size={16} /> {t("auth.magicSend")}</Button>
            <p className="text-note text-muted-fg">{t("auth.magicHint")}</p>
          </div>
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
