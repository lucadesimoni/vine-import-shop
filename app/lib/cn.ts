const DISPLAY = /^(hidden|block|inline|inline-block|flex|inline-flex|grid|inline-grid|contents|table|flow-root)$/;

/**
 * Join class names. Unprefixed display utilities conflict in CSS by stylesheet order, not attribute order,
 * so the last one given wins here (like tailwind-merge): buttonClass(…, "hidden md:inline-flex") really hides on mobile.
 */
export function cn(...parts: (string | false | null | undefined)[]): string {
  const tokens = parts.filter(Boolean).join(" ").split(/\s+/).filter(Boolean);
  let last = -1;
  tokens.forEach((t, i) => DISPLAY.test(t) && (last = i));
  return tokens.filter((t, i) => !DISPLAY.test(t) || i === last).join(" ");
}
