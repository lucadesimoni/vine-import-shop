import { eq, like, sql } from "drizzle-orm";
import { parseSettings, type Settings, type SettingsKey } from "~/lib/settings";
import { getDb, schema } from "./db";

/**
 * Settings are read on every request → small in-process cache, invalidated on save.
 *
 * Storefronts (further shops on their own domains) can override any key except "vinx": the row "<key>@<slug>"
 * replaces the main shop's "<key>" as a whole. Without an override the storefront inherits the main settings,
 * so a new storefront looks like the main shop until its design / settings are changed in the admin.
 */
const cache = new Map<string, { value: unknown; at: number }>();
const TTL = 30_000;
/** keys that a storefront may override (the ERP connection is platform-wide) */
export const SCOPED_KEYS = ["brand", "shop", "home", "trade", "story"] as const satisfies readonly SettingsKey[];
const rowKey = (key: SettingsKey, sf?: string | null) => (sf && (SCOPED_KEYS as readonly string[]).includes(key) ? `${key}@${sf}` : key);

async function readRow(k: string) {
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const db = await getDb();
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, k) });
  cache.set(k, { value: row?.value ?? null, at: Date.now() });
  return row?.value ?? null;
}

export async function getSetting<K extends SettingsKey>(key: K, storefront?: string | null): Promise<Settings[K]> {
  const scoped = rowKey(key, storefront);
  const raw = (scoped !== key ? await readRow(scoped) : null) ?? (await readRow(key));
  return parseSettings(key, raw ?? undefined);
}

export async function getSettings<K extends SettingsKey>(...keys: K[]): Promise<Pick<Settings, K>> {
  return getScopedSettings(null, ...keys);
}

/** getSettings for a storefront (null = main shop). */
export async function getScopedSettings<K extends SettingsKey>(storefront: string | null | undefined, ...keys: K[]): Promise<Pick<Settings, K>> {
  const entries = await Promise.all(keys.map(async (k) => [k, await getSetting(k, storefront)] as const));
  return Object.fromEntries(entries) as Pick<Settings, K>;
}

/** true when the storefront has its own value for the key (else it inherits the main shop's) */
export async function hasOwnSetting(key: SettingsKey, storefront: string) {
  return (await readRow(rowKey(key, storefront))) != null;
}

export async function saveSetting<K extends SettingsKey>(key: K, value: unknown, storefront?: string | null): Promise<Settings[K]> {
  const parsed = parseSettings(key, value);
  const k = rowKey(key, storefront);
  const db = await getDb();
  await db
    .insert(schema.settings)
    .values({ key: k, value: parsed })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: parsed, updatedAt: sql`now()` } });
  cache.delete(k);
  return parsed;
}

/** Drop a storefront override → the storefront inherits the main shop's value again. */
export async function resetSetting(key: SettingsKey, storefront: string) {
  const k = rowKey(key, storefront);
  const db = await getDb();
  await db.delete(schema.settings).where(eq(schema.settings.key, k));
  cache.delete(k);
}

/** Remove all overrides of a storefront (when it is deleted). */
export async function dropStorefrontSettings(storefront: string) {
  const db = await getDb();
  await db.delete(schema.settings).where(like(schema.settings.key, `%@${storefront}`));
  for (const k of cache.keys()) if (k.endsWith(`@${storefront}`)) cache.delete(k);
}
