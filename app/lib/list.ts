/** URL-driven list state for admin tables (built by .server/admin-list.ts). */
export type ListMeta = { q: string; sort: string; dir: "asc" | "desc"; page: number; perPage: number; total: number; pages: number };
