import { describe, expect, it } from "vitest";
import { canResize, mediaUrl, responsive } from "~/lib/media";

describe("responsive content images", () => {
  it("resizes own images only — no open image proxy", () => {
    expect(canResize("/demo/hero.jpg")).toBe(true);
    expect(canResize("https://ref.supabase.co/storage/v1/object/public/media/a.jpg", ["https://ref.supabase.co"])).toBe(true);
    expect(canResize("https://evil.example.com/a.jpg", ["https://ref.supabase.co"])).toBe(false);
    expect(canResize("//evil.example.com/a.jpg")).toBe(false);
    expect(canResize("/../.env")).toBe(false);
    expect(canResize("/media/img?src=x")).toBe(false); // no loops
    expect(canResize("/logo.svg")).toBe(false); // vector: as is
    expect(canResize("/uploads/img/wine-abc.webp")).toBe(false); // already optimised product image
  });
  it("builds a srcset up to the given maximum width", () => {
    const r = responsive("/demo/a.jpg", [], 828);
    expect(r.src).toBe(mediaUrl("/demo/a.jpg", 828));
    expect(r.srcSet?.split(", ")).toHaveLength(4); // 320, 480, 640, 828
    expect(responsive("https://elsewhere.com/a.jpg")).toEqual({ src: "https://elsewhere.com/a.jpg", srcSet: undefined });
  });
});
