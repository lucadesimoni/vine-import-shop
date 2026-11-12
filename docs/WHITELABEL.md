# White-labelling

Everything brand- or tenant-specific is data. A new client needs **no code changes**.

| What | Where in Admin | Stored as |
|---|---|---|
| Name, legal name, claim, tagline, logos (light/dark), favicon | Design & brand | `settings.brand` |
| 11 colour tokens, display and body fonts (curated pairs via GDPR-friendly Bunny Fonts), corner radius, button style | Design & brand (live preview) | `settings.brand` |
| Contact, opening hours, announcement bar, footer quote | Design & brand | `settings.brand` |
| Hero, home sections (categories, promotions, spotlight, story, brands, values) | Content → Home | `settings.home` |
| B2B page (services, steps, application form texts) | Content → Gastronomy | `settings.trade` |
| Story / timeline | Content → Story | `settings.story` |
| Legal and info pages (Markdown, per language) | Content → Pages | `pages` table |
| Languages, price visibility, consumer/guest checkout, stock display, VAT, shipping, payments, customer groups, B2B rules | Settings | `settings.shop`, `customer_groups` |
| ERP connection and field mapping | vinX ERP | `settings.vinx` (+ env secrets) |

The token pipeline is `brand.colors` → `lib/theme.ts` (`--t-primary` …) → `app.css` `@theme` (`--color-primary: var(--t-primary)`) → utilities (`bg-primary`). Emails use the same brand values.

**New client from scratch:** start with `DEMO_DATA=false`, log in as admin, then fill in Design, Content and Settings and connect vinX.
**Demo profile:** `app/.server/seed/desimoni.ts` shows how to script a complete brand.
