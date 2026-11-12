import { eq, sql } from "drizzle-orm";
import { parseSettings, type Settings, type SettingsKey } from "~/lib/settings";
import { getDb, schema } from "./db";

/** Settings are read on every request → small in-process cache, invalidated on save. */
const cache = new Map<SettingsKey, { value: unknown; at: number }>();
const TTL = 30_000;

export async function getSetting<K extends SettingsKey>(key: K): Promise<Settings[K]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as Settings[K];
  const db = await getDb();
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, key) });
  const value = parseSettings(key, row?.value);
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function getSettings<K extends SettingsKey>(...keys: K[]): Promise<Pick<Settings, K>> {
  const entries = await Promise.all(keys.map(async (k) => [k, await getSetting(k)] as const));
  return Object.fromEntries(entries) as Pick<Settings, K>;
}

export async function saveSetting<K extends SettingsKey>(key: K, value: unknown): Promise<Settings[K]> {
  const parsed = parseSettings(key, value);
  const db = await getDb();
  await db
    .insert(schema.settings)
    .values({ key, value: parsed })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: parsed, updatedAt: sql`now()` } });
  cache.delete(key);
  return parsed;
}
