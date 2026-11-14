import { describe, expect, it } from "vitest";
import { brandSchema } from "~/lib/settings";
import { homeLd, productLd, socialMeta } from "~/lib/seo";

const v = (sku: string, gross: number | null, stock = "in") => ({ sku, size: "75 cl", vintage: 2019, stock, price: gross == null ? null : { gross } });

describe("structured data", () => {
  it("product: one offer per format with the shop currency, breadcrumbs, GTIN only when valid", () => {
    const ld = productLd({ name: "Barolo", url: "https://shop.ch/product/barolo", origin: "https://shop.ch", image: "/img/barolo.webp", brand: "Cantina", category: { name: "Rotwein", slug: "rotwein" }, ean: "8001234567890", currency: "EUR", variants: [v("1", 3250), v("2", 6100, "out")] });
    const [product, crumbs] = ld["@graph"] as unknown as [Record<string, any>, Record<string, any>];
    expect(product.image).toBe("https://shop.ch/img/barolo.webp");
    expect(product.gtin).toBe("8001234567890");
    expect(product.offers).toHaveLength(2);
    expect(product.offers[0]).toMatchObject({ price: "32.50", priceCurrency: "EUR", availability: "https://schema.org/InStock" });
    expect(product.offers[1].availability).toBe("https://schema.org/OutOfStock");
    expect(crumbs.itemListElement.map((c: { name: string }) => c.name)).toEqual(["Shop", "Rotwein", "Barolo"]);
    const noEan = productLd({ name: "X", url: "https://s/x", origin: "https://s", currency: "CHF", ean: "abc", variants: [v("1", 100)] })["@graph"][0] as unknown as Record<string, any>;
    expect(noEan.gtin).toBeUndefined();
    expect(noEan.offers).toMatchObject({ sku: "1" }); // single offer as object
  });
  it("product: no offers when prices are hidden from guests", () => {
    const p = productLd({ name: "X", url: "https://s/x", origin: "https://s", currency: "CHF", variants: [v("1", null)] })["@graph"][0] as unknown as Record<string, any>;
    expect(p.offers).toBeUndefined();
  });
  it("home: organisation with address and contact, site search", () => {
    const brand = brandSchema.parse({ name: "Vini AG", contact: { street: "Via 1", zip: "6900", city: "Lugano", country: "CH", phone: "+41 91 000 00 00" }, social: { instagram: "https://instagram.com/vini" } });
    const g = homeLd(brand, "https://vini.ch")["@graph"] as unknown as Record<string, any>[];
    expect(g[0]).toMatchObject({ "@type": "Organization", name: "Vini AG", sameAs: ["https://instagram.com/vini"] });
    expect(g[0].address.addressLocality).toBe("Lugano");
    expect(g[1].potentialAction.target.urlTemplate).toBe("https://vini.ch/shop?q={search_term_string}");
  });
  it("social tags: absolute image, canonical link, large card only with an image", () => {
    const m = socialMeta({ title: "T", url: "https://s.ch/p/x", image: "/a.jpg" });
    expect(m).toContainEqual({ property: "og:image", content: "https://s.ch/a.jpg" });
    expect(m).toContainEqual({ tagName: "link", rel: "canonical", href: "https://s.ch/p/x" });
    expect(socialMeta({ title: "T", url: "https://s.ch/" })).toContainEqual({ name: "twitter:card", content: "summary" });
  });
});
