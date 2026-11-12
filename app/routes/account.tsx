import { desc, eq } from "drizzle-orm";
import { Form, Link } from "react-router";
import { RotateCcw } from "lucide-react";
import type { Route } from "./+types/account";
import { requireUser } from "~/.server/auth";
import { shopContext } from "~/.server/context";
import { getDb, schema } from "~/.server/db";
import { useI18n, type MessageKey } from "~/lib/i18n";
import { formatMoney } from "~/lib/money";
import { Badge, Button, ButtonLink, Card, EmptyState, Eyebrow, Notice } from "~/components/ui";
import { AccountNav } from "~/components/account-nav";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const ctx = context.get(shopContext);
  const db = await getDb();
  const orders = await db.select().from(schema.orders).where(eq(schema.orders.userId, user.id)).orderBy(desc(schema.orders.createdAt)).limit(50);
  return { orders, user: { name: user.name, company: user.company, tradeStatus: user.tradeStatus, group: user.group?.name ?? null }, isTrade: ctx.isTrade };
}

export const meta: Route.MetaFunction = () => [{ name: "robots", content: "noindex" }];

import { STATUS_TONE } from "~/components/status";

export default function Account({ loaderData }: Route.ComponentProps) {
  const { orders, user, isTrade } = loaderData;
  const { t, locale } = useI18n();
  return (
    <div className="container-page pb-24 pt-12">
      <header className="mb-10 grid gap-3">
        <Eyebrow line>{[user.company, isTrade && user.group].filter(Boolean).join(" · ") || t("account.title")}</Eyebrow>
        <h1 className="text-h1">{t("account.hello", { name: user.name.split(" ")[0] || "" })}</h1>
      </header>
      <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
        <AccountNav />
        <div className="grid content-start gap-6">
          {user.tradeStatus === "pending" && <Notice tone="warning">{t("account.pending")}</Notice>}
          {isTrade && <Notice tone="success">{t("account.tradeApproved", { group: user.group ?? "" })}</Notice>}
          <h2 className="text-h3">{t("account.orders")}</h2>
          {orders.length === 0 ? (
            <EmptyState title={t("account.noOrders")} action={<ButtonLink to="/shop">{t("cart.toShop")}</ButtonLink>} />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    {[t("account.number"), t("account.date"), t("account.status"), t("cart.total"), ""].map((h, i) => <th key={i} className="text-eyebrow px-5 py-3 text-[10px] font-semibold text-muted-fg">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-4"><Link to={`/account/orders/${o.number}`} className="font-medium hover:underline">{o.number}</Link><span className="block text-[12px] text-muted-fg">{t(o.kind === "request" ? "account.request" : "account.order")}</span></td>
                      <td className="px-5 py-4 tabular-nums">{new Date(o.createdAt).toLocaleDateString(`${locale}-CH`)}</td>
                      <td className="px-5 py-4"><Badge tone={STATUS_TONE[o.status]}>{t(`status.${o.status}` as MessageKey)}</Badge></td>
                      <td className="px-5 py-4 tabular-nums">{o.kind === "request" ? "—" : formatMoney(o.totalGross, o.currency, locale)}</td>
                      <td className="px-5 py-4 text-right">
                        <Form method="post" action={`/account/orders/${o.number}`}>
                          <input type="hidden" name="intent" value="reorder" />
                          <Button type="submit" variant="ghost" size="sm"><RotateCcw size={14} /> {t("account.reorder")}</Button>
                        </Form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
