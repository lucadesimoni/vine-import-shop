import { describe, expect, it } from "vitest";
import { parseSettings } from "~/lib/settings";
import { decimal, mapArticle, mapPrice, mapStock, pick } from "~/.server/vinx/mapper";
import { decodeUpload, parseCsv } from "~/.server/vinx/csv";

const cfg = parseSettings("vinx", {});
const m = cfg.mapping;

/** An article exactly as Rest3Client yields it: BaseData/Article + resolved lookups. */
const article = {
  id: 5000, articleNumber: "10679", designation: "Sassella Rocce Rosse 2016 75cl", designationWeb: "Valtellina Superiore Sassella Riserva «Rocce Rosse»",
  articleType: "wine", vintage: 2016, volume: 13.5, vatPercentage: 8.1, isActive: true, wineId: 77, changedOn: "2026-11-01T10:00:00Z",
  producer: { id: 12, designation: "ARPEPE" }, region: { id: 4, designation: "Valtellina" }, regionTop: { id: 1, designation: "Lombardia" },
  country: { id: 3, isoCode: "IT", designation: "Italien" }, category: { id: 2, designation: "Rotwein" },
  filling: { id: 9, designation: "75 cl", contentInCl: 75 }, tradingUnit: { id: 4, unitsPerTradingUnit: 6 }, grapes: "Nebbiolo (Chiavennasca)",
};

describe("vinX mapper (Shop API v2.0 field names)", () => {
  it("maps an enriched BaseData/Article record", () => {
    const a = mapArticle(article, m);
    expect(a.sku).toBe("10679");
    expect(a.variant.erpId).toBe("5000");
    expect(a.names.de).toBe("Valtellina Superiore Sassella Riserva «Rocce Rosse»");
    expect(a.producer).toBe("ARPEPE");
    expect(a.category).toBe("Rotwein");
    expect(a.product).toMatchObject({ country: "IT", region: "Lombardia", appellation: "Valtellina", alcohol: 13.5, taxClass: "standard", grapes: "Nebbiolo (Chiavennasca)" });
    expect(a.variant).toMatchObject({ vintage: "2016", size: "75 cl", volumeMl: 750, packSize: 6, active: true });
    expect(a.variant.priceCents).toBeUndefined(); // prices come from SellingPrices
    expect(a.kind).toBe("wine");
    expect(a.productCode).toBe("77"); // variants grouped by vinX wineId
  });
  it("falls back to designation and maps reduced VAT for food", () => {
    const a = mapArticle({ ...article, designationWeb: null, vatPercentage: 2.6, articleType: "food" }, m);
    expect(a.names.de).toBe("Sassella Rocce Rosse 2016 75cl");
    expect(a.product.taxClass).toBe("reduced");
    expect(a.kind).toBe("food");
  });
  it("maps Calculated/StockData and BaseData/SellingPrices rows", () => {
    expect(mapStock({ articleId: 5000, quantityAvailableForShop: 42.0, quantityCurrent: 50 }, m)).toEqual({ ref: "5000", stock: 42 });
    const p = mapPrice({ id: 1, articleId: 5000, priceGroupId: 2, unitPrice: 31.5, fromQuantity: 12, promotionPrice: 29.9, isPromotion: true, promotionValidUntil: "2099-01-01T00:00:00Z" }, m);
    expect(p).toMatchObject({ ref: "5000", list: "2", minQty: 12, netCents: 3150, promoCents: 2990, current: true });
    expect(p.promoValidTo?.getUTCFullYear()).toBe(2099);
    expect(mapPrice({ articleId: 1, priceGroupId: 2, unitPrice: 10, fromQuantity: 0, priceValidUntil: "2001-01-01T00:00:00Z" }, m).current).toBe(false);
  });
  it("parses Swiss number formats, dot paths and fallbacks", () => {
    expect(decimal("1'234.50")).toBe(1234.5);
    expect(decimal("12,5")).toBe(12.5);
    expect(decimal("CHF 9.90")).toBe(9.9);
    expect(pick({ a: { b: " x " } }, "a.b")).toBe("x");
    expect(pick({ a: null, b: "y" }, "a|b")).toBe("y");
  });
});

describe("CSV exchange", () => {
  it("auto-detects delimiter and quotes", () => {
    const rows = parseCsv('﻿ArtikelNr;Bezeichnung;Preis\n10679;"Sassella ""Rocce"" Rosse";41,60\n');
    expect(rows).toEqual([{ ArtikelNr: "10679", Bezeichnung: 'Sassella "Rocce" Rosse', Preis: "41,60" }]);
  });
  it("maps German export headers via csvMapping", () => {
    const a = mapArticle({ ArtikelNr: "10679", Bezeichnung: "Sassella", Produzent: "ARPEPE", Region: "Lombardia", Land: "Italien", Preis: "41.60", MWST: "N", Gebinde: "6", Artikeltyp: "Wein", Rabattgruppe: "WEIN" }, cfg.csvMapping);
    expect(a).toMatchObject({ sku: "10679", producer: "ARPEPE", kind: "wine", product: { region: "Lombardia", taxClass: "standard" }, variant: { priceCents: 4160, packSize: 6, discountGroup: "WEIN" } });
  });
  it("decodes Windows-1252 exports", () => {
    const bytes = new Uint8Array([0x4e, 0x65, 0x72, 0x6f, 0x20, 0x64, 0xe0, 0x76, 0x6f, 0x6c, 0x61]); // "Nero dàvola"
    expect(decodeUpload(bytes.buffer)).toBe("Nero dàvola");
  });
});
