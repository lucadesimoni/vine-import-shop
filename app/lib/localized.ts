export const LOCALES = ["de", "it", "fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export type Localized = Partial<Record<Locale, string>>;

export const LOCALE_LABELS: Record<Locale, string> = { de: "Deutsch", it: "Italiano", fr: "Français", en: "English" };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/** Resolve translated content: requested locale → fallback locale → first non-empty value. */
export function tl(value: Localized | null | undefined, locale: Locale, fallback: Locale = "de"): string {
  if (!value) return "";
  return value[locale] || value[fallback] || Object.values(value).find(Boolean) || "";
}
