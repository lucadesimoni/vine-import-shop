import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { data, Form, redirect, useNavigation } from "react-router";
import { Zap } from "lucide-react";
import type { Route } from "./+types/quick-order";
import { commit, getSession, requireUser } from "~/.server/auth";
import { shopContext } from "~/.server/context";
import { addItem, getCart, updateCart } from "~/.server/cart";
import { toCards } from "~/.server/catalog";
import { getDb, schema } from "~/.server/db";
import { useI18n } from "~/lib/i18n";
import { formatMoney } from "~/lib/money";
import { useRootData } from "~/lib/root-data";
import { channelPath } from "~/lib/channel";
import { Button, Card, Eyebrow, Field, Input, Notice, Textarea } from "~/components/ui";
import { AccountNav } from "~/components/account-nav";
import { StockLabel } from "~/components/shop";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const ctx = context.get(shopContext);
  if (!ctx.isTrade) throw redirect(channelPath("/account", ctx.channel.portal));
  const db = await getDb();
  const frequent = await db
    .select({ productId: schema.variants.productId, variantId: schema.orderItems.variantId, qty: sql<number>`sum(${schema.orderItems.qty})::int` })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
    .innerJoin(schema.variants, eq(schema.variants.id, schema.orderItems.variantId))
    .where(eq(schema.orders.userId, user.id))
    .groupBy(schema.variants.productId, schema.orderItems.variantId)
    .orderBy(desc(sql`sum(${schema.orderItems.qty})`))
    .limit(20);
  const cards = await toCards(ctx, [...new Set(frequent.map((f) => f.productId))]);
  return {
    frequent: frequent.map((f) => {
      const card = cards.find((c) => c.id === f.productId)!;
      return { card, variant: card.variants.find((v) => v.id === f.variantId)!, ordered: f.qty };
    }).filter((r) => r.variant),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(request);
  const ctx = context.get(shopContext);
  const form = await request.formData();
  const rows: [string, number][] = [];
  for (const line of String(form.get("paste") ?? "").split(/\r?\n/)) {
    const m = line.trim().match(/^([\w.\-/]+)[\s;,\t]+(\d+)/);
    if (m) rows.push([m[1], Number(m[2])]);
  }
  for (const [k, v] of form.entries()) if (k.startsWith("qty:") && Number(v) > 0) rows.push([`#${k.slice(4)}`, Number(v)]);
  if (!rows.length) return data({ added: 0, missing: [] as string[] });

  const db = await getDb();
  const skus = rows.filter(([s]) => !s.startsWith("#")).map(([s]) => s);
  const found = skus.length ? await db.select({ id: schema.variants.id, sku: schema.variants.sku }).from(schema.variants).where(and(inArray(schema.variants.sku, skus), eq(schema.variants.active, true))) : [];
  const missing = skus.filter((s) => !found.some((f) => f.sku === s));
  const adds = rows.map(([s, q]) => [s.startsWith("#") ? Number(s.slice(1)) : found.find((f) => f.sku === s)?.id, q] as const).filter((r): r is readonly [number, number] => !!r[0]);
  const cart = await getCart(request, ctx, true);
  await updateCart(cart.id!, (items) => adds.reduce((acc, [id, q]) => addItem(acc, id, q), items));

  if (!missing.length) {
    const session = await getSession(request);
    session.flash("toast", { kind: "success", text: ctx.t("quick.added", { n: adds.length }) });
    const headers = new Headers({ "Set-Cookie": await commit(session) });
    if (cart.setCookie) headers.append("Set-Cookie", cart.setCookie);
    return redirect(channelPath("/order-list", ctx.channel.portal), { headers });
  }
  return data({ added: adds.length, missing }, { headers: cart.setCookie ? { "Set-Cookie": cart.setCookie } : undefined });
}

export default function QuickOrder({ loaderData, actionData }: Route.ComponentProps) {
  const { frequent } = loaderData;
  const { t, locale } = useI18n();
  const { shop } = useRootData();
  const busy = useNavigation().state === "submitting";
  return (
    <div className="container-page pb-24 pt-12">
      <header className="mb-10 grid gap-3">
        <Eyebrow line>B2B</Eyebrow>
        <h1 className="text-h1">{t("quick.title")}</h1>
        <p className="text-muted-fg">{t("quick.text")}</p>
      </header>
      <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
        <AccountNav />
        <Form method="post" className="grid content-start gap-8">
          {actionData && actionData.missing.length > 0 && (
            <Notice tone="warning">{t("quick.added", { n: actionData.added })} · {t("quick.missing", { skus: actionData.missing.join(", ") })}</Notice>
          )}
          {frequent.length > 0 && (
            <Card className="overflow-x-auto">
              <p className="text-eyebrow border-b border-border px-5 py-3 text-[10px] text-muted-fg">{t("quick.frequent")}</p>
              <table className="w-full text-sm">
                <tbody>
                  {frequent.map(({ card, variant, ordered }) => (
                    <tr key={variant.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-3 font-mono text-[13px] text-muted-fg">{variant.sku}</td>
                      <td className="px-5 py-3"><span className="font-medium">{card.name}</span><span className="block text-[12px] text-muted-fg">{[variant.vintage, variant.size].filter(Boolean).join(" · ")} · Σ {ordered}</span></td>
                      <td className="px-5 py-3"><StockLabel level={variant.stock} /></td>
                      <td className="px-5 py-3 text-right tabular-nums">{variant.price ? formatMoney(variant.price.display, shop.currency, locale) : ""}</td>
                      <td className="px-5 py-3 text-right"><Input name={`qty:${variant.id}`} type="number" min={0} defaultValue={0} aria-label={t("cart.qty")} size="sm" className="ml-auto w-20 text-right tabular-nums" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          <Field label={t("quick.paste")} hint={t("quick.pasteHint")}>
            {(id) => <Textarea id={id} name="paste" rows={8} className="font-mono text-[13px]" placeholder={"10679\t12\n10658;6\n7739 40"} />}
          </Field>
          <Button type="submit" size="lg" className="w-fit" disabled={busy}><Zap size={15} /> {t("quick.add")}</Button>
        </Form>
      </div>
    </div>
  );
}
