import { Form, NavLink, Outlet, useLocation } from "react-router";
import { ArrowUpRight, ClipboardList, FileSpreadsheet, LayoutGrid, LogOut, Package, Store, Wine, Zap } from "lucide-react";
import type { Route } from "./+types/layout";
import { requireUser } from "~/.server/auth";
import { shopContext } from "~/.server/context";
import { useI18n, type MessageKey } from "~/lib/i18n";
import { cn } from "~/lib/cn";
import { useRootData } from "~/lib/root-data";
import { ButtonLink, Card, Eyebrow } from "~/components/ui";
import { Logo, ThemeToggle, Toast } from "~/components/shop";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const ctx = context.get(shopContext);
  const access = ctx.channel.canUsePortal ? "ok" : user.tradeStatus === "pending" ? "pending" : "none";
  return { access, quickOrder: ctx.shop.trade.quickOrder, priceList: ctx.shop.trade.priceListExport } as const;
}

export const meta: Route.MetaFunction = () => [{ name: "robots", content: "noindex" }];

const NAV: { to: string; key: MessageKey; icon: typeof Package; end?: boolean; when?: "quickOrder" }[] = [
  { to: "/portal", key: "portal.dashboard", icon: LayoutGrid, end: true },
  { to: "/portal/catalog", key: "portal.catalog", icon: Wine },
  { to: "/portal/quick-order", key: "account.quickOrder", icon: Zap, when: "quickOrder" },
  { to: "/portal/order-list", key: "nav.orderList", icon: ClipboardList },
  { to: "/portal/orders", key: "portal.orders", icon: Package },
];

export default function PortalLayout({ loaderData }: Route.ComponentProps) {
  const { access, quickOrder, priceList } = loaderData;
  const { t, locale } = useI18n();
  const { user, cartCount, toast, channel, shop } = useRootData();
  const location = useLocation();

  if (access !== "ok") {
    return (
      <div className="grid min-h-screen place-items-center bg-bg px-4 py-16">
        <Card className="grid w-full max-w-lg gap-6 p-8 text-center md:p-10">
          <div className="justify-self-center"><Logo to="/" sub={t("portal.title")} /></div>
          <h1 className="text-h2">{t("portal.noAccess")}</h1>
          <p className="text-muted-fg">{access === "pending" ? t("portal.pendingText") : t("portal.noAccessText")}</p>
          <div className="flex flex-wrap justify-center gap-3">
            {access === "none" && <ButtonLink to="/trade#apply">{t("trade.apply")}</ButtonLink>}
            <Form method="post" action="/logout"><button className="h-11 px-5 text-sm text-muted-fg hover:text-fg">{t("nav.logout")}</button></Form>
          </div>
        </Card>
      </div>
    );
  }

  const item = ({ isActive }: { isActive: boolean }) =>
    cn("flex shrink-0 items-center gap-3 rounded-control px-3 py-2 text-[14px] transition-colors", isActive ? "bg-primary-soft font-medium text-primary" : "text-fg/75 hover:bg-muted hover:text-fg");
  const shopHref = `${channel.shopUrl}/`;

  return (
    <div className="min-h-screen bg-bg lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="flex flex-col gap-6 border-b border-border bg-surface px-4 py-5 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="px-2"><Logo compact to="/portal" sub={t("portal.title")} /></div>
        <nav className="scrollbar-none flex gap-1 overflow-x-auto lg:grid lg:content-start" aria-label={t("portal.title")}>
          {NAV.filter((n) => !n.when || (n.when === "quickOrder" && quickOrder)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={item}>
              <n.icon size={17} strokeWidth={1.6} />
              <span className="flex-1">{t(n.key)}</span>
              {n.to === "/portal/order-list" && cartCount > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-on-primary tabular-nums">{cartCount}</span>
              )}
            </NavLink>
          ))}
          {priceList && <a href="/account/price-list.csv" className={item({ isActive: false })}><FileSpreadsheet size={17} strokeWidth={1.6} /><span className="flex-1">{t("account.priceList")}</span></a>}
          {channel.mode !== "portal-only" && (
            <>
              <span className="mx-3 my-3 hidden border-t border-border lg:block" />
              <a href={shopHref} className={item({ isActive: false })}><Store size={17} strokeWidth={1.6} /><span className="flex-1">{t("portal.toShop")}</span><ArrowUpRight size={14} className="text-muted-fg" /></a>
            </>
          )}
        </nav>
        <div className="mt-auto hidden gap-3 border-t border-border px-2 pt-5 lg:grid">
          <div className="grid gap-0.5">
            <Eyebrow className="text-[9px]">{user?.groupName}</Eyebrow>
            <p className="truncate text-sm font-medium">{user?.company || user?.name}</p>
            <p className="truncate text-[12px] text-muted-fg">{user?.email}</p>
          </div>
          <div className="flex items-center justify-between">
            <Form method="post" action="/logout"><button className="flex items-center gap-2 text-[13px] text-muted-fg hover:text-fg"><LogOut size={14} /> {t("nav.logout")}</button></Form>
            <ThemeToggle className="h-8 w-8" />
            {shop.locales.length > 1 && (
              <div className="flex gap-2 text-[12px] uppercase">
                {shop.locales.map((l) => (
                  <Form key={l} method="post" action="/set-locale" className="contents">
                    <input type="hidden" name="locale" value={l} />
                    <input type="hidden" name="redirectTo" value={location.pathname + location.search} />
                    <button className={l === locale ? "font-semibold text-fg" : "text-muted-fg hover:text-fg"} aria-current={l === locale}>{l}</button>
                  </Form>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
      <main id="main" className="min-w-0">
        <Outlet />
      </main>
      {toast && <Toast>{toast.text}</Toast>}
    </div>
  );
}
