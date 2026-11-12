/** Format integer cents. Swiss style for CHF: CHF 1’234.50 */
export function formatMoney(cents: number, currency = "CHF", locale = "de"): string {
  const tag = currency === "CHF" ? `${locale}-CH` : locale;
  return new Intl.NumberFormat(tag, { style: "currency", currency, minimumFractionDigits: 2 }).format(cents / 100);
}

/** Cash rounding, e.g. step=5 → Swiss 5-Rappen rounding. */
export function roundCash(cents: number, step = 5): number {
  return Math.round(cents / step) * step;
}

export function parseMoneyInput(v: string): number {
  const n = Number(v.replace(/['’\s]/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
