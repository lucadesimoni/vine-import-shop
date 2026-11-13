import type { SettingsKey } from "~/lib/settings";
import { hasOwnSetting, resetSetting } from "./settings";
import { listStorefronts } from "./storefronts";

/**
 * Admin editors (design, settings, content) work on the main shop or on one storefront: `?sf=<slug>`.
 * Forms post to the same URL, so loader and action see the same scope.
 */
export async function adminScope(request: Request, keys: SettingsKey[]) {
  const list = await listStorefronts();
  const asked = new URL(request.url).searchParams.get("sf");
  const sf = list.find((s) => s.slug === asked) ?? null;
  const own = sf ? Object.fromEntries(await Promise.all(keys.map(async (k) => [k, await hasOwnSetting(k, sf.slug)] as const))) : {};
  return {
    /** slug for getScopedSettings / saveSetting (null = main shop) */
    slug: sf?.slug ?? null,
    storefront: sf ? { id: sf.id, slug: sf.slug, name: sf.name } : null,
    scope: {
      current: sf?.slug ?? null,
      storefronts: list.map((s) => ({ slug: s.slug, name: s.name })),
      /** per key: true = the storefront has its own value, false = it inherits the main shop's */
      own: own as Partial<Record<SettingsKey, boolean>>,
    },
  };
}

/** intent "scope-reset": drop the storefront's overrides of these keys (inherit the main shop again) */
export async function resetScope(slug: string | null, keys: SettingsKey[]) {
  if (!slug) return false;
  await Promise.all(keys.map((k) => resetSetting(k, slug)));
  return true;
}

export type AdminScope = Awaited<ReturnType<typeof adminScope>>["scope"];
