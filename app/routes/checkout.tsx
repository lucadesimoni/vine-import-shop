import { data, Form, Link, redirect, useNavigation } from "react-router";
import { useState } from "react";
import { Lock } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/checkout";
import { shopContext } from "~/.server/context";
import { cartSummary, getCart, updateCart } from "~/.server/cart";
import { placeOrder } from "~/.server/orders";
import { availablePayments, getProvider } from "~/.server/payments";
import { useI18n, type MessageKey } from "~/lib/i18n";
import { tl } from "~/lib/localized";
import { formatMoney } from "~/lib/money";
import { useRootData } from "~/lib/root-data";
import { channelPath, usePath } from "~/lib/channel";
import { Button, Card, Checkbox, Eyebrow, Field, Input, Notice, RadioCard, Select, Textarea } from "~/components/ui";
import { Totals } from "~/components/totals";

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = context.get(shopContext);
  const url = new URL(request.url);
  if (!ctx.user && (!ctx.shop.guestCheckout || (!ctx.shop.consumerCheckout && !ctx.isTrade))) throw redirect(channelPath("/login?next=" + channelPath("/checkout", ctx.channel.portal), ctx.channel.portal));
  const cart = await getCart(request, ctx);
  const summary = await cartSummary(ctx, cart.items, cart.couponCode, url.searchParams.get("shipping"));
  if (!summary.lines.length) throw redirect(channelPath("/order-list", ctx.channel.portal));
  return {
    summary,
    payments: summary.isRequest ? [] : await availablePayments(ctx),
    billing: ctx.user?.billing ?? null,
    email: ctx.user?.email ?? "",
    company: ctx.user?.company ?? "",
    isTrade: ctx.isTrade,
    cancelled: url.searchParams.has("cancelled"),
    // vinX tour / delivery days of the customer → only those dates are offered
    deliveryDays: ctx.isTrade ? (ctx.user?.erpInfo?.deliveryDays ?? null) : null,
  };
}

const address = z.object({
  company: z.string().max(120).optional().default(""),
  name: z.string().trim().min(2).max(120),
  street: z.string().trim().min(3).max(160),
  zip: z.string().trim().min(4).max(10),
  city: z.string().trim().min(2).max(80),
  country: z.string().trim().length(2).default("CH"),
  phone: z.string().max(40).optional().default(""),
});

export async function action({ request, context }: Route.ActionArgs) {
  const ctx = context.get(shopContext);
  const form = Object.fromEntries(await request.formData()) as Record<string, string>;
  const pick = (p: string) => Object.fromEntries(Object.entries(form).filter(([k]) => k.startsWith(p)).map(([k, v]) => [k.slice(p.length), v]));
  const cart = await getCart(request, ctx);
  const summary = await cartSummary(ctx, cart.items, cart.couponCode, form.shipping);
  if (!summary.lines.length) throw redirect(channelPath("/order-list", ctx.channel.portal));

  const errors: Record<string, string> = {};
  const email = ctx.user?.email ?? form.email?.trim();
  if (!email || !z.email().safeParse(email).success) errors.email = ctx.t("form.invalid");
  const billing = address.safeParse(pick("billing."));
  if (!billing.success) for (const i of billing.error.issues) errors[`billing.${String(i.path[0])}`] = ctx.t("form.invalid");
  const shipDifferent = form.shipDifferent === "on";
  const shipping = shipDifferent ? address.safeParse(pick("shipping.")) : null;
  if (shipping && !shipping.success) for (const i of shipping.error.issues) errors[`shipping.${String(i.path[0])}`] = ctx.t("form.invalid");
  const payments = summary.isRequest ? ["request"] : await availablePayments(ctx);
  if (!payments.includes(form.payment)) errors.payment = ctx.t("common.required");
  if (form.terms !== "on") errors.terms = ctx.t("common.required");
  if (summary.ageRestricted && ctx.shop.ageGate && form.age !== "on") errors.age = ctx.t("common.required");
  if (summary.totals.belowMinimum) errors.form = ctx.t("cart.belowMinimum", { amount: formatMoney(summary.totals.minOrderCents, ctx.shop.currency, ctx.locale) });
  if (Object.keys(errors).length) return data({ errors }, { status: 400 });

  const order = await placeOrder(ctx, summary, {
    email: email!,
    billing: billing.data!,
    shipping: shipping?.data ?? null,
    paymentMethod: form.payment,
    notes: form.notes?.slice(0, 2000),
    poNumber: form.po?.slice(0, 80),
    deliveryDate: validDeliveryDate(form.deliveryDate, ctx.isTrade ? ctx.user?.erpInfo?.deliveryDays : null),
  });
  await updateCart(cart.id!, () => []);

  const origin = new URL(request.url).origin;
  const provider = getProvider(form.payment);
  const external = provider ? await provider.start(ctx, order, origin) : null;
  return external ?? redirect(channelPath(`/checkout/done/${order.number}?t=${order.token}`, ctx.channel.portal));
}

