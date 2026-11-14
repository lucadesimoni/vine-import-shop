/**
 * Admin roles. "admin": everything. "staff": daily work (orders, products, producers, customers, conditions, content)
 * — no shop-wide configuration, integrations, system or team management. Enforced in the admin middleware.
 */
export const ADMIN_ONLY = ["/admin/settings", "/admin/design", "/admin/storefronts", "/admin/integrations", "/admin/system", "/admin/team"] as const;

export const canAccess = (role: string, path: string) =>
  role === "admin" || (role === "staff" && !ADMIN_ONLY.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}.`)));

export const ROLE_LABELS: Record<string, string> = { admin: "Administrator", staff: "Mitarbeiter" };
