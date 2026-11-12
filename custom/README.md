# Customer customisations

This folder belongs to **your installation**. Core updates never change it, so updating the platform stays conflict-free.

- `custom/extensions/<name>/index.ts`: your extensions are discovered and loaded automatically (default export: `defineExtension({...})`). See [docs/EXTENDING.md](../docs/EXTENDING.md).
- `custom/blocks/<name>/index.tsx`: your own page-builder blocks. They appear in the block library in Admin › Inhalte.

### A custom block

```tsx
// custom/blocks/opening-hours/index.tsx
import { defineBlock } from "~/lib/blocks";
import { tl, type Localized } from "~/lib/localized";

export default defineBlock({
  type: "opening-hours",
  label: "Öffnungszeiten",
  description: "Banner mit den Öffnungszeiten des Ladens.",
  icon: "clock",
  fields: [
    { key: "title", label: "Titel", type: "loc" },
    { key: "hours", label: "Zeiten", type: "locText" },
  ],
  defaults: () => ({ title: { de: "Öffnungszeiten" }, hours: { de: "Mo–Fr 8–18 Uhr" } }),
  Component: ({ data, locale }) => (
    <section className="container-page py-12 text-center">
      <h2 className="text-h2">{tl(data.title as Localized, locale)}</h2>
      <p className="mt-3 whitespace-pre-line text-muted-fg">{tl(data.hours as Localized, locale)}</p>
    </section>
  ),
});
```

Field types: `loc` / `locText` / `markdown` (per language), `text`, `url`, `image` (with upload), `number`, `bool`, `select`, `product` / `category` / `producer` (pickers) and `list` (repeating items). Values are sanitised on save (links: internal paths, `https:`, `mailto:` and `tel:` only). Style with the design tokens (`bg-surface`, `text-primary`, `rounded-surface` …) so the block follows every brand and dark mode.

Everything else (brand, wording, modules, prices, payments) is configured in the admin, not in code.
