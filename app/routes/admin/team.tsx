import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { data, Form, useActionData, useNavigation } from "react-router";
import { MailPlus, Trash2 } from "lucide-react";
import type { Route } from "./+types/team";
import { getDb, schema } from "~/.server/db";
import { findUserByEmail, hashPassword, requireStaff } from "~/.server/auth";
import { sendTokenMail } from "~/.server/password-reset";
import { ROLE_LABELS } from "~/lib/roles";
import { Badge, Button, Field, Input, Notice, Select } from "~/components/ui";
import { DataTable, PageHeader, Panel } from "~/components/admin";

/** Admin › Mitarbeitende: staff accounts with roles (lib/roles.ts). Admins only (enforced by the admin middleware). */
const u = schema.users;

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireStaff(request);
  const db = await getDb();
  const team = await db.select({ id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt, invited: sql<boolean>`${u.resetToken} is not null` })
    .from(u).where(inArray(u.role, ["admin", "staff"])).orderBy(asc(u.role), asc(u.email));
  return { team, me: me.id };
}

export async function action({ request }: Route.ActionArgs) {
  const me = await requireStaff(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const db = await getDb();
  const origin = new URL(request.url).origin;
  const admins = async () => (await db.select({ n: sql<number>`count(*)::int` }).from(u).where(eq(u.role, "admin")))[0].n;

  if (intent === "invite") {
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const name = String(form.get("name") ?? "").trim().slice(0, 80);
    const role = form.get("role") === "admin" ? "admin" : "staff";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return data({ error: "Bitte eine gültige E-Mail-Adresse eingeben." }, { status: 400 });
    const existing = await findUserByEmail(email, null);
    if (existing && existing.role !== "customer") return data({ error: "Diese Person hat bereits einen Admin-Zugang." }, { status: 409 });
    if (existing) return data({ error: "Diese Adresse gehört zu einem Kundenkonto — bitte eine andere (z. B. geschäftliche) Adresse verwenden." }, { status: 409 });
    // unusable random password until the invitation link is used
    const [user] = await db.insert(u).values({ email, name, role, passwordHash: await hashPassword(randomBytes(24).toString("base64url")), storefrontId: null }).returning();
    await sendTokenMail(user.id, "invite", origin);
    return { ok: `Einladung an ${email} gesendet (${ROLE_LABELS[role]}). Der Link ist 14 Tage gültig.` };
  }

  const id = Number(form.get("id"));
  const target = await db.query.users.findFirst({ where: and(eq(u.id, id), inArray(u.role, ["admin", "staff"])) });
  if (!target) return data({ error: "Unbekannter Zugang." }, { status: 404 });
  if (intent === "resend") {
    await sendTokenMail(target.id, "invite", origin);
    return { ok: `Einladung erneut an ${target.email} gesendet.` };
  }
  if (target.id === me.id) return data({ error: "Den eigenen Zugang können Sie hier nicht ändern." }, { status: 400 });
  if (intent === "role") {
    const role = form.get("role") === "admin" ? "admin" : "staff";
    if (target.role === "admin" && role !== "admin" && (await admins()) <= 1) return data({ error: "Mindestens ein Administrator muss bleiben." }, { status: 400 });
    await db.update(u).set({ role, updatedAt: new Date() }).where(eq(u.id, target.id));
    return { ok: `${target.email} ist jetzt ${ROLE_LABELS[role]}.` };
  }
  if (intent === "remove") {
    if (target.role === "admin" && (await admins()) <= 1) return data({ error: "Mindestens ein Administrator muss bleiben." }, { status: 400 });
    // orders/log keep their history; the account becomes unusable and disappears from the team
    try {
      await db.delete(u).where(and(eq(u.id, target.id), isNull(u.storefrontId)));
    } catch {
      return data({ error: `${target.email} hat Bestellungen ausgelöst und kann nicht gelöscht werden — Rolle auf «Mitarbeiter» setzen oder das Passwort zurücksetzen lassen.` }, { status: 409 });
    }
    return { ok: `Zugang von ${target.email} entfernt.` };
  }
  return data({ error: "Unbekannte Aktion." }, { status: 400 });
}

export const meta: Route.MetaFunction = () => [{ title: "Mitarbeitende · Admin" }];

export default function Team({ loaderData }: Route.ComponentProps) {
  const { team, me } = loaderData;
  const result = useActionData<typeof action>();
  const busy = useNavigation().state === "submitting";
  return (
    <>
      <PageHeader title="Mitarbeitende" subtitle="Zugänge zum Admin. Administratoren dürfen alles; Mitarbeiter bearbeiten Bestellungen, Produkte, Produzenten, Kunden, Konditionen und Inhalte — ohne Einstellungen, Design, Storefronts, vinX, System und Mitarbeitende." />
      {result && "ok" in result && <Notice tone="success" className="mb-5">{result.ok}</Notice>}
      {result && "error" in result && <Notice tone="danger" className="mb-5">{result.error}</Notice>}
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <DataTable empty={!team.length} head={["Name", "E-Mail", "Rolle", ""]}>
          {team.map((m) => (
            <tr key={m.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3">{m.name || "—"} {m.id === me && <Badge>Sie</Badge>}</td>
              <td className="px-4 py-3 [overflow-wrap:anywhere]">{m.email} {m.invited && <Badge tone="warning">Einladung offen</Badge>}</td>
              <td className="px-4 py-3">
                {m.id === me ? ROLE_LABELS[m.role] : (
                  <Form method="post" className="flex items-center gap-2">
                    <input type="hidden" name="intent" value="role" /><input type="hidden" name="id" value={m.id} />
                    <Select name="role" defaultValue={m.role} size="sm" aria-label={`Rolle von ${m.email}`} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                      <option value="staff">{ROLE_LABELS.staff}</option><option value="admin">{ROLE_LABELS.admin}</option>
                    </Select>
                  </Form>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                {m.id !== me && (
                  <div className="flex justify-end gap-1">
                    {m.invited && (
                      <Form method="post"><input type="hidden" name="intent" value="resend" /><input type="hidden" name="id" value={m.id} />
                        <Button type="submit" size="sm" variant="ghost" title="Einladung erneut senden" aria-label={`Einladung an ${m.email} erneut senden`}><MailPlus size={14} /></Button></Form>
                    )}
                    <Form method="post" onSubmit={(e) => { if (!confirm(`Zugang von ${m.email} entfernen?`)) e.preventDefault(); }}>
                      <input type="hidden" name="intent" value="remove" /><input type="hidden" name="id" value={m.id} />
                      <Button type="submit" size="sm" variant="ghost" title="Entfernen" aria-label={`Zugang von ${m.email} entfernen`}><Trash2 size={14} /></Button>
                    </Form>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
        <Panel title="Person einladen" description="Sie erhält eine E-Mail mit einem Link, um ihr Passwort zu setzen (14 Tage gültig).">
          <Form method="post" className="grid gap-4">
            <input type="hidden" name="intent" value="invite" />
            <Field label="Name">{(id) => <Input id={id} name="name" autoComplete="off" />}</Field>
            <Field label="E-Mail">{(id) => <Input id={id} name="email" type="email" required autoComplete="off" />}</Field>
            <Field label="Rolle">{(id) => <Select id={id} name="role" defaultValue="staff"><option value="staff">{ROLE_LABELS.staff}</option><option value="admin">{ROLE_LABELS.admin}</option></Select>}</Field>
            <Button type="submit" disabled={busy}>Einladen</Button>
          </Form>
        </Panel>
      </div>
    </>
  );
}
