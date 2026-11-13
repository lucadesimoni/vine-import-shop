import { describe, expect, it } from "vitest";
import { countryIso, regionId, regionNameOf } from "~/.server/origins";
import { isSafeSvg } from "~/.server/storage";
import { REGION_MAP_COUNTRIES } from "~/lib/maps/regions";

describe("origin resolution (supplier / ERP free text → map areas)", () => {
  it("resolves country names in several languages", () => {
    expect(countryIso("Italien")).toBe("IT");
    expect(countryIso("France")).toBe("FR");
    expect(countryIso("Schweiz")).toBe("CH");
    expect(countryIso("es")).toBe("ES");
  });

  it("ships region maps for the main wine countries", () => {
    for (const iso of ["IT", "FR", "ES", "PT", "DE", "AT", "CH", "US", "AR", "CL", "ZA", "AU", "NZ"]) expect(REGION_MAP_COUNTRIES).toContain(iso);
  });

  it("maps administrative and localised region names", () => {
    expect(regionId("IT", "Südtirol")).toBe("trentino-alto-adige");
    expect(regionId("IT", "Toskana")).toBe("toscana");
    expect(regionId("CH", "Wallis")).toBe("wallis");
    expect(regionId("CH", "Valais")).toBe("wallis");
    expect(regionId("CH", "Ticino")).toBe("tessin");
    expect(regionId("AT", "Niederösterreich")).toBe("niederosterreich");
  });

  it("draws FR, PT, CH and AT as wine regions; units and appellations resolve to them", () => {
    expect(regionId("FR", "Bordeaux")).toBe("bordeaux");
    expect(regionId("FR", "Gironde")).toBe("bordeaux");
    expect(regionId("FR", "Saint-Émilion")).toBe("bordeaux");
    expect(regionId("FR", "Champagne")).toBe("champagne");
    expect(regionId("FR", "Alsace")).toBe("elsass");
    expect(regionId("FR", "Châteauneuf-du-Pape")).toBe("rhone");
    expect(regionId("FR", "Normandie")).toBe("normandie"); // non-wine areas keep their region (cider, Calvados)
    expect(regionId("PT", "Douro")).toBe("douro");
    expect(regionId("PT", "Porto")).toBe("douro");
    expect(regionId("PT", "Minho")).toBe("vinho-verde");
    expect(regionId("CH", "Graubünden")).toBe("deutschschweiz");
    expect(regionId("CH", "Neuenburg")).toBe("drei-seen-land");
    expect(regionId("CH", "Lavaux")).toBe("waadt");
    expect(regionId("AT", "Wachau")).toBe("niederosterreich");
    expect(regionId("AT", "Südsteiermark")).toBe("steiermark");
    expect(regionId("AT", "Tirol")).toBe("bergland");
  });

  it("maps wine regions to their administrative region", () => {
    expect(regionId("ES", "Rioja Alta")).toBe("la-rioja");
    expect(regionId("ES", "Ribera del Duero")).toBe("castilla-y-leon");
    expect(regionId("DE", "Mosel")).toBe("rheinland-pfalz");
    expect(regionId("US", "Napa Valley")).toBe("california");
    expect(regionId("NZ", "Marlborough")).toBe("south-island");
  });

  it("handles composite values and unknown regions", () => {
    expect(regionId("IT", "Sicilia / Etna")).toBe("sicilia");
    expect(regionId("FR", "Atlantis")).toBeNull();
    expect(regionId("XX", "Somewhere")).toBeNull();
    expect(regionId(null, "Toscana")).toBeNull();
  });

  it("localises region names", () => {
    expect(regionNameOf("IT", "sicilia", "de")).toBe("Sizilien");
    expect(regionNameOf("ES", "cataluna", "de")).toBe("Katalonien");
  });
});

describe("SVG logo upload guard", () => {
  it("accepts plain vector logos", () => {
    expect(isSafeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z" fill="#900"/></svg>')).toBe(true);
  });
  it.each([
    '<svg><script>alert(1)</script></svg>',
    '<svg onload="alert(1)"></svg>',
    '<svg><a href="javascript:alert(1)"><path/></a></svg>',
    '<svg><foreignObject><iframe/></foreignObject></svg>',
    '<svg><image href="https://tracker.example/x.png"/></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>',
    "<html><body>no svg</body></html>",
  ])("rejects %s", (svg) => expect(isSafeSvg(svg)).toBe(false));
});

import { cn } from "~/lib/cn";
describe("cn()", () => {
  it("lets the last display utility win so responsive hiding works on components", () => {
    expect(cn("inline-flex items-center", "hidden md:inline-flex")).toBe("items-center hidden md:inline-flex");
    expect(cn("flex", false, "gap-2")).toBe("flex gap-2");
    expect(cn("h-11 w-full px-3", "w-20 md:w-28")).toBe("h-11 px-3 w-20 md:w-28");
    expect(cn("h-11 w-11", "h-8 w-8")).toBe("h-8 w-8");
  });
});
