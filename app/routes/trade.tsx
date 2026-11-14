import { Img } from "~/components/media";
import { eq } from "drizzle-orm";
import { data, Form, useNavigation } from "react-router";
import { ArrowRight, Check } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/trade";
import { shopContext } from "~/.server/context";
import { findUserByEmail, hashPassword, login } from "~/.server/auth";
import { getDb, schema } from "~/.server/db";
import { emit } from "~/.server/events";
import { getSetting } from "~/.server/settings";
import { resolveBlocks } from "~/.server/blocks";
import { Blocks } from "~/components/blocks";
import { tl } from "~/lib/localized";
import { useI18n } from "~/lib/i18n";
import { useRootData } from "~/lib/root-data";
import { Button, ButtonLink, Card, Eyebrow, Field, Input, Lines, Notice, Textarea } from "~/components/ui";

export async function loader({ context }: Route.LoaderArgs) {
  if (!context.get(shopContext).shop.modules.trade) throw new Response("Not found", { status: 404 });
  const trade = await getSetting("trade", context.get(shopContext).storefront?.slug);
  return { trade, blocks: await resolveBlocks(context.get(shopContext), trade.blocks) };
}

const applySchema = z.object({
  business: z.string().trim().min(2).max(160),
  contact: z.string().trim().min(2).max(120),
  email: z.email(),
  phone: z.string().trim().max(40).optional().default(""),
  uid: z.string().trim().max(30).optional().default(""),
  message: z.string().max(2000).optional().default(""),
  password: z.string().max(200).optional().default(""),
});

export async function action({ request, context }: Route.ActionArgs) {
  const ctx = context.get(shopContext);
  const parsed = applySchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return data({ ok: false, errors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), ctx.t("form.invalid")])) }, { status: 400 });
  const f = parsed.data;
  if (ctx.shop.trade.requireUid && f.uid && !/^CHE[-\s]?\d{3}\.?\d{3}\.?\d{3}/i.test(f.uid)) return data({ ok: false, errors: { uid: ctx.t("form.uidHint") } }, { status: 400 });

  const db = await getDb();
  const group = await db.query.customerGroups.findFirst({ where: eq(schema.customerGroups.code, ctx.shop.trade.defaultGroup) });
  await db.insert(schema.inquiries).values({ kind: "trade", email: f.email.toLowerCase(), data: { business: f.business, contact: f.contact, phone: f.phone, uid: f.uid, message: f.message } });

  // Logged-in user → mark as pending trade customer; new visitor with password → create pending account.
  let userId = ctx.user?.id ?? null;
  if (ctx.user) {
    await db.update(schema.users).set({ company: f.business, uidNumber: f.uid || null, phone: f.phone || null, groupId: group?.id, tradeStatus: "pending" }).where(eq(schema.users.id, ctx.user.id));
  } else if (f.password.length >= 10 && !(await findUserByEmail(f.email, ctx.storefront?.id ?? null))) {
    const [u] = await db.insert(schema.users).values({
      email: f.email.toLowerCase(), name: f.contact, company: f.business, uidNumber: f.uid || null, phone: f.phone || null,
      passwordHash: await hashPassword(f.password), groupId: group?.id, tradeStatus: "pending", locale: ctx.locale, storefrontId: ctx.storefront?.id ?? null,
    }).returning();
    userId = u.id;
  }
  await emit("trade.applied", { userId, email: f.email });
  if (userId && !ctx.user) return login(request, userId, "/account");
  return data({ ok: true, errors: {} as Record<string, string> });
}

