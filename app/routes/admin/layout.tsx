import { useEffect, useState } from "react";
import { Form, Link, NavLink, Outlet, redirect, useLocation } from "react-router";
import { ExternalLink, FileText, Grape, LayoutDashboard, LogOut, Menu, Package, Palette, Percent, PlugZap, Settings, ShieldCheck, ShoppingCart, Store, Users, X } from "lucide-react";
import { count, eq } from "drizzle-orm";
import type { Route } from "./+types/layout";
import { requireStaff, verifyPassword } from "~/.server/auth";
import { APP_VERSION } from "~/.server/maintenance";
import { getDb, schema } from "~/.server/db";
import { cn } from "~/lib/cn";
import { useRootData } from "~/lib/root-data";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireStaff(request);
  // Live installations (no demo data) must not keep the default admin password.
  if ((process.env.DEMO_DATA ?? "true") === "false" && !new URL(request.url).pathname.startsWith("/admin/password")) {
    const row = await (await getDb()).query.users.findFirst({ where: eq(schema.users.id, user.id) });
    if (row && (await verifyPassword("admin-demo-1234", row.passwordHash))) throw redirect("/admin/password?required");
  }
  const db = await getDb();
  const [[pending], [newOrders], [failed]] = await Promise.all([
    db.select({ n: count() }).from(schema.users).where(eq(schema.users.tradeStatus, "pending")),
    db.select({ n: count() }).from(schema.orders).where(eq(schema.orders.status, "new")),
    db.select({ n: count() }).from(schema.erpOutbox).where(eq(schema.erpOutbox.status, "failed")),
  ]);
  return { version: APP_VERSION, user: { name: user.name, email: user.email }, badges: { customers: pending.n, orders: newOrders.n, integrations: failed.n } };
}

export const meta: Route.MetaFunction = () => [{ title: "Admin" }, { name: "robots", content: "noindex" }];

const NAV = [
  { to: "/admin", label: "Übersicht", icon: LayoutDashboard, end: true },
  { to: "/admin/orders", label: "Bestellungen", icon: ShoppingCart, badge: "orders" },
  { to: "/admin/products", label: "Produkte", icon: Package },
  { to: "/admin/producers", label: "Produzenten", icon: Grape },
  { to: "/admin/customers", label: "Kunden", icon: Users, badge: "customers" },
  { to: "/admin/conditions", label: "Konditionen", icon: Percent },
  { section: "Shop" },
  { to: "/admin/design", label: "Design & Marke", icon: Palette },
  { to: "/admin/content", label: "Inhalte", icon: FileText },
  { to: "/admin/settings", label: "Einstellungen", icon: Settings },
  { to: "/admin/storefronts", label: "Storefronts", icon: Store },
  { to: "/admin/integrations", label: "vinX ERP", icon: PlugZap, badge: "integrations" },
  { to: "/admin/system", label: "System & Backups", icon: ShieldCheck },
] as const;

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { brand } = useRootData();
  const { user, badges } = loaderData;
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  const pending = Object.values(badges).reduce((a, b) => a + b, 0);
  return (
    <div className="min-h-screen bg-bg lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 z-30 flex flex-col gap-6 border-b border-border bg-surface px-4 py-3 lg:h-screen lg:border-b-0 lg:border-r lg:py-5">
        <div className="flex items-center gap-3 px-2">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menü" className="relative -ml-2 grid h-10 w-10 place-items-center rounded-control hover:bg-muted lg:hidden">
            {open ? <X size={20} /> : <Menu size={20} />}
            {!open && pending > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />}
          </button>
          {brand.logoUrl ? <img src={brand.logoUrl} alt="" className="h-8 w-auto" /> : <span className="grid h-8 w-8 place-items-center rounded-control bg-primary text-on-primary">{brand.name[0]}</span>}
          <div className="grid leading-tight">
            <span className="font-display text-lg">{brand.name}</span>
            <span className="text-eyebrow text-2xs text-muted-fg">Admin</span>
          </div>
        </div>
        <nav className={cn("max-h-[calc(100dvh-4.5rem)] gap-1 overflow-y-auto pb-2 lg:grid lg:max-h-none lg:content-start lg:overflow-visible lg:pb-0", open ? "grid" : "hidden")}>
          {NAV.map((n, i) =>
            "section" in n ? (
              <p key={i} className="text-eyebrow mt-4 px-3 text-2xs text-muted-fg">{n.section}</p>
            ) : (
              <NavLink
                key={n.to}
                to={n.to}
                end={"end" in n}
                className={({ isActive }) => cn("flex shrink-0 items-center gap-3 rounded-control px-3 py-2 text-sm transition-colors", isActive ? "bg-primary-soft font-medium text-primary" : "text-fg/75 hover:bg-muted hover:text-fg")}
              >
                <n.icon size={17} strokeWidth={1.6} />
                <span className="flex-1">{n.label}</span>
                {"badge" in n && badges[n.badge] > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-2xs font-semibold text-on-primary">{badges[n.badge]}</span>}
              </NavLink>
            ),
          )}
        </nav>
        <div className={cn("mt-auto gap-1 border-t border-border pt-4 text-note lg:grid", open ? "grid" : "hidden")}>
          <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-control px-3 py-2 text-fg/75 hover:bg-muted"><ExternalLink size={15} /> Shop ansehen</a>
          <Form method="post" action="/logout">
            <button className="flex w-full items-center gap-3 rounded-control px-3 py-2 text-fg/75 hover:bg-muted"><LogOut size={15} /> Abmelden</button>
          </Form>
          <p className="truncate px-3 pt-2 text-xs text-muted-fg">{user.email}</p>
          <Link to="/admin/system" className="block px-3 pt-1 text-label text-muted-fg tabular-nums hover:text-fg">v{loaderData.version}</Link>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-6 md:px-10 md:py-8">
        <Outlet />
      </main>
    </div>
  );
}
