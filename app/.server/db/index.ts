import { sql } from "drizzle-orm";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import * as schema from "./schema";
import { runMigrations } from "./migrate";

/**
 * One schema, two engines:
 *  - DATABASE_URL=postgres://…  → postgres.js (production; any Postgres incl. managed/serverless)
 *    (POSTGRES_URL, set by the Vercel ↔ Supabase/Neon integrations, is used when DATABASE_URL is empty)
 *  - empty                       → PGlite, embedded Postgres in ./data/db (demo, dev, small single-server)
 * Migrations (./drizzle, bundled into the build) are applied automatically on first use.
 */
export type DB = ReturnType<typeof drizzlePg<typeof schema>>;

/** Connection facts used by backups / the admin system page. */
export type DbInfo = { kind: "embedded"; dir: string; client: import("@electric-sql/pglite").PGlite } | { kind: "postgres"; url: string };
let info: DbInfo | undefined;
export const dbInfo = () => info;

let dbPromise: Promise<DB> | undefined;

/** Before applying migrations to an existing database: take a backup (rollback point). */
const beforeApply = async (pending: string[], appliedBefore: number) => {
  if (!appliedBefore) return; // fresh database — nothing to protect
  // Serverless has no pg_dump and no lasting disk: the managed database's own backups are the rollback point
  // (Supabase: daily backups / point-in-time recovery; Neon: branches / history).
  if (process.env.VERCEL && dbInfo()?.kind === "postgres") return console.warn(`[db] migrating ${pending.join(", ")} — rollback point: the database provider's backups`);
  const { createBackup } = await import("../maintenance");
  try {
    const b = await createBackup(`pre-update-${pending[0]}`);
    console.log(`[db] backup before migrating (${pending.join(", ")}): ${b.name}`);
  } catch (e) {
    if (process.env.MIGRATE_WITHOUT_BACKUP !== "1") throw new Error(`Backup before migration failed (${(e as Error).message}). Fix it or set MIGRATE_WITHOUT_BACKUP=1 if your provider takes snapshots.`);
    console.warn("[db] migrating without backup (MIGRATE_WITHOUT_BACKUP=1)");
  }
};

/**
 * Connection URL → postgres.js options. Integration URLs carry extra query parameters (e.g. `supa=…`,
 * `pgbouncer=true`) that a server would reject as startup parameters: only `sslmode` is interpreted.
 */
export function pgOptions(raw: string) {
  const u = new URL(raw);
  const mode = u.searchParams.get("sslmode");
  const local = /^(localhost|127\.|postgres$|db$|\[?::1)/.test(u.hostname) || !u.hostname.includes(".");
  const ssl = mode === "disable" ? false : mode === "verify-full" ? ("verify-full" as const) : mode || !local ? ("require" as const) : false;
  u.search = "";
  return { url: u.toString(), ssl };
}

/** serialises migrations + first seed across instances (several serverless instances start at once) */
const INIT_LOCK = 727_274_001;

async function connect(): Promise<DB> {
  const url = (process.env.DATABASE_URL || process.env.POSTGRES_URL)?.trim();

  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const { default: postgres } = await import("postgres");
    const { url: clean, ssl } = pgOptions(url);
    // prepare: false — works behind transaction poolers (Supabase Supavisor, PgBouncer, Neon pooler)
    const client = postgres(clean, {
      max: Number(process.env.DB_POOL ?? (process.env.VERCEL ? 5 : 10)), prepare: false, ssl,
      idle_timeout: process.env.VERCEL ? 20 : undefined, connect_timeout: 15,
    });
    const db = drizzlePg(client, { schema });
    info = { kind: "postgres", url };
    // one transaction with an advisory lock: concurrent instances wait instead of migrating/seeding twice,
    // and an interrupted first seed leaves nothing half done
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${INIT_LOCK})`);
      await runMigrations(tx as never, { beforeApply });
      const { ensureSeeded } = await import("../seed");
      await ensureSeeded(tx as never);
    });
    return db;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  // Serverless (Vercel) without DATABASE_URL: ephemeral demo database in /tmp (resets on cold start).
  const fallback = process.env.VERCEL ? "/tmp/shop-db" : `${process.cwd()}/data/db`;
  if (process.env.VERCEL && !url) console.warn("[db] No DATABASE_URL — running an ephemeral demo database. Add Postgres (e.g. Supabase, region Zurich, via the Vercel Marketplace) for persistence.");
  const dir = url?.replace(/^pglite:/, "") || fallback;
  if (dir !== "memory") {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
  }
  if (dir !== "memory") await (await import("../maintenance")).applyPendingRestore(dir);
  const client = dir === "memory" ? new PGlite() : new PGlite(dir);
  const db = drizzlePglite(client, { schema });
  info = { kind: "embedded", dir, client };
  await runMigrations(db as never, { beforeApply });
  const { ensureSeeded } = await import("../seed");
  await ensureSeeded(db as never);
  // Same query API for both drivers.
  return db as unknown as DB;
}

export function getDb(): Promise<DB> {
  dbPromise ??= connect();
  dbPromise.catch(() => (dbPromise = undefined));
  return dbPromise;
}

export { schema };
