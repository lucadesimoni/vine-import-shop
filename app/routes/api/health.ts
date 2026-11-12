import { getDb } from "~/.server/db";
import { sql } from "drizzle-orm";

export async function loader() {
  const db = await getDb();
  await db.execute(sql`select 1`);
  return Response.json({ ok: true, time: new Date().toISOString() });
}
