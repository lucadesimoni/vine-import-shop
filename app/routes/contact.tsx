import { data, Form, useNavigation } from "react-router";
import { Mail, MapPin, Phone } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/contact";
import { shopContext } from "~/.server/context";
import { getDb, schema } from "~/.server/db";
import { esc, layout, sendMail } from "~/.server/mail";
import { tl } from "~/lib/localized";
import { useI18n } from "~/lib/i18n";
import { useRootData } from "~/lib/root-data";
import { Button, Card, Eyebrow, Field, Input, Notice, Textarea } from "~/components/ui";

const contactSchema = z.object({ name: z.string().trim().min(2).max(120), email: z.email(), subject: z.string().max(160).optional().default(""), message: z.string().trim().min(5).max(5000), website: z.string().max(0).optional() });

export async function action({ request, context }: Route.ActionArgs) {
  const ctx = context.get(shopContext);
  const parsed = contactSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return data({ ok: false }, { status: 400 });
  const f = parsed.data;
  const db = await getDb();
  await db.insert(schema.inquiries).values({ kind: "contact", email: f.email, data: { name: f.name, subject: f.subject, message: f.message } });
  const to = ctx.shop.notifyEmail || ctx.brand.contact.email;
  if (to) await sendMail(to, `[Kontakt] ${f.subject || f.name}`, layout(ctx.brand, f.subject || "Kontakt", `<p><b>${esc(f.name)}</b> &lt;${esc(f.email)}&gt;</p><p>${esc(f.message).replace(/\n/g, "<br>")}</p>`), f.email);
  return data({ ok: true });
}

export default function Contact({ actionData }: Route.ComponentProps) {
  const { t, locale } = useI18n();
  const { brand } = useRootData();
  const c = brand.contact;
  const busy = useNavigation().state === "submitting";
  return (
    <div className="container-page grid gap-12 py-20 md:py-28 lg:grid-cols-[1.2fr_1fr]">
      <div className="grid content-start gap-8">
        <div className="grid gap-4">
          <Eyebrow line>{brand.name}</Eyebrow>
          <h1 className="text-display">{t("contact.title")}</h1>
        </div>
        <Card className="p-6 md:p-10">
          {actionData?.ok ? (
            <Notice tone="success">{t("form.sent")}</Notice>
          ) : (
            <Form method="post" className="grid gap-5 sm:grid-cols-2">
              {actionData && !actionData.ok && <Notice tone="danger" className="sm:col-span-2">{t("checkout.errors")}</Notice>}
              <Field label={t("form.name")} required>{(id) => <Input id={id} name="name" required autoComplete="name" />}</Field>
              <Field label={t("form.email")} required>{(id) => <Input id={id} name="email" type="email" required autoComplete="email" />}</Field>
              <Field label={t("form.subject")} className="sm:col-span-2">{(id) => <Input id={id} name="subject" />}</Field>
              <Field label={t("form.message")} required className="sm:col-span-2">{(id) => <Textarea id={id} name="message" rows={6} required />}</Field>
              <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
              <Button type="submit" size="lg" className="sm:col-span-2 sm:w-fit" disabled={busy}>{t("form.send")}</Button>
            </Form>
          )}
        </Card>
      </div>
      <aside className="grid content-start gap-10 lg:pt-36">
        <div className="grid gap-3">
          <p className="text-eyebrow text-[11px] text-muted-fg">{t("contact.address")}</p>
          <p className="flex gap-3 leading-relaxed"><MapPin size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-primary" /><span>{brand.legalName || brand.name}<br />{c.street}<br />{c.zip} {c.city}, {c.country}</span></p>
        </div>
        <div className="grid gap-3">
          <p className="text-eyebrow text-[11px] text-muted-fg">{t("contact.direct")}</p>
          {c.phone && <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="flex items-center gap-3 hover:text-primary"><Phone size={18} strokeWidth={1.5} className="text-primary" /> {c.phone}</a>}
          {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-3 hover:text-primary"><Mail size={18} strokeWidth={1.5} className="text-primary" /> {c.email}</a>}
        </div>
        {c.hours.length > 0 && (
          <div className="grid gap-3">
            <p className="text-eyebrow text-[11px] text-muted-fg">{t("contact.hours")}</p>
            <dl className="grid gap-2">
              {c.hours.map((h, i) => <div key={i}><dt className="text-sm">{tl(h.label, locale)}</dt><dd className="text-sm text-muted-fg tabular-nums">{h.value}</dd></div>)}
            </dl>
          </div>
        )}
      </aside>
    </div>
  );
}