export const meta: Route.MetaFunction = () => [{ title: "Checkout" }, { name: "robots", content: "noindex" }];

export default function Checkout({ loaderData, actionData }: Route.ComponentProps) {
  const { summary, payments, billing, email, company, isTrade, cancelled, deliveryDays } = loaderData;
  const { t, locale } = useI18n();
  const { user, shop } = useRootData();
  const errors = (actionData?.errors ?? {}) as Record<string, string>;
  const [shipDifferent, setShipDifferent] = useState(false);
  const submitting = useNavigation().state === "submitting";
  const m = (c: number) => formatMoney(c, shop.currency, locale);
  const payLabel = (p: string) => `payment.${p}` as MessageKey;
  const payText = (p: string) => (p === "invoice" ? t("payment.invoiceText", { days: 30 }) : t(`payment.${p}Text` as MessageKey));

  return (
    <div className="container-page page-top">
      <header className="mb-10 grid gap-3">
        <Eyebrow line>{t("nav.orderList")} → {t("checkout.review")}</Eyebrow>
        <h1 className="text-h1">{summary.isRequest ? t("checkout.requestTitle") : t("checkout.title")}</h1>
      </header>
      <Form method="post" className="grid gap-12 lg:grid-cols-[1fr_400px] lg:items-start" noValidate>
        <div className="grid gap-10">
          {cancelled && <Notice tone="warning">{t("payment.failed")}</Notice>}
          {Object.keys(errors).length > 0 && <Notice tone="danger">{errors.form ?? t("checkout.errors")}</Notice>}

          <Section n={1} title={t("checkout.contact")}>
            {user ? (
              <p className="text-sm text-muted-fg">{t("checkout.loggedInAs", { email })}</p>
            ) : (
              <>
                <p className="text-sm text-muted-fg">{t("checkout.haveAccount")} <Link to={`/login?next=/checkout`} className="text-fg underline underline-offset-4">{t("nav.login")}</Link></p>
                <Field label={t("form.email")} required error={errors.email}>{(id) => <Input id={id} name="email" type="email" autoComplete="email" required aria-invalid={!!errors.email} />}</Field>
              </>
            )}
          </Section>

          <Section n={2} title={t("checkout.billing")}>
            <AddressFields prefix="billing" defaults={billing} errors={errors} isTrade={isTrade} company={company} />
            <Checkbox name="shipDifferent" label={t("checkout.shipDifferent")} checked={shipDifferent} onChange={(e) => setShipDifferent(e.currentTarget.checked)} />
            {shipDifferent && <AddressFields prefix="shipping" defaults={null} errors={errors} isTrade={isTrade} company={company} />}
          </Section>

          <Section n={3} title={t("checkout.shipping")}>
            <div className="grid gap-3">
              {summary.totals.shippingOptions.filter((o) => o.available).map((o) => (
                <RadioCard
                  key={o.method.code}
                  name="shipping"
                  value={o.method.code}
                  defaultChecked={o.method.code === summary.totals.shippingCode}
                  label={tl(o.method.label, locale)}
                  description={tl(o.method.description, locale)}
                  aside={summary.isRequest ? null : o.price ? m(o.price) : t("cart.free")}
                />
              ))}
            </div>
            {isTrade && (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label={t("checkout.po")}>{(id) => <Input id={id} name="po" maxLength={80} />}</Field>
                {deliveryDays?.length ? (
                  <Field label={t("checkout.deliveryDate")} hint={t("checkout.deliveryDayHint", { days: deliveryDays.map((d) => t(`day.${d}` as MessageKey)).join(", ") })}>
                    {(id) => (
                      <Select id={id} name="deliveryDate" defaultValue="">
                        <option value="">—</option>
                        {nextDeliveryDates(deliveryDays).map((d) => <option key={d} value={d}>{new Date(`${d}T12:00:00`).toLocaleDateString(`${locale}-CH`, { weekday: "short", day: "numeric", month: "long" })}</option>)}
                      </Select>
                    )}
                  </Field>
                ) : (
                  <Field label={t("checkout.deliveryDate")}>{(id) => <Input id={id} name="deliveryDate" type="date" min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} />}</Field>
                )}
              </div>
            )}
          </Section>

          {!summary.isRequest && (
            <Section n={4} title={t("checkout.payment")}>
              {errors.payment && <p className="text-sm text-danger">{errors.payment}</p>}
              <div className="grid gap-3">
                {payments.map((p, i) => (
                  <RadioCard key={p} name="payment" value={p} defaultChecked={i === 0} label={t(payLabel(p))} description={payText(p)} />
                ))}
              </div>
            </Section>
          )}
          {summary.isRequest && <input type="hidden" name="payment" value="request" />}

          <Section n={summary.isRequest ? 4 : 5} title={t("checkout.review")}>
            <Field label={t("checkout.notes")}>{(id) => <Textarea id={id} name="notes" rows={3} maxLength={2000} />}</Field>
            {summary.ageRestricted && <Checkbox name="age" label={t("checkout.age", { age: 18 })} aria-invalid={!!errors.age} className={errors.age ? "text-danger" : ""} />}
            <Checkbox name="terms" label={t("checkout.terms")} aria-invalid={!!errors.terms} className={errors.terms ? "text-danger" : ""} />
          </Section>
        </div>

        <aside className="lg:sticky lg:top-[calc(var(--header-h)+2rem)]">
          <Card className="grid gap-6 p-6">
            <h2 className="text-h3">{t("checkout.summary")}</h2>
            <ul className="grid max-h-72 gap-3 overflow-y-auto text-sm">
              {summary.lines.map((l) => (
                <li key={l.variantId} className="grid grid-cols-[2.25rem_1fr_auto] gap-2">
                  <span className="text-muted-fg tabular-nums">{l.qty}×</span>
                  <span className="leading-snug">{l.name}<span className="block text-xs text-muted-fg">{[l.vintage, l.size, l.sku].filter(Boolean).join(" · ")}</span></span>
                  {!summary.isRequest && <span className="tabular-nums">{m(l.lineDisplay)}</span>}
                </li>
              ))}
            </ul>
            <Totals summary={summary} />
            {summary.totals.belowMinimum && <Notice tone="warning">{t("cart.belowMinimum", { amount: m(summary.totals.minOrderCents) })}</Notice>}
            <Button type="submit" size="lg" disabled={submitting || summary.totals.belowMinimum}>
              <Lock size={14} /> {summary.isRequest ? t("checkout.placeRequest") : t("checkout.placeOrder")}
            </Button>
          </Card>
        </aside>
      </Form>
    </div>
  );
}

