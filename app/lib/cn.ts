/** Utility groups whose members conflict: within a group, the last unprefixed class wins. */
const GROUPS: [string, RegExp][] = [
  ["display", /^(hidden|block|inline|inline-block|flex|inline-flex|grid|inline-grid|contents|table|flow-root)$/],
  ["width", /^w-/],
  ["height", /^h-/],
  ["whitespace", /^whitespace-/],
];

/**
 * Join class names. Conflicting Tailwind utilities are decided by stylesheet order, not attribute order,
 * so for display / width / height the last one given wins here (like tailwind-merge):
 * buttonClass(…, "hidden md:inline-flex") hides on phones, <Input className="w-20"> beats the base w-full.
 * Responsive / state variants (md:, hover:) are never touched.
 */
export function cn(...parts: (string | false | null | undefined)[]): string {
  const tokens = parts.filter(Boolean).join(" ").split(/\s+/).filter(Boolean);
  const last = new Map<string, number>();
  tokens.forEach((t, i) => { for (const [g, re] of GROUPS) if (re.test(t)) last.set(g, i); });
  return tokens.filter((t, i) => GROUPS.every(([g, re]) => !re.test(t) || last.get(g) === i)).join(" ");
}
