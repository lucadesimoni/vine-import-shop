import { data, Link } from "react-router";
import { Check } from "lucide-react";
import type { Route } from "./+types/checkout-done";
import { shopContext } from "~/.server/context";
import { getOrder } from "~/.server/orders";
import { useI18n } from "~/lib/i18n";
import { formatMoney } from "~/lib/money";
import { ButtonLink, Card } from "~/components/ui";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const ctx = context.get(shopContext);
  const order = await getOrder({ number: params.number });
  const token = new URL(request.url).searchParams.get("t");
  if (!order || (order.token !== token && order.userId !== ctx.user?.id)) throw data("Not found", { status: 404 });
  return { order, bank: order.paymentMethod === "prepayment" ? ctx.shop.payments.prepayment : null };
}

export const meta: Route.MetaFunction = () => [{ name: "robots", content: "noindex" }];

export default function Done({ loaderData }: Route.ComponentProps) {
  const { order, bank } = loaderData;
  const { t, locale } = useI18n();
  const m = (c: number) => formatMoney(c, order.currency, locale);
  const request = order.kind === "request";
  return (
    <div className="container-page grid justify-items-center py-20">
      <Card className="animate-fade-up grid w-full max-w-2xl justify-items-center gap-6 p-8 text-center md:p-12">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-primary text-on-primary"><Check size={28} /></span>
        <h1 className="text-h1">{t("done.title")}</h1>
        <p className="text-lead max-w-md text-muted-fg">{request ? t("done.requestText", { number: order.number }) : t("done.orderText", { number: order.number, email: order.email })}</p>
        {bank && bank.iban && (
          <dl className="grid w-full gap-2 rounded-md bg-muted p-5 text-left text-sm sm:grid-cols-[140px_1fr]">
            <dt className="text-muted-fg">{t("done.holder")}</dt><dd>{bank.holder}</dd>
            <dt className="text-muted-fg">IBAN</dt><dd className="font-mono">{bank.iban}</dd>
            <dt className="text-muted-fg">{t("done.reference")}</dt><dd className="font-mono">{order.number}</dd>
            <dt className="text-muted-fg">{t("cart.grandTotal")}</dt><dd className="font-semibold">{m(order.totalGross)}</dd>
          </dl>
        )}
        <ul className="grid w-full gap-2 border-t border-border pt-6 text-left text-sm">
          {order.items.map((i) => (
            <li key={i.id} className="grid grid-cols-[2.5rem_1fr_auto] gap-2">
              <span className="text-muted-fg">{i.qty}×</span><span>{i.name} <span className="text-muted-fg">· {i.sku}</span></span>
              {!request && <span className="tabular-nums">{m(i.lineGross)}</span>}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink to="/shop">{t("cart.continue")}</ButtonLink>
          {order.userId && <ButtonLink to="/account" variant="secondary">{t("account.title")}</ButtonLink>}
        </div>
        <Link to="/" className="sr-only">home</Link>
      </Card>
    </div>
  );
}
