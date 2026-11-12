import { describe, expect, it } from "vitest";
import { sanitizeBlocks, homeBlocks } from "~/.server/blocks";
import { BLOCKS, newBlock } from "~/lib/blocks";
import { parseSettings } from "~/lib/settings";

describe("page builder blocks", () => {
  it("every block type has defaults that survive sanitising", () => {
    for (const def of BLOCKS) {
      const [b] = sanitizeBlocks([newBlock(def)]);
      expect(b.type).toBe(def.type);
      for (const f of def.fields) expect(b.data).toHaveProperty(f.key);
    }
  });

  it("drops unknown block types and duplicate ids", () => {
    const out = sanitizeBlocks([{ id: "a", type: "text", enabled: true, data: {} }, { id: "a", type: "text", enabled: true, data: {} }, { id: "b", type: "evil", enabled: true, data: {} }]);
    expect(out.map((b) => b.id)).toEqual(["a"]);
  });

  it("neutralises unsafe links and images", () => {
    const [b] = sanitizeBlocks([{ id: "c", type: "cta", enabled: true, data: { buttonHref: "javascript:alert(1)", title: { de: "x" } } }]);
    expect(b.data.buttonHref).toBe("");
    const [h] = sanitizeBlocks([{ id: "h", type: "hero", enabled: true, data: { image: "data:image/svg+xml,<svg onload=alert(1)>", primaryHref: "//evil.example", secondaryHref: "/shop?promo=1" } }]);
    expect(h.data.image).toBe("");
    expect(h.data.primaryHref).toBe("");
    expect(h.data.secondaryHref).toBe("/shop?promo=1");
  });

  it("keeps only known locales and select options", () => {
    const [b] = sanitizeBlocks([{ id: "t", type: "text", enabled: false, data: { title: { de: "Hallo", xx: "nope" }, width: "huge" } }]);
    expect(b.enabled).toBe(false);
    expect(b.data.title).toEqual({ de: "Hallo" });
    expect(b.data.width).toBe("narrow");
  });

  it("converts the classic home page into blocks", () => {
    const blocks = homeBlocks(parseSettings("home", {}));
    expect(blocks[0].type).toBe("hero");
    expect(blocks.map((b) => b.type)).toEqual(expect.arrayContaining(["categories", "products", "imageText", "brands"]));
  });
});
