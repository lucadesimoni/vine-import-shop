import { createHash } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { getDb, schema } from "./db";

/**
 * Rate limits in the database, so they hold across all instances (Vercel runs several; an attacker could otherwise
 * spread attempts). Keys are stored hashed (no IPs or e-mail addresses in the table). One upsert per call.
 */
const hash = (k: string) => createHash("sha256").update(k).digest("hex");

/**
 * Client IP that a client cannot forge: Vercel sets x-vercel-forwarded-for / overwrites x-forwarded-for; behind
 * Caddy / nginx the proxy appends the real address as the LAST entry (earlier entries may come from the client).
 */
export function clientIp(request: Request) {
  const h = request.headers;
  const vercel = h.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",").at(-1)!.trim();
  return h.get("x-real-ip") ?? "local";
}

/** current count within the window, without counting (0 if expired / unknown) */
export async function attempts(key: string) {
  const db = await getDb();
  const r = await db.select({ count: schema.rateLimits.count, resetAt: schema.rateLimits.resetAt }).from(schema.rateLimits).where(sql`${schema.rateLimits.key} = ${hash(key)}`);
  return r[0] && r[0].resetAt > new Date() ? r[0].count : 0;
}

/** count one attempt; returns the new count within the window */
export async function hit(key: string, windowMs = 10 * 60_000) {
  const db = await getDb();
  const until = new Date(Date.now() + windowMs);
  const t = schema.rateLimits;
  const [r] = await db.insert(t).values({ key: hash(key), count: 1, resetAt: until })
    .onConflictDoUpdate({
      target: t.key,
      set: {
        count: sql`case when ${t.resetAt} < now() then 1 else ${t.count} + 1 end`,
        resetAt: sql`case when ${t.resetAt} < now() then ${until.toISOString()}::timestamptz else ${t.resetAt} end`,
      },
    })
    .returning({ count: t.count });
  // housekeeping now and then: drop windows that ended a day ago
  if (Math.random() < 0.02) await db.delete(t).where(lt(t.resetAt, new Date(Date.now() - 864e5)));
  return r.count;
}

export async function clear(key: string) {
  const db = await getDb();
  await db.delete(schema.rateLimits).where(sql`${schema.rateLimits.key} = ${hash(key)}`);
}

/** true when `key` reached `max` attempts in the current window */
export const limited = async (key: string, max = 8) => (await attempts(key)) >= max;