function AddressFields({ prefix, defaults, errors, isTrade, company }: { prefix: "billing" | "shipping"; defaults: Partial<Record<string, string>> | null; errors: Record<string, string>; isTrade: boolean; company: string }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label={t("form.company")} required={isTrade} error={errors[`${prefix}.company`]}>{(id) => <Input id={id} name={`${prefix}.company`} defaultValue={defaults?.company ?? (prefix === "billing" ? company : "")} autoComplete="organization" />}</Field>
      <Field label={t("form.firstLastName")} required error={errors[`${prefix}.name`]}>{(id) => <Input id={id} name={`${prefix}.name`} defaultValue={defaults?.name ?? ""} autoComplete="name" required aria-invalid={!!errors[`${prefix}.name`]} />}</Field>
      <Field label={t("form.street")} required error={errors[`${prefix}.street`]} className="sm:col-span-2">{(id) => <Input id={id} name={`${prefix}.street`} defaultValue={defaults?.street ?? ""} autoComplete="street-address" required aria-invalid={!!errors[`${prefix}.street`]} />}</Field>
      <div className="grid grid-cols-[110px_1fr] gap-4 sm:col-span-2">
        <Field label={t("form.zip")} required error={errors[`${prefix}.zip`]}>{(id) => <Input id={id} name={`${prefix}.zip`} defaultValue={defaults?.zip ?? ""} autoComplete="postal-code" required inputMode="numeric" aria-invalid={!!errors[`${prefix}.zip`]} />}</Field>
        <Field label={t("form.city")} required error={errors[`${prefix}.city`]}>{(id) => <Input id={id} name={`${prefix}.city`} defaultValue={defaults?.city ?? ""} autoComplete="address-level2" required aria-invalid={!!errors[`${prefix}.city`]} />}</Field>
      </div>
      <Field label={t("form.country")}>{(id) => <Select id={id} name={`${prefix}.country`} defaultValue={defaults?.country ?? "CH"}><option value="CH">Schweiz / Suisse / Svizzera</option><option value="LI">Liechtenstein</option></Select>}</Field>
      {prefix === "billing" && <Field label={t("form.phone")}>{(id) => <Input id={id} name="billing.phone" defaultValue={defaults?.phone ?? ""} autoComplete="tel" type="tel" />}</Field>}
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 border-b border-border pb-10">
      <h2 className="flex items-center gap-3 text-h3"><span className="grid h-7 w-7 place-items-center rounded-full bg-fg font-sans text-xs text-bg">{n}</span>{title}</h2>
      {children}
    </section>
  );
}

/** Next delivery dates on the customer's tour days (1 = Monday … 6 = Saturday), from tomorrow on. */
function nextDeliveryDates(days: number[], count = 8) {
  const out: string[] = [];
  for (let i = 1; out.length < count && i < 60; i++) {
    const d = new Date(Date.now() + i * 86400000);
    const wd = d.getDay() === 0 ? 7 : d.getDay();
    if (days.includes(wd)) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** A requested delivery date is kept only if it is a date in the future and (with vinX tour days) on one of them. */
function validDeliveryDate(v: string | undefined, days: number[] | null | undefined) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v ?? "")) return undefined;
  const d = new Date(`${v}T12:00:00`);
  if (d.getTime() < Date.now()) return undefined;
  const wd = d.getDay() === 0 ? 7 : d.getDay();
  return !days?.length || days.includes(wd) ? v : undefined;
}
