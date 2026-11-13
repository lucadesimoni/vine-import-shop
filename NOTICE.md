# Notices

The platform's own code is proprietary — see [LICENSE](LICENSE).
Third-party open-source packages: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) (`npm run licenses`; CI fails on copyleft or unknown licences).

## Map data

| Files | Source | Terms |
|---|---|---|
| `app/lib/maps/world.json`, `world-shapes.json` (`scripts/maps/build-world-shapes.py`) and `app/lib/maps/regions/*.json` (except `it.json`) | [Natural Earth](https://www.naturalearthdata.com/), admin-0 / admin-1 boundaries, simplified (`scripts/maps/build-region-maps.py`) | Public domain |
| `app/lib/maps/regions/it.json` | Italian regions from [openpolis/geojson-italy](https://github.com/openpolis/geojson-italy) (ISTAT boundaries), simplified | Attribution: © ISTAT, openpolis — check the licence stated in the source repository before redistributing; replace with the Natural Earth build (`build-region-maps.py … IT`) if in doubt |

Map shading and the dot-matrix world map are the platform's own rendering of these data.

## Image processing

The image optimizer uses [sharp](https://sharp.pixelplumbing.com) (Apache-2.0) with the prebuilt **libvips** binary
`@img/sharp-libvips-*` (LGPL-3.0-or-later). libvips is a separate shared library loaded at runtime and is not modified;
it can be replaced by the licensee (e.g. `npm rebuild sharp` against a system libvips). Source: https://github.com/libvips/libvips.

## Fonts and icons

- Default fonts Fraunces and Inter are loaded from Bunny Fonts and are licensed under the SIL Open Font License 1.1. Brand fonts chosen in the admin keep their own licences.
- Icons: [Lucide](https://lucide.dev) (ISC), shipped as a package dependency.

## Demo content (De Simoni)

Only loaded with `DEMO_DATA=true`. **Not licensed for customer installations.**

| Content | Location | Rights |
|---|---|---|
| Brand name, logos, photos | `public/demo/desimoni/*` | Trademarks and images of De Simoni AG, included for demonstration only. Keep the brand owner's written consent with the project records. |
| Producer and brand logos | `public/demo/desimoni/marchi/*` | Trademarks of the respective producers. Shown to illustrate the producer pages only. |
| Product article list and photos | `app/.server/seed/desimoni-catalog.json`; images loaded from the reference test site | Taken from the De Simoni reference test site for the demo. Prices are fictitious. |
| Product, page and FAQ texts | `app/.server/seed/desimoni*.{ts,json}` | Written for this demo. |

Customer installations start without demo content (`DEMO_DATA=false`) and use their own brand, texts and images.
