import { describe, expect, it } from "vitest";
import { parseSettings } from "~/lib/settings";
import { postLabelRequest, trackingUrl } from "~/.server/shipping";

const shop = parseSettings("shop", { fulfillment: { post: { frankingLicense: "60001234", services: ["PRI", "SI"], sender: { name1: "Weinhandel AG", street: "Hauptstrasse 1", zip: "6010", city: "Kriens" } } } });

describe("shipping", () => {
  it("builds tracking links from the carrier template", () => {
    expect(trackingUrl(shop, "post", "99.60.123456.12345678")).toBe("https://service.post.ch/ekp-web/external/view/99.60.123456.12345678");
    expect(trackingUrl(shop, "own", "X1")).toBeNull();
    expect(trackingUrl(shop, "post", null)).toBeNull();
  });
  it("builds a Swiss Post generateAddressLabel request with the API's field names", () => {
    const body = postLabelRequest(shop.fulfillment.post, { number: "DS-2026-000042", locale: "it" }, { company: "Trattoria Demo GmbH", name: "Marco Rossi", street: "Pilatusstrasse 12", zip: "6003", city: "Luzern", country: "ch" }, 3200);
    expect(body).toMatchObject({
      language: "IT", frankingLicense: "60001234", ppFranking: false,
      customer: { name1: "Weinhandel AG", street: "Hauptstrasse 1", zip: "6010", city: "Kriens", country: "CH" },
      labelDefinition: { labelLayout: "A6", printAddresses: "RECIPIENT_AND_CUSTOMER", imageFileType: "PDF", imageResolution: 300, printPreview: false },
      sendingID: "DS-2026-000042",
      item: { itemID: "DS-2026-000042", recipient: { name1: "Trattoria Demo GmbH", name2: "Marco Rossi", street: "Pilatusstrasse 12", zip: "6003", city: "Luzern", country: "CH" }, attributes: { przl: ["PRI", "SI"], weight: 3200 } },
    });
  });
  it("e-mails confirmed, shipped and cancelled by default", () => {
    expect(parseSettings("shop", {}).fulfillment.notify).toEqual(["confirmed", "shipped", "cancelled"]);
  });
});
