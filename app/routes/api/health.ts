import { getDb } from "~/.server/db";
import { sql } from "drizzle-orm";
import { APP_VERSION } from "~/.server/maintenance";
import { knownMigrations } from "~/.server/db/migrate";

/** Liveness/readiness + version (used by Docker/K8s health checks, uptime monitors and support). */
export async function loader() {
  const db = await getDb();
  await db.execute(sql`select 1`);
  return Response.json({ ok: true, version: APP_VERSION, schema: knownMigrations, time: new Date().toISOString() });
}
