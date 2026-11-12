import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import journal from "../../../drizzle/meta/_journal.json";

/**
 * Migrations bundled into the server build (works on serverless hosts like Vercel, where the
 * ./drizzle folder is not shipped). Bookkeeping is identical to drizzle-kit's migrator
 * (drizzle.__drizzle_migrations: sha256 of the SQL file + journal timestamp), so existing
 * databases migrated by drizzle continue seamlessly.
 */
type Executor = { execute(q: ReturnType<typeof sql.raw>): Promise<unknown>; transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T> };

async function migrationFiles(): Promise<Record<string, string>> {
  // Vite (build, dev, vitest) defines import.meta.env statically and inlines the glob at build time
  if (import.meta.env) {
    const files = import.meta.glob("../../../drizzle/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    return Object.fromEntries(Object.entries(files).map(([p, c]) => [p.split("/").pop()!.replace(/\.sql$/, ""), c]));
  }
  // Plain Node/tsx scripts: read from disk
  const { readFileSync } = await import("node:fs");
  const dir = process.env.MIGRATIONS_DIR ?? `${process.cwd()}/drizzle`;
  return Object.fromEntries(journal.entries.map((e) => [e.tag, readFileSync(`${dir}/${e.tag}.sql`, "utf8")]));
}

/** Latest migration this app version knows (journal timestamp). */
export const latestKnownMigration = Math.max(...journal.entries.map((e) => e.when));
export const knownMigrations = journal.entries.length;

export class SchemaTooNewError extends Error {}

export async function runMigrations(db: Executor, hooks: { beforeApply?: (pending: string[], appliedBefore: number) => Promise<void> } = {}) {
  const files = await migrationFiles();
  await db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS "drizzle"`));
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`));
  const res = (await db.execute(sql.raw(`SELECT created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`))) as { rows?: { created_at: string }[] } | { created_at: string }[];
  const rows = Array.isArray(res) ? res : (res.rows ?? []);
  const last = rows[0] ? Number(rows[0].created_at) : 0;
  // Downgrade guard: never run an older app against a schema it doesn't know.
  if (last > latestKnownMigration) {
    throw new SchemaTooNewError("The database was upgraded by a newer version of the shop. Start that newer version again, or restore the backup taken before the update (see docs/UPDATING.md).");
  }
  const pending = journal.entries.filter((e) => e.when > last);
  if (pending.length && hooks.beforeApply) {
    const applied = (await db.execute(sql.raw(`SELECT count(*)::int AS n FROM "drizzle"."__drizzle_migrations"`))) as { rows?: { n: number }[] } | { n: number }[];
    const n = Number((Array.isArray(applied) ? applied : (applied.rows ?? []))[0]?.n ?? 0);
    await hooks.beforeApply(pending.map((e) => e.tag), n);
  }
  for (const e of pending) {
    const content = files[e.tag];
    if (content == null) throw new Error(`migration ${e.tag} missing from bundle`);
    const hash = createHash("sha256").update(content).digest("hex");
    await db.transaction(async (tx) => {
      for (const stmt of content.split("--> statement-breakpoint")) if (stmt.trim()) await tx.execute(sql.raw(stmt));
      await tx.execute(sql.raw(`INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('${hash}', ${e.when})`));
    });
  }
}
