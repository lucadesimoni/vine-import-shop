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
    expect(regionId("CH", "Wallis")).toBe("valais");
    expect(regionId("CH", "Tessin")).toBe("ticino");
    expect(regionId("AT", "Niederösterreich")).toBe("niederosterreich");
  });

  it("maps wine regions to their administrative region", () => {
    expect(regionId("FR", "Bordeaux")).toBe("nouvelle-aquitaine");
    expect(regionId("FR", "Champagne")).toBe("grand-est");
    expect(regionId("ES", "Rioja Alta")).toBe("la-rioja");
    expect(regionId("ES", "Ribera del Duero")).toBe("castilla-y-leon");
    expect(regionId("PT", "Douro")).toBe("norte");
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
  });
});
