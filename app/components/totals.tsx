import type { CartSummary } from "~/.server/cart";
import { useI18n } from "~/lib/i18n";
import { tl } from "~/lib/localized";
import { formatMoney } from "~/lib/money";
import { useRootData } from "~/lib/root-data";
import { cn } from "~/lib/cn";

/** Order totals — identical on order list, checkout and confirmations. */
export function Totals({ summary, className }: { summary: Pick<CartSummary, "totals" | "isRequest" | "erpExtras" | "erpCalculated">; className?: string }) {
  const { t, locale } = useI18n();
  const { shop } = useRootData();
  const m = (c: number) => formatMoney(c, shop.currency, locale);
  const tt = summary.totals;
  const net = tt.displayMode === "net";
  const ship = tt.shippingOptions.find((o) => o.method.code === tt.shippingCode);

  if (summary.isRequest) {
    return <p className={cn("text-sm text-muted-fg", className)}>{t("cart.requestNote")}</p>;
  }
  const Row = ({ label, value, strong, muted }: { label: React.ReactNode; value: string; strong?: boolean; muted?: boolean }) => (
    <div className={cn("flex items-baseline justify-between gap-4", muted && "text-[13px] text-muted-fg", strong && "border-t border-border pt-4")}>
      <dt className={strong ? "font-medium" : undefined}>{label}</dt>
      <dd className={cn("tabular-nums", strong && "font-display text-2xl")}>{value}</dd>
    </div>
  );
  return (
    <dl className={cn("grid gap-3 text-sm", className)}>
      <Row label={<>{t("cart.subtotal")} <span className="text-muted-fg">{net ? t("price.exclVat") : ""}</span></>} value={m(net ? tt.subtotalNet : tt.subtotalGross)} />
      {summary.erpExtras.map((x, i) => <Row key={i} muted label={x.description} value={m(net ? Math.round(x.unitNet * x.qty) : x.lineGross)} />)}
      {tt.discount > 0 && tt.coupon && <Row label={`${t("cart.discount")} · ${tt.coupon.code}`} value={`− ${m(tt.discount)}`} />}
      {ship && !summary.erpCalculated && <Row label={`${t("cart.shipping")} · ${tl(ship.method.label, locale)}`} value={tt.shippingGross ? m(tt.shippingGross) : t("cart.free")} />}
      <Row strong label={<>{t("cart.grandTotal")} <span className="text-[12px] font-normal text-muted-fg">{t("price.inclVat")}</span></>} value={m(tt.totalGross)} />
      {Object.entries(tt.taxes).map(([rate, amount]) => <Row key={rate} muted label={t("cart.vat", { rate })} value={m(amount)} />)}
      {summary.erpCalculated && <p className="text-[12px] text-muted-fg">✓ ERP</p>}
    </dl>
  );
}
