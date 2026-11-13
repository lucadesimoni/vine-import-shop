import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), "img-"));

describe("image optimizer", () => {
  it("turns a photo into WebP in 1200 and 480 px, much smaller", async () => {
    const { optimizeImage, isOptimized, thumbOf } = await import("~/.server/images");
    const sharp = (await import("sharp")).default;
    const r = await optimizeImage("/demo/desimoni/formaggi.jpg", "Formaggi & Co.");
    expect(r.url).toMatch(/^\/uploads\/img\/formaggi-co-[0-9a-f]{10}\.webp$/);
    expect(isOptimized(r.url)).toBe(true);
    expect(r.after).toBeLessThan(r.before);
    const full = await sharp(readFileSync(join(process.env.UPLOAD_DIR!, r.url.replace("/uploads/", "")))).metadata();
    const thumb = await sharp(readFileSync(join(process.env.UPLOAD_DIR!, thumbOf(r.url).replace("/uploads/", "")))).metadata();
    expect(full.format).toBe("webp");
    expect(Math.max(full.width!, full.height!)).toBeLessThanOrEqual(1200);
    expect(Math.max(thumb.width!, thumb.height!)).toBeLessThanOrEqual(480);
  });
  it("rejects sources it cannot read", async () => {
    const { optimizeImage } = await import("~/.server/images");
    await expect(optimizeImage("ftp://example.com/x.jpg", "x")).rejects.toThrow();
    await expect(optimizeImage("/demo/does-not-exist.jpg", "x")).rejects.toThrow();
  });
});
