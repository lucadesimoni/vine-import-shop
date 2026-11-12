import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import * as schema from "./schema";
import { runMigrations } from "./migrate";

/**
 * One schema, two engines:
 *  - DATABASE_URL=postgres://…  → postgres.js (production; any Postgres incl. managed/serverless)
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
  const { createBackup } = await import("../maintenance");
  try {
    const b = await createBackup(`pre-update-${pending[0]}`);
    console.log(`[db] backup before migrating (${pending.join(", ")}): ${b.name}`);
  } catch (e) {
    if (process.env.MIGRATE_WITHOUT_BACKUP !== "1") throw new Error(`Backup before migration failed (${(e as Error).message}). Fix it or set MIGRATE_WITHOUT_BACKUP=1 if your provider takes snapshots.`);
    console.warn("[db] migrating without backup (MIGRATE_WITHOUT_BACKUP=1)");
  }
};

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL?.trim();

  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const { default: postgres } = await import("postgres");
    const client = postgres(url, { max: Number(process.env.DB_POOL ?? 10), prepare: false });
    const db = drizzlePg(client, { schema });
    info = { kind: "postgres", url };
    await runMigrations(db as never, { beforeApply });
    return db;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  // Serverless (Vercel) without DATABASE_URL: ephemeral demo database in /tmp (resets on cold start).
  const fallback = process.env.VERCEL ? "/tmp/shop-db" : `${process.cwd()}/data/db`;
  if (process.env.VERCEL && !url) console.warn("[db] No DATABASE_URL — running an ephemeral demo database. Add Postgres (e.g. Neon via Vercel Marketplace) for persistence.");
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
  // Same query API for both drivers.
  return db as unknown as DB;
}

export function getDb(): Promise<DB> {
  dbPromise ??= connect().then(async (db) => {
    const { ensureSeeded } = await import("../seed");
    await ensureSeeded(db);
    return db;
  });
  dbPromise.catch(() => (dbPromise = undefined));
  return dbPromise;
}

export { schema };
