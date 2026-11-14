import { describe, expect, it } from "vitest";
import { describe as describeAction } from "~/.server/audit";

const form = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x);
  return f;
};

describe("admin activity log: what an action was", () => {
  it("names the area, the record and the kind of action — never form values", () => {
    expect(describeAction("/admin/products/12", form({ "name.de": "Barolo", price: "32.50" }))).toEqual({ action: "product.save", entity: "product", entityId: "12", summary: "Produkt gespeichert" });
    expect(describeAction("/admin/products/12", form({ intent: "image-edit", edit: "{}" })).summary).toBe("Produkt Bild bearbeitet");
    expect(describeAction("/admin/products/12", form({ intent: "delete" })).summary).toBe("Produkt gelöscht");
    expect(describeAction("/admin/products/new", form({})).summary).toBe("Produkt angelegt");
    expect(describeAction("/admin/customers/7", form({ intent: "approve" })).summary).toBe("Kunde freigegeben");
    expect(describeAction("/admin/orders/3", form({ intent: "status", status: "shipped" })).summary).toBe("Bestellung: Status → shipped");
    expect(describeAction("/admin/settings", form({ shippingJson: "[]" }), "daferrari").summary).toBe("Einstellungen gespeichert (Storefront daferrari)");
  });
  it("bulk actions: label and count", () => {
    const d = describeAction("/admin/products", form({ intent: "bulk", action: "images-standard", ids: ["1", "2", "3"] }));
    expect(d.summary).toBe("Produkt: Massenaktion «Bildstandard angewendet» auf 3 Einträge");
    expect(d.action).toBe("product.bulk");
  });
  it("ignores odd values in kind fields (no free text gets into the log)", () => {
    const d = describeAction("/admin/products/1", form({ intent: "<script>alert(1)</script> very long text that is not an intent" }));
    expect(d.summary).toBe("Produkt gespeichert");
  });
});
