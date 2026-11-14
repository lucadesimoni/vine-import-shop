import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { editKey, isNoEdit, NO_EDIT, parseEdit } from "~/lib/image-edit";
import { contentBox, cutout, renderEdit, straightenSize } from "~/.server/image-edit";

process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), "imgedit-"));

/** 200×100 white picture with a red 60×80 "bottle" at x 70–130, y 10–90 and a white 20×20 "label" inside it */
function bottle() {
  const w = 200, h = 100, d = Buffer.alloc(w * h * 4, 255);
  for (let y = 10; y < 90; y++) for (let x = 70; x < 130; x++) {
    const i = (y * w + x) * 4;
    const label = x >= 90 && x < 110 && y >= 40 && y < 60;
    d[i] = 255; d[i + 1] = label ? 255 : 20; d[i + 2] = label ? 255 : 30;
  }
  return { data: d, width: w, height: h };
}
const alphaAt = (r: { data: Buffer; width: number }, x: number, y: number) => r.data[(y * r.width + x) * 4 + 3];
async function png(r: { data: Buffer; width: number; height: number }) {
  const sharp = (await import("sharp")).default;
  return new Uint8Array(await sharp(r.data, { raw: { width: r.width, height: r.height, channels: 4 } }).png().toBuffer());
}

describe("image edit parameters", () => {
  it("sanitises untrusted input", () => {
    const e = parseEdit({ rotate: 45, straighten: 99, ratio: "16:9", padding: -3, background: "red", tolerance: 500, crop: { x: 0.5, y: 0.5, w: 2, h: 2 }, cutout: "yes" });
    expect(e.rotate).toBe(0);
    expect(e.straighten).toBe(15);
    expect(e.ratio).toBe("original");
    expect(e.padding).toBe(0);
    expect(e.background).toBe("transparent");
    expect(e.tolerance).toBe(60);
    expect(e.cutout).toBe(false);
    expect(e.crop).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 }); // clipped to the image
    expect(parseEdit({ crop: { x: 0, y: 0, w: 1, h: 1 } }).crop).toBeNull(); // full frame = no crop
    expect(parseEdit({ background: "#AABBCC" }).background).toBe("#aabbcc");
  });
  it("knows when nothing is edited, and keys ignore the auto flag", () => {
    expect(isNoEdit(NO_EDIT)).toBe(true);
    expect(isNoEdit({ ...NO_EDIT, trim: true })).toBe(false);
    expect(editKey({ ...NO_EDIT, auto: true })).toBe(editKey(NO_EDIT));
  });
  it("straighten keeps the largest rectangle without empty corners", () => {
    expect(straightenSize(1000, 1000, 0)).toEqual({ width: 1000, height: 1000 });
    const s = straightenSize(1000, 500, 5);
    expect(s.width).toBeLessThan(1000);
    expect(s.width / s.height).toBeCloseTo(2, 1); // ratio kept
  });
});

describe("cut-out and trim", () => {
  it("removes the background connected to the border but keeps white details inside the product", () => {
    const r = cutout(bottle(), 10)!;
    expect(alphaAt(r, 5, 5)).toBe(0); // background
    expect(alphaAt(r, 100, 20)).toBe(255); // bottle
    expect(alphaAt(r, 100, 50)).toBe(255); // white label inside the bottle stays
  });
  it("refuses when everything would be removed (no even background)", () => {
    const blank = { data: Buffer.alloc(40 * 40 * 4, 255), width: 40, height: 40 };
    expect(cutout(blank, 10)).toBeNull();
  });
  it("finds the product's bounding box", () => {
    expect(contentBox(bottle(), 10)).toEqual({ left: 70, top: 10, width: 60, height: 80 });
  });
});

describe("render pipeline", () => {
  it("turns, trims and places the product on a canvas of the chosen ratio with padding", async () => {
    const input = await png(bottle());
    const turned = await (await renderEdit(input, { ...NO_EDIT, rotate: 90 })).metadata();
    expect([turned.width, turned.height]).toEqual([100, 200]);
    const out = await renderEdit(input, { ...NO_EDIT, trim: true, ratio: "1:1", padding: 10, background: "white" });
    const m = await out.metadata();
    expect(m.width).toBe(m.height); // 1:1
    expect(m.height).toBe(Math.ceil(80 / 0.8)); // 80 px product + 10 % padding top and bottom
    const { data, info } = await out.raw().toBuffer({ resolveWithObject: true });
    expect([...data.subarray(0, 4)]).toEqual([255, 255, 255, 255]); // white canvas corner
    expect(info.channels).toBe(4);
  });
  it("crops relative to the oriented image", async () => {
    const out = await renderEdit(await png(bottle()), { ...NO_EDIT, crop: { x: 0.25, y: 0, w: 0.5, h: 1 } });
    const m = await out.metadata();
    expect([m.width, m.height]).toEqual([100, 100]);
  });
  it("an edited image gets its own file; an opaque result has no alpha channel", async () => {
    const { optimizeImage } = await import("~/.server/images");
    const plain = await optimizeImage("/demo/desimoni/formaggi.jpg", "Formaggi");
    const edited = await optimizeImage("/demo/desimoni/formaggi.jpg", "Formaggi", { ...NO_EDIT, ratio: "1:1", background: "white", padding: 5 });
    expect(edited.url).not.toBe(plain.url);
    const sharp = (await import("sharp")).default;
    const { readFileSync } = await import("node:fs");
    const meta = await sharp(readFileSync(join(process.env.UPLOAD_DIR!, edited.url.replace("/uploads/", "")))).metadata();
    expect(meta.width).toBe(meta.height);
    expect(meta.hasAlpha).toBe(false);
  });
});
