import { getDb } from "~/.server/db";
import { sql } from "drizzle-orm";
import { APP_VERSION } from "~/.server/maintenance";
import { knownMigrations } from "~/.server/db/migrate";

/** Liveness/readiness + version (used by Docker/K8s health checks, uptime monitors and support). */
export async function loader() {
  // the database must answer within 5 s — otherwise 503, so monitors (shopctl, uptime services) see the outage
  try {
    await Promise.race([
      (async () => { const db = await getDb(); await db.execute(sql`select 1`); })(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("database timeout")), 5000)),
    ]);
  } catch (e) {
    return Response.json({ ok: false, version: APP_VERSION, error: (e as Error).message.slice(0, 200), time: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ ok: true, version: APP_VERSION, schema: knownMigrations, time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
