import { Form, NavLink } from "react-router";
import { FileSpreadsheet, LayoutGrid, LogOut, Package, Zap } from "lucide-react";
import { useI18n } from "~/lib/i18n";
import { cn } from "~/lib/cn";
import { useRootData } from "~/lib/root-data";
import { usePath } from "~/lib/channel";

export function AccountNav() {
  const { t } = useI18n();
  const { user, channel } = useRootData();
  const to = usePath();
  if (to.portal) return null;
  const item = ({ isActive }: { isActive: boolean }) => cn("flex items-center gap-3 rounded-control px-3 py-2.5 text-sm transition-colors", isActive ? "bg-surface font-medium shadow-[inset_2px_0_0_var(--t-primary)]" : "text-fg/75 hover:bg-muted");
  return (
    <nav className="flex gap-1 overflow-x-auto pb-1 lg:grid lg:content-start" aria-label={t("account.title")}>
      <NavLink to="/account" end className={item}><Package size={16} strokeWidth={1.5} /> {t("account.orders")}</NavLink>
      {user?.isTrade && channel.canUsePortal && <NavLink to="/portal" className={item}><LayoutGrid size={16} strokeWidth={1.5} /> {t("portal.title")}</NavLink>}
      {user?.isTrade && <NavLink to="/account/quick-order" className={item}><Zap size={16} strokeWidth={1.5} /> {t("account.quickOrder")}</NavLink>}
      {user?.isTrade && <a href="/account/price-list.csv" className={item({ isActive: false })}><FileSpreadsheet size={16} strokeWidth={1.5} /> {t("account.priceList")}</a>}
      <Form method="post" action="/logout" className="lg:mt-4 lg:border-t lg:border-border lg:pt-4">
        <button className={item({ isActive: false })}><LogOut size={16} strokeWidth={1.5} /> {t("nav.logout")}</button>
      </Form>
    </nav>
  );
}
