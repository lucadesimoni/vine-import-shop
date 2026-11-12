import { asc, desc, sql, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * Shared list behaviour for admin tables: search, sort, paging — driven by URL params
 * (?q=…&sort=name&dir=desc&page=2), so every view is linkable and survives reloads.
 *
 *   const list = listParams(request, { sorts: { name: schema.producers.name, products: sql`…` }, defaultSort: "name" });
 *   db.select()…orderBy(...list.orderBy).limit(list.limit).offset(list.offset)
 *   return { …, list: list.meta(total) }
 */
import type { ListMeta } from "~/lib/list";
export type { ListMeta };

export function listParams<T extends Record<string, AnyColumn | SQL>>(
  request: Request,
  opts: { sorts: T; defaultSort: keyof T & string; defaultDir?: "asc" | "desc"; perPage?: number },
) {
  type S = keyof T & string;
  const p = new URL(request.url).searchParams;
  const q = (p.get("q") ?? "").trim().slice(0, 120);
  const sort = (Object.keys(opts.sorts).includes(p.get("sort") ?? "") ? p.get("sort") : opts.defaultSort) as S;
  const dir = p.get("dir") === "asc" || p.get("dir") === "desc" ? (p.get("dir") as "asc" | "desc") : (opts.defaultDir ?? "asc");
  const perPage = Math.min(200, Math.max(10, Number(p.get("per")) || opts.perPage || 50));
  const page = Math.max(1, Number(p.get("page")) || 1);
  const col = opts.sorts[sort];
  return {
    q, sort, dir, page, perPage,
    /** ilike pattern for the search term ('' → undefined) */
    like: q ? `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : undefined,
    limit: perPage,
    offset: (page - 1) * perPage,
    orderBy: [dir === "asc" ? asc(col) : desc(col)] as SQL[],
    meta: (total: number): ListMeta => ({ q, sort, dir, page, perPage, total, pages: Math.max(1, Math.ceil(total / perPage)) }),
  };
}

/** count(*) over the same filter: `db.select({ n: countAll }).from(t).where(w)` */
export const countAll = sql<number>`count(*)::int`;

/** Parse the ids of a bulk-action form (checkboxes named "ids"). */
export const bulkIds = (form: FormData) => form.getAll("ids").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 1000);
