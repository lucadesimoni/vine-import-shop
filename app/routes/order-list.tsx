import { Form, Link, useFetcher } from "react-router";
import { ArrowRight, ShoppingBag, X } from "lucide-react";
import type { Route } from "./+types/order-list";
import { shopContext } from "~/.server/context";
import { cartSummary, getCart } from "~/.server/cart";
import { useI18n } from "~/lib/i18n";
import { formatMoney } from "~/lib/money";
import { useRootData } from "~/lib/root-data";
import { ButtonLink, Button, Card, EmptyState, Eyebrow, Input, Notice, Stepper } from "~/components/ui";
import { ProductImage } from "~/components/shop";
import { Totals } from "~/components/totals";

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = context.get(shopContext);
  const cart = await getCart(request, ctx);
  return { summary: await cartSummary(ctx, cart.items, cart.couponCode) };
}

export const meta: Route.MetaFunction = () => [{ title: "Bestellliste" }, { name: "robots", content: "noindex" }];

export default function OrderList({ loaderData }: Route.ComponentProps) {
  const { summary } = loaderData;
  const { t, locale } = useI18n();
  const { shop } = useRootData();
  const m = (c: number) => formatMoney(c, shop.currency, locale);

  if (!summary.lines.length) {
    return (
      <div className="container-page py-20">
        <EmptyState icon={<ShoppingBag size={30} strokeWidth={1.3} />} title={t("cart.empty")} text={t("cart.emptyHint")} action={<ButtonLink to="/shop">{t("cart.toShop")}</ButtonLink>} />
      </div>
    );
  }

  return (
    <div className="container-page pb-24 pt-12">
      <header className="mb-10 grid gap-3">
        <Eyebrow line>{t("cart.units", { n: summary.count })}</Eyebrow>
        <h1 className="text-h1">{t("cart.title")}</h1>
      </header>
      <div className="grid gap-10 lg:grid-cols-[1fr_380px] lg:items-start">
        <Card>
          <div className="hidden grid-cols-[80px_1fr_140px_120px_40px] gap-5 border-b border-border px-6 py-3 md:grid">
            {["", t("cart.item"), t("cart.qty"), summary.isRequest ? "" : t("cart.total"), ""].map((h, i) => <span key={i} className="text-eyebrow text-[10px] text-muted-fg">{h}</span>)}
          </div>
          <ul>
            {summary.lines.map((l) => <Line key={l.variantId} line={l} money={m} showPrice={!summary.isRequest} />)}
          </ul>
        </Card>

        <aside className="grid gap-5 lg:sticky lg:top-[calc(var(--header-h)+2rem)]">
          <Card className="grid gap-6 p-6">
            <h2 className="text-h3">{t("checkout.summary")}</h2>
            <Totals summary={summary} />
            {summary.totals.belowMinimum && <Notice tone="warning">{t("cart.belowMinimum", { amount: m(summary.totals.minOrderCents) })}</Notice>}
            <ButtonLink to="/checkout" size="lg" className={summary.totals.belowMinimum ? "pointer-events-none opacity-45" : ""}>
              {summary.isRequest ? t("cart.request") : t("cart.checkout")} <ArrowRight size={16} />
            </ButtonLink>
            <Link to="/shop" className="text-center text-sm text-muted-fg hover:text-fg">{t("cart.continue")}</Link>
          </Card>
          {!summary.isRequest && (
            <Form method="post" action="/cart" className="flex gap-2">
              <input type="hidden" name="intent" value="coupon" />
              <input type="hidden" name="redirectTo" value="/order-list" />
              <Input name="code" placeholder={t("cart.coupon")} defaultValue={summary.totals.coupon?.code ?? ""} aria-label={t("cart.coupon")} className="h-10" />
              <Button type="submit" variant="secondary" size="sm" className="h-10">{t("cart.applyCoupon")}</Button>
            </Form>
          )}
        </aside>
      </div>
    </div>
  );
}

function Line({ line: l, money, showPrice }: { line: Route.ComponentProps["loaderData"]["summary"]["lines"][number]; money: (c: number) => string; showPrice: boolean }) {
  const { t } = useI18n();
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  return (
    <li className={`grid grid-cols-[64px_1fr_auto] items-center gap-x-4 gap-y-3 border-b border-border px-4 py-5 last:border-0 md:grid-cols-[80px_1fr_140px_120px_40px] md:gap-5 md:px-6 ${busy ? "opacity-60" : ""}`}>
      <Link to={`/product/${l.productSlug}`} className="relative row-span-2 aspect-square rounded-md bg-surface ring-1 ring-border md:row-span-1">
        <span className="absolute inset-1.5"><ProductImage product={{ image: l.image, name: l.name, kind: l.kind, color: l.color }} /></span>
      </Link>
      <div className="min-w-0">
        <Link to={`/product/${l.productSlug}`} className="font-medium leading-snug hover:underline">{l.name}</Link>
        <p className="mt-1 text-[13px] text-muted-fg">{[l.producer, l.vintage, l.size, `${t("product.art")} ${l.sku}`].filter(Boolean).join(" · ")}</p>
        {showPrice && <p className="mt-1 text-[13px] text-muted-fg tabular-nums">{money(l.unitDisplay)}{l.tierApplied && <span className="text-primary"> · {t("price.tiers")}</span>}</p>}
      </div>
      <fetcher.Form method="post" action="/cart" onChange={(e) => fetcher.submit(e.currentTarget)} className="col-start-2 md:col-start-auto">
        <input type="hidden" name="intent" value="set" />
        <Stepper name={`qty:${l.variantId}`} defaultValue={l.qty} min={0} size="sm" label={t("cart.qty")} />
      </fetcher.Form>
      <span className="col-start-3 row-start-1 text-right font-medium tabular-nums md:col-start-auto md:row-start-auto">{showPrice ? money(l.lineDisplay) : ""}</span>
      <fetcher.Form method="post" action="/cart" className="col-start-3 row-start-2 justify-self-end md:col-start-auto md:row-start-auto">
        <input type="hidden" name="intent" value="remove" />
        <input type="hidden" name="variantId" value={l.variantId} />
        <button className="grid h-9 w-9 place-items-center rounded-full text-muted-fg transition-colors hover:bg-muted hover:text-fg" aria-label={t("cart.remove")}><X size={16} /></button>
      </fetcher.Form>
    </li>
  );
}
