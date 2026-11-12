import { describe, expect, it } from "vitest";
import { renderMarkdown } from "~/lib/markdown";
import { tl } from "~/lib/localized";
import { parseSettings } from "~/lib/settings";
import { themeCss } from "~/lib/theme";
import { slugify } from "~/lib/slug";

describe("content & white-label", () => {
  it("escapes HTML in markdown and renders the safe subset", () => {
    const html = renderMarkdown("## Titel\n\n<script>x</script> **fett** [Link](https://a.ch)\n\n- a\n- b");
    expect(html).toContain("<h3>Titel</h3>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<strong>fett</strong>");
    expect(html).toContain('<a href="https://a.ch">Link</a>');
    expect(html).toContain("<ul><li>a</li><li>b</li></ul>");
  });
  it("blocks javascript: links", () => {
    expect(renderMarkdown("[x](javascript:alert(1))")).not.toContain("href");
  });
  it("localized fallback", () => {
    expect(tl({ de: "Hallo", it: "Ciao" }, "it")).toBe("Ciao");
    expect(tl({ de: "Hallo" }, "fr")).toBe("Hallo");
    expect(tl(undefined, "de")).toBe("");
  });
  it("brand defaults are neutral and theme CSS is sanitised", () => {
    const brand = parseSettings("brand", {});
    expect(brand.name).toBe("Your Shop");
    const css = themeCss({ ...brand, name: "x" });
    expect(css.startsWith(":root{")).toBe(true);
    expect(css).not.toMatch(/[<>]/);
  });
  it("invalid settings fall back to defaults", () => {
    expect(parseSettings("shop", { priceVisibility: "nonsense" }).priceVisibility).toBe("public");
  });
  it("slugify", () => {
    expect(slugify("Käse & Butter — Spezialität")).toBe("kaese-butter-spezialitaet");
  });
});
