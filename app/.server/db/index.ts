import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

/**
 * One schema, two engines:
 *  - DATABASE_URL=postgres://…  → postgres.js (production; any Postgres incl. managed/serverless)
 *  - empty                       → PGlite, embedded Postgres in ./data/db (demo, dev, small single-server)
 * Migrations in ./drizzle are applied automatically on first use.
 */
export type DB = ReturnType<typeof drizzlePg<typeof schema>>;

let dbPromise: Promise<DB> | undefined;

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL?.trim();
  const migrationsFolder = process.env.MIGRATIONS_DIR ?? `${process.cwd()}/drizzle`;

  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const { default: postgres } = await import("postgres");
    const client = postgres(url, { max: Number(process.env.DB_POOL ?? 10), prepare: false });
    const db = drizzlePg(client, { schema });
    await migratePg(db, { migrationsFolder });
    return db;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const dir = url?.replace(/^pglite:/, "") || `${process.cwd()}/data/db`;
  if (dir !== "memory") {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
  }
  const client = dir === "memory" ? new PGlite() : new PGlite(dir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
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
