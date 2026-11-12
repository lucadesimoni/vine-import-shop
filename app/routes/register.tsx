import { data, Form, Link, redirect, useNavigation } from "react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/register";
import { shopContext } from "~/.server/context";
import { findUserByEmail, hashPassword, login } from "~/.server/auth";
import { getDb, schema } from "~/.server/db";
import { emit } from "~/.server/events";
import { useI18n } from "~/lib/i18n";
import { Button, Card, Checkbox, Eyebrow, Field, Input, Notice } from "~/components/ui";

export async function loader({ context }: Route.LoaderArgs) {
  if (context.get(shopContext).user) throw redirect("/account");
  return null;
}

const schemaIn = z.object({ name: z.string().trim().min(2).max(120), email: z.email(), password: z.string().min(10).max(200), terms: z.literal("on") });

export async function action({ request, context }: Route.ActionArgs) {
  const ctx = context.get(shopContext);
  const parsed = schemaIn.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return data({ errors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), ctx.t(i.path[0] === "password" ? "form.passwordHint" : "form.invalid")])) }, { status: 400 });
  const { name, email, password } = parsed.data;
  if (await findUserByEmail(email)) return data({ errors: { email: ctx.t("auth.emailTaken") } }, { status: 409 });
  const db = await getDb();
  const consumer = await db.query.customerGroups.findFirst({ where: eq(schema.customerGroups.code, "consumer") });
  const [user] = await db.insert(schema.users).values({ email: email.toLowerCase(), name, passwordHash: await hashPassword(password), groupId: consumer?.id, locale: ctx.locale }).returning();
  await emit("customer.registered", { userId: user.id });
  return login(request, user.id, "/account");
}

export default function Register({ actionData }: Route.ComponentProps) {
  const { t } = useI18n();
  const errors = (actionData?.errors ?? {}) as Record<string, string>;
  const busy = useNavigation().state === "submitting";
  return (
    <div className="container-page grid justify-items-center py-16 md:py-24">
      <Card className="grid w-full max-w-lg gap-8 p-8 md:p-10">
        <div className="grid gap-3">
          <Eyebrow line>{t("auth.register")}</Eyebrow>
          <h1 className="text-h1">{t("auth.register")}</h1>
        </div>
        {Object.keys(errors).length > 0 && <Notice tone="danger">{t("checkout.errors")}</Notice>}
        <Form method="post" className="grid gap-5">
          <Field label={t("form.firstLastName")} required error={errors.name}>{(id) => <Input id={id} name="name" autoComplete="name" required />}</Field>
          <Field label={t("form.email")} required error={errors.email}>{(id) => <Input id={id} name="email" type="email" autoComplete="email" required />}</Field>
          <Field label={t("form.password")} required error={errors.password} hint={t("form.passwordHint")}>{(id) => <Input id={id} name="password" type="password" minLength={10} autoComplete="new-password" required />}</Field>
          <Checkbox name="terms" label={t("checkout.terms")} required />
          <Button type="submit" size="lg" disabled={busy}>{t("auth.register")}</Button>
        </Form>
        <p className="text-sm text-muted-fg"><Link to="/login" className="text-fg underline underline-offset-4">{t("auth.login")}</Link></p>
      </Card>
    </div>
  );
}
