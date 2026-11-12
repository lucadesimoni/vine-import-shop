import { describe, expect, it } from "vitest";
import { parseSettings } from "~/lib/settings";
import { decimal, mapArticle, mapPrice, mapStock, pick } from "~/.server/vinx/mapper";
import { decodeUpload, parseCsv } from "~/.server/vinx/csv";

const m = parseSettings("vinx", {}).mapping;

describe("vinX mapper (REST3 field names)", () => {
  it("maps an article record", () => {
    const a = mapArticle({ id: 5000, number: "10679", designation: "Sassella", designationIt: "Sassella IT", producer: { name: "ARPEPE" }, vintage: "2016", contentCl: 75, salesPrice: "41.60", vatCode: "N", wineColor: "Rot", articleType: 2, isShopArticle: true, packagingUnit: 6 }, m);
    expect(a.sku).toBe("10679");
    expect(a.variant.erpId).toBe("5000");
    expect(a.names).toEqual({ de: "Sassella", it: "Sassella IT" });
    expect(a.producer).toBe("ARPEPE");
    expect(a.variant.volumeMl).toBe(750);
    expect(a.variant.priceCents).toBe(4160);
    expect(a.product.color).toBe("red");
    expect(a.kind).toBe("wine");
    expect(a.variant.active).toBe(true);
  });
  it("maps stock and ProductInfo price rows by vinX articleId", () => {
    expect(mapStock({ articleId: 5000, availableQuantity: 42.0 }, m)).toEqual({ ref: "5000", stock: 42 });
    expect(mapPrice({ articleId: 5000, priceGroupId: 2, price: 31.5, quantity: 12 }, m)).toMatchObject({ ref: "5000", list: "2", minQty: 12, netCents: 3150 });
  });
  it("parses Swiss number formats and dot paths", () => {
    expect(decimal("1'234.50")).toBe(1234.5);
    expect(decimal("12,5")).toBe(12.5);
    expect(decimal("CHF 9.90")).toBe(9.9);
    expect(pick({ a: { b: " x " } }, "a.b")).toBe("x");
  });
});

describe("CSV exchange", () => {
  it("auto-detects delimiter and quotes", () => {
    const rows = parseCsv('﻿ArtikelNr;Bezeichnung;Preis\n10679;"Sassella ""Rocce"" Rosse";41,60\n');
    expect(rows).toEqual([{ ArtikelNr: "10679", Bezeichnung: 'Sassella "Rocce" Rosse', Preis: "41,60" }]);
  });
  it("decodes Windows-1252 exports", () => {
    const bytes = new Uint8Array([0x4e, 0x65, 0x72, 0x6f, 0x20, 0x64, 0xe0, 0x76, 0x6f, 0x6c, 0x61]); // "Nero dàvola"
    expect(decodeUpload(bytes.buffer)).toBe("Nero dàvola");
  });
});
