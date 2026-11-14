import { describe, expect, it } from "vitest";
import { brandSchema } from "~/lib/settings";
import { htmlToText, layout } from "~/.server/mail";

describe("plain-text part of mails", () => {
  it("keeps paragraphs, rows and links readable", () => {
    const html = layout(brandSchema.parse({ name: "Vini AG", contact: { street: "Via 1", zip: "6900", city: "Lugano" } }), "Ihr Anmelde-Link",
      `<p>Hallo &amp; willkommen</p><p><a href="https://shop.ch/login/link/abc">Jetzt anmelden</a></p><table><tr><td>Barolo</td><td>CHF 32.50</td></tr></table>`);
    const t = htmlToText(html);
    expect(t).toContain("Vini AG");
    expect(t).toContain("Ihr Anmelde-Link");
    expect(t).toContain("Hallo & willkommen");
    expect(t).toContain("Jetzt anmelden (https://shop.ch/login/link/abc)");
    expect(t).toMatch(/Barolo\s+CHF 32\.50/);
    expect(t).not.toMatch(/<|&amp;/);
    expect(t).not.toMatch(/\n{3,}/);
  });
});