export default function Trade({ loaderData, actionData }: Route.ComponentProps) {
  const { trade } = loaderData;
  const { t, locale } = useI18n();
  const { user } = useRootData();
  const L = (v: Parameters<typeof tl>[0]) => tl(v, locale);
  const busy = useNavigation().state === "submitting";
  const errors = (actionData?.errors ?? {}) as Record<string, string>;

  return (
    <>
      <section className="border-b border-border">
        <div className={`container-page grid items-center gap-12 section-y ${trade.imageUrl ? "lg:grid-cols-[1.15fr_1fr]" : ""}`}>
          <div className="grid gap-8">
            <Eyebrow>{L(trade.eyebrow)}</Eyebrow>
            <h1 className="text-display max-w-4xl"><Lines text={L(trade.title)} /></h1>
            <p className="text-lead max-w-2xl text-muted-fg">{L(trade.text)}</p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink to="#apply" size="lg">{t("trade.apply")} <ArrowRight size={16} /></ButtonLink>
              <ButtonLink to="/shop" size="lg" variant="secondary">{t("cart.toShop")}</ButtonLink>
            </div>
          </div>
          {trade.imageUrl && <Img src={trade.imageUrl} sizes="(min-width: 1024px) 45vw, 100vw" alt="" className="aspect-[4/3] w-full rounded-surface object-cover shadow-card" />}
        </div>
      </section>

      {trade.services.length > 0 && (
        <section className="container-page section-y">
          <h2 className="text-h1 mb-14">{L(trade.servicesTitle)}</h2>
          <div className="grid gap-px overflow-hidden rounded-surface border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {trade.services.map((s, i) => (
              <div key={i} className="grid content-start gap-3 bg-surface p-8">
                <span className="font-display text-sm text-primary tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="text-h3">{L(s.title)}</h3>
                <p className="text-sm leading-relaxed text-muted-fg">{L(s.text)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {trade.steps.length > 0 && (
        <section className="bg-inverse py-20 text-on-inverse md:py-28">
          <div className="container-page">
            <h2 className="text-h1 mb-14">{L(trade.stepsTitle)}</h2>
            <ol className="grid gap-10 md:grid-cols-3">
              {trade.steps.map((s, i) => (
                <li key={i} className="grid content-start gap-3 border-t border-on-inverse/25 pt-6">
                  <span className="font-display text-5xl leading-none text-on-inverse/40">{i + 1}</span>
                  <h3 className="text-h3">{L(s.title)}</h3>
                  <p className="text-sm leading-relaxed text-on-inverse/75">{L(s.text)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      <section id="apply" className="container-page grid scroll-mt-24 gap-12 section-y lg:grid-cols-[1fr_1.2fr]">
        <div className="grid content-start gap-5">
          <Eyebrow>— {t("trade.apply")}</Eyebrow>
          <h2 className="text-h1">{L(trade.formTitle)}</h2>
          <p className="text-lead text-muted-fg">{L(trade.formText)}</p>
          <ul className="mt-4 grid gap-3">
            {trade.promises.map((p, i) => <li key={i} className="flex items-center gap-3 text-sm"><Check size={16} className="text-primary" /> {L(p)}</li>)}
          </ul>
        </div>
        <Card className="p-6 md:p-10">
          {actionData?.ok ? (
            <Notice tone="success">{t("trade.applied")}</Notice>
          ) : (
            <Form method="post" className="grid gap-5 sm:grid-cols-2">
              {Object.keys(errors).length > 0 && <Notice tone="danger" className="sm:col-span-2">{t("checkout.errors")}</Notice>}
              <Field label={t("trade.business")} required error={errors.business} className="sm:col-span-2">{(id) => <Input id={id} name="business" required defaultValue={user?.company ?? ""} autoComplete="organization" />}</Field>
              <Field label={t("trade.contactPerson")} required error={errors.contact}>{(id) => <Input id={id} name="contact" required defaultValue={user?.name ?? ""} autoComplete="name" />}</Field>
              <Field label={t("form.phone")} error={errors.phone}>{(id) => <Input id={id} name="phone" type="tel" autoComplete="tel" />}</Field>
              <Field label={t("form.email")} required error={errors.email}>{(id) => <Input id={id} name="email" type="email" required defaultValue={user?.email ?? ""} autoComplete="email" />}</Field>
              <Field label={t("form.uid")} hint={t("form.uidHint")} error={errors.uid}>{(id) => <Input id={id} name="uid" placeholder="CHE-123.456.789" />}</Field>
              {!user && <Field label={`${t("form.password")} (${t("common.optional")})`} hint={t("form.passwordHint")} className="sm:col-span-2">{(id) => <Input id={id} name="password" type="password" minLength={10} autoComplete="new-password" />}</Field>}
              <Field label={t("form.message")} className="sm:col-span-2">{(id) => <Textarea id={id} name="message" rows={4} />}</Field>
              <Button type="submit" size="lg" className="sm:col-span-2" disabled={busy}>{t("common.sendRequest")} <ArrowRight size={16} /></Button>
            </Form>
          )}
        </Card>
      </section>
      <Blocks blocks={loaderData.blocks} />
    </>
  );
}
