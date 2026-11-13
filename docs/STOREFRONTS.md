# Storefronts (further shops on their own domain)

One installation can run the main shop plus any number of **storefronts**, e.g. a B2C shop for a subsidiary such as `daferrari.ch`.
Products, stock, prices, conditions, ERP connection, admin and backups stay shared. Each storefront has its own:

| What | How |
|---|---|
| Domain(s) | Admin › Storefronts › Domains. Point the domain's DNS at the installation; the host name selects the storefront |
| Brand & design | Admin › Design & Marke, «Gilt für: <storefront>» — logo, colours, fonts, contact, announcement |
| Settings | Admin › Einstellungen, same switch — languages, price display, shipping, payment, modules, order number prefix |
| Home page, story, B2B page | Admin › Inhalte, same switch |
| Content & legal pages | Admin › Inhalte › Seiten — a storefront page replaces the main shop's page with the same address (own imprint, terms, privacy); others are inherited |
| Assortment | Admin › Storefronts › Sortiment — product kinds, categories, producers (combined), plus articles always / never offered |
| Prices | Customer group for guests and new customers (e.g. its own vinX price list via the group's ERP code) |
| Customers | Separate accounts: the same e-mail can exist in the main shop and in a storefront; staff and admins sign in everywhere |
| Orders | Own number prefix, filter «Shop» in Admin › Bestellungen; e-mails with the storefront's brand |

**Inheritance:** a new storefront starts as a copy of the main shop's brand and settings as a pure B2C shop (no B2B portal, no B2B page)
with its own legal page templates. Settings it never changes keep following the main shop; «Auf Hauptshop zurücksetzen» drops an override.

**Preview without DNS:** `https://<installation>/?storefront=<slug>` (a cookie keeps it; `?storefront=main` switches back).
The demo includes the storefront «Da Ferrari»: `/?storefront=daferrari`.

**Licence keys** (docs/LICENSING.md): list all domains of the main shop and its storefronts in `--domains`.
