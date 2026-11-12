import { Form, Link, NavLink, Outlet, redirect } from "react-router";
import { ExternalLink, Grape, Percent, ShieldCheck, FileText, LayoutDashboard, LogOut, Package, Palette, PlugZap, Settings, ShoppingCart, Users } from "lucide-react";
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
  { to: "/admin/integrations", label: "vinX ERP", icon: PlugZap, badge: "integrations" },
  { to: "/admin/system", label: "System & Backups", icon: ShieldCheck },
] as const;

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { brand } = useRootData();
  const { user, badges } = loaderData;
  return (
    <div className="min-h-screen bg-bg lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="flex flex-col gap-6 border-b border-border bg-surface px-4 py-5 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 px-2">
          {brand.logoUrl ? <img src={brand.logoUrl} alt="" className="h-8 w-auto" /> : <span className="grid h-8 w-8 place-items-center rounded-control bg-primary text-on-primary">{brand.name[0]}</span>}
          <div className="grid leading-tight">
            <span className="font-display text-lg">{brand.name}</span>
            <span className="text-eyebrow text-[9px] text-muted-fg">Admin</span>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto lg:grid lg:content-start">
          {NAV.map((n, i) =>
            "section" in n ? (
              <p key={i} className="text-eyebrow mt-4 hidden px-3 text-[9px] text-muted-fg lg:block">{n.section}</p>
            ) : (
              <NavLink
                key={n.to}
                to={n.to}
                end={"end" in n}
                className={({ isActive }) => cn("flex shrink-0 items-center gap-3 rounded-control px-3 py-2 text-[14px] transition-colors", isActive ? "bg-primary-soft font-medium text-primary" : "text-fg/75 hover:bg-muted hover:text-fg")}
              >
                <n.icon size={17} strokeWidth={1.6} />
                <span className="flex-1">{n.label}</span>
                {"badge" in n && badges[n.badge] > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-on-primary">{badges[n.badge]}</span>}
              </NavLink>
            ),
          )}
        </nav>
        <div className="mt-auto hidden gap-1 border-t border-border pt-4 text-[13px] lg:grid">
          <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-control px-3 py-2 text-fg/75 hover:bg-muted"><ExternalLink size={15} /> Shop ansehen</a>
          <Form method="post" action="/logout">
            <button className="flex w-full items-center gap-3 rounded-control px-3 py-2 text-fg/75 hover:bg-muted"><LogOut size={15} /> Abmelden</button>
          </Form>
          <p className="truncate px-3 pt-2 text-[12px] text-muted-fg">{user.email}</p>
          <Link to="/admin/system" className="block px-3 pt-1 text-[11px] text-muted-fg tabular-nums hover:text-fg">v{loaderData.version}</Link>
        </div>
      </aside>
      <main className="min-w-0 px-6 py-8 md:px-10">
        <Outlet />
      </main>
    </div>
  );
}
