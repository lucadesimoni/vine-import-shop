/**
 * Search terms: lower case, without accents and apostrophes, split into words.
 * "Sant'Agata Rosé" → ["santagata", "rose"]. The database side normalises the same way (catalog.ts, translate()).
 */
export function searchTokens(q: string): string[] {
  return q
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`´]/g, "")
    .replace(/[%_\\]/g, " ")
    .split(/[\s\-,;/+.]+/)
    .filter(Boolean)
    .slice(0, 8);
}

/**
 * Patterns that tolerate one typo in a word of 5+ letters: one letter missing ("proseco" → prosecco),
 * one letter wrong ("barbaresko"), or one extra ("nebbbiolo"). Used only when the exact search finds nothing.
 */
export function typoPatterns(token: string): string[] {
  if (token.length < 5) return [`%${token}%`];
  const out = new Set<string>();
  for (let i = 1; i < token.length; i++) out.add(`%${token.slice(0, i)}%${token.slice(i)}%`); // missing letter
  for (let i = 0; i < token.length; i++) out.add(`%${token.slice(0, i)}_${token.slice(i + 1)}%`); // wrong letter
  for (let i = 1; i < token.length - 1; i++) out.add(`%${token.slice(0, i)}${token.slice(i + 1)}%`); // extra letter
  return [...out];
}

/** characters folded by the database expression: accents → base letter, "-" → space, apostrophes removed */
export const FOLD_FROM = "àáâäãåèéêëìíîïòóôöõùúûüçñ-'’`´";
export const FOLD_TO = "aaaaaaeeeeiiiiooooouuuucn ";
