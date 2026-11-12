import { data, Form, redirect } from "react-router";
import { RotateCcw } from "lucide-react";
import type { Route } from "./+types/account-order";
import { commit, getSession, requireUser } from "~/.server/auth";
import { shopContext } from "~/.server/context";
import { addItem, getCart, updateCart } from "~/.server/cart";
import { getOrder } from "~/.server/orders";
import { useI18n, type MessageKey } from "~/lib/i18n";
import { formatMoney } from "~/lib/money";
import { channelPath } from "~/lib/channel";
import { Badge, Button, Card, Eyebrow } from "~/components/ui";
import { AccountNav } from "~/components/account-nav";
import { STATUS_TONE } from "~/components/status";

async function load(request: Request, number: string) {
  const user = await requireUser(request);
  const order = await getOrder({ number });
  if (!order || order.userId !== user.id) throw data("Not found", { status: 404 });
  return order;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  return { order: await load(request, params.number) };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const ctx = context.get(shopContext);
  const order = await load(request, params.number);
  const cart = await getCart(request, ctx, true);
  const lines = order.items.filter((i) => i.variantId);
  await updateCart(cart.id!, (items) => lines.reduce((acc, i) => addItem(acc, i.variantId!, i.qty), items));
  const session = await getSession(request);
  session.flash("toast", { kind: "success", text: ctx.t("account.reordered", { n: lines.length }) });
  const headers = new Headers({ "Set-Cookie": await commit(session) });
  if (cart.setCookie) headers.append("Set-Cookie", cart.setCookie);
  return redirect(channelPath("/order-list", ctx.channel.portal), { headers });
}

export default function AccountOrder({ loaderData }: Route.ComponentProps) {
  const { order } = loaderData;
  const { t, locale } = useI18n();
  const m = (c: number) => formatMoney(c, order.currency, locale);
  const request = order.kind === "request";
  return (
    <div className="container-page page-top">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-3">
          <Eyebrow line>{t(request ? "account.request" : "account.order")} · {new Date(order.createdAt).toLocaleDateString(`${locale}-CH`)}</Eyebrow>
          <h1 className="text-h1">{order.number}</h1>
        </div>
        <Badge tone={STATUS_TONE[order.status]} className="text-[11px]">{t(`status.${order.status}` as MessageKey)}</Badge>
      </header>
      <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
        <AccountNav />
        <div className="grid content-start gap-6">
          <Card className="divide-y divide-border">
            {order.items.map((i) => (
              <div key={i.id} className="grid grid-cols-[3rem_1fr_auto] gap-3 px-5 py-4 text-sm">
                <span className="text-muted-fg tabular-nums">{i.qty}×</span>
                <span>{i.name}<span className="block text-[12px] text-muted-fg">{t("product.art")} {i.sku}</span></span>
                {!request && <span className="tabular-nums">{m(i.lineGross)}</span>}
              </div>
            ))}
            {!request && (
              <div className="flex justify-between px-5 py-4 font-medium"><span>{t("cart.grandTotal")}</span><span className="tabular-nums">{m(order.totalGross)}</span></div>
            )}
          </Card>
          <div className="grid gap-6 sm:grid-cols-2">
            <Card className="p-5 text-sm leading-relaxed">
              <p className="text-eyebrow mb-2 text-[10px] text-muted-fg">{t("checkout.billing")}</p>
              {[order.billing.company, order.billing.name, order.billing.street, `${order.billing.zip} ${order.billing.city}`].filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}
            </Card>
            <Card className="p-5 text-sm leading-relaxed">
              <p className="text-eyebrow mb-2 text-[10px] text-muted-fg">{t("checkout.shipping")}</p>
              <p>{order.shippingMethod}</p>
              {order.poNumber && <p className="text-muted-fg">{t("checkout.po")}: {order.poNumber}</p>}
              {order.deliveryDate && <p className="text-muted-fg">{t("checkout.deliveryDate")}: {order.deliveryDate}</p>}
            </Card>
          </div>
          <Form method="post"><Button type="submit"><RotateCcw size={15} /> {t("account.reorder")}</Button></Form>
        </div>
      </div>
    </div>
  );
}
