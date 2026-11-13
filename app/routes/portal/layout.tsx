import { Form, NavLink, Outlet, useLocation } from "react-router";
import { ArrowUpRight, ClipboardList, FileSpreadsheet, LayoutGrid, LogOut, MoreHorizontal, Package, Store, Wine, Zap } from "lucide-react";
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

const NAV: { to: string; key: MessageKey; short: MessageKey; icon: typeof Package; end?: boolean; when?: "quickOrder" }[] = [
  { to: "/portal", key: "portal.dashboard", short: "portal.dashboard", icon: LayoutGrid, end: true },
  { to: "/portal/catalog", key: "portal.catalog", short: "portal.catalog", icon: Wine },
  { to: "/portal/quick-order", key: "account.quickOrder", short: "portal.tabQuick", icon: Zap, when: "quickOrder" },
  { to: "/portal/order-list", key: "nav.orderList", short: "portal.tabList", icon: ClipboardList },
  { to: "/portal/orders", key: "portal.orders", short: "portal.orders", icon: Package },
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
    cn("flex shrink-0 items-center gap-3 rounded-control px-3 py-2 text-sm transition-colors", isActive ? "bg-primary-soft font-medium text-primary" : "text-fg/75 hover:bg-muted hover:text-fg");
  const shopHref = `${channel.shopUrl}/`;

  return (
    <div className="min-h-screen bg-bg lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="sticky top-0 z-30 flex flex-col gap-6 border-b border-border bg-surface px-4 py-3 lg:h-screen lg:border-b-0 lg:border-r lg:py-5">
        <div className="flex items-center justify-between gap-3 px-2 lg:block">
          <Logo compact to="/portal" sub={t("portal.title")} />
          {/* phones: account & extras behind one button; main sections live in the bottom tab bar */}
          <details className="group relative lg:hidden">
            <summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-control text-fg hover:bg-muted [&::-webkit-details-marker]:hidden" aria-label={t("nav.menu")}>
              <MoreHorizontal size={20} />
            </summary>
            <div className="absolute right-0 top-12 z-40 grid w-64 gap-1 rounded-surface border border-border bg-surface p-2 shadow-pop">
              <div className="grid gap-0.5 border-b border-border px-3 pb-3 pt-1">
                <Eyebrow className="text-2xs">{user?.groupName}</Eyebrow>
                <p className="truncate text-sm font-medium">{user?.company || user?.name}</p>
                <p className="truncate text-xs text-muted-fg">{user?.email}</p>
              </div>
              {priceList && <a href="/account/price-list.csv" className={item({ isActive: false })}><FileSpreadsheet size={17} strokeWidth={1.6} /><span className="flex-1">{t("account.priceList")}</span></a>}
              {channel.mode !== "portal-only" && <a href={shopHref} className={item({ isActive: false })}><Store size={17} strokeWidth={1.6} /><span className="flex-1">{t("portal.toShop")}</span><ArrowUpRight size={14} className="text-muted-fg" /></a>}
              <div className="flex items-center justify-between border-t border-border px-1 pt-2">
                <ThemeToggle className="h-9 w-9" />
                {shop.locales.length > 1 && (
                  <div className="flex gap-1 text-xs uppercase">
                    {shop.locales.map((l) => (
                      <Form key={l} method="post" action="/set-locale" className="contents">
                        <input type="hidden" name="locale" value={l} />
                        <input type="hidden" name="redirectTo" value={location.pathname + location.search} />
                        <button className={cn("rounded-badge px-2 py-1", l === locale ? "bg-muted font-semibold text-fg" : "text-muted-fg")} aria-current={l === locale}>{l}</button>
                      </Form>
                    ))}
                  </div>
                )}
                <Form method="post" action="/logout"><button className="flex h-9 items-center gap-2 px-2 text-note text-muted-fg hover:text-fg"><LogOut size={14} /> {t("nav.logout")}</button></Form>
              </div>
            </div>
          </details>
        </div>
        <nav className="hidden gap-1 lg:grid lg:content-start" aria-label={t("portal.title")}>
          {NAV.filter((n) => !n.when || (n.when === "quickOrder" && quickOrder)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={item}>
              <n.icon size={17} strokeWidth={1.6} />
              <span className="flex-1">{t(n.key)}</span>
              {n.to === "/portal/order-list" && cartCount > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-2xs font-semibold text-on-primary tabular-nums">{cartCount}</span>
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
            <Eyebrow className="text-2xs">{user?.groupName}</Eyebrow>
            <p className="truncate text-sm font-medium">{user?.company || user?.name}</p>
            <p className="truncate text-xs text-muted-fg">{user?.email}</p>
          </div>
          <div className="flex items-center justify-between">
            <Form method="post" action="/logout"><button className="flex items-center gap-2 text-note text-muted-fg hover:text-fg"><LogOut size={14} /> {t("nav.logout")}</button></Form>
            <ThemeToggle className="h-8 w-8" />
            {shop.locales.length > 1 && (
              <div className="flex gap-2 text-xs uppercase">
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
      <main id="main" className="min-w-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <Outlet />
      </main>
      {/* phones: app-style tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid auto-cols-fr grid-flow-col border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label={t("portal.title")}>
        {NAV.filter((n) => !n.when || (n.when === "quickOrder" && quickOrder)).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn("relative flex h-16 flex-col items-center justify-center gap-1 text-2xs font-medium tracking-wide transition-colors", isActive ? "text-primary" : "text-muted-fg")}>
            <n.icon size={20} strokeWidth={1.6} />
            <span className="max-w-full truncate px-1">{t(n.short)}</span>
            {n.to === "/portal/order-list" && cartCount > 0 && (
              <span className="absolute left-1/2 top-2 ml-2 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-2xs font-semibold text-on-primary tabular-nums">{cartCount}</span>
            )}
          </NavLink>
        ))}
      </nav>
      {toast && <Toast>{toast.text}</Toast>}
    </div>
  );
}
