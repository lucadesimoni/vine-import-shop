import { eq } from "drizzle-orm";
import { data, Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/password";
import { hashPassword, requireStaff, verifyPassword } from "~/.server/auth";
import { getDb, schema } from "~/.server/db";
import { Button, Field, Input, Notice } from "~/components/ui";
import { PageHeader, Panel } from "~/components/admin";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireStaff(request);
  return { forced: new URL(request.url).searchParams.has("required"), email: user.email };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireStaff(request);
  const form = await request.formData();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const db = await getDb();
  const row = await db.query.users.findFirst({ where: eq(schema.users.id, user.id) });
  if (!row || !(await verifyPassword(current, row.passwordHash))) return data({ error: "Aktuelles Passwort ist falsch." }, { status: 400 });
  if (next.length < 12) return data({ error: "Mindestens 12 Zeichen." }, { status: 400 });
  if (next === current || next === "admin-demo-1234") return data({ error: "Bitte ein neues, eigenes Passwort wählen." }, { status: 400 });
  await db.update(schema.users).set({ passwordHash: await hashPassword(next) }).where(eq(schema.users.id, user.id));
  throw redirect("/admin/system");
}

export default function Password({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state === "submitting";
  return (
    <>
      <PageHeader title="Passwort ändern" subtitle={loaderData.email} />
      {loaderData.forced && <Notice tone="warning" className="mb-6">Das Standardpasswort ist noch aktiv. Bitte jetzt ein eigenes Passwort setzen, bevor der Shop live geht.</Notice>}
      <Panel className="max-w-lg">
        {actionData?.error && <Notice tone="danger" className="mb-4">{actionData.error}</Notice>}
        <Form method="post" className="grid gap-4">
          <Field label="Aktuelles Passwort">{(id) => <Input id={id} name="current" type="password" autoComplete="current-password" required />}</Field>
          <Field label="Neues Passwort" hint="Mindestens 12 Zeichen">{(id) => <Input id={id} name="next" type="password" autoComplete="new-password" minLength={12} required />}</Field>
          <Button type="submit" className="w-fit" disabled={busy}>Speichern</Button>
        </Form>
      </Panel>
    </>
  );
}
