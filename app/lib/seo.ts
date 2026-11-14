import type { Brand } from "~/lib/settings";

/**
 * Structured data (schema.org JSON-LD) and social-preview tags. Search engines read prices, availability, brand and
 * breadcrumbs from it; links shared in WhatsApp/Teams/LinkedIn get a title, text and picture.
 */
const abs = (u: string | null | undefined, origin: string) => (u ? new URL(u, origin).href : undefined);

export function organizationLd(brand: Brand, origin: string) {
  const c = brand.contact;
  const sameAs = Object.values(brand.social ?? {}).filter(Boolean);
  return {
    "@type": "Organization",
    "@id": `${origin}/#org`,
    name: brand.legalName || brand.name,
    url: `${origin}/`,
    logo: abs(brand.logoUrl, origin),
    ...(c.phone || c.email ? { contactPoint: { "@type": "ContactPoint", contactType: "customer service", telephone: c.phone || undefined, email: c.email || undefined } } : {}),
    ...(c.street ? { address: { "@type": "PostalAddress", streetAddress: c.street, postalCode: c.zip, addressLocality: c.city, addressCountry: c.country || undefined } } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

/** home page: the business + a search box in Google results (sitelinks search) */
export function homeLd(brand: Brand, origin: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationLd(brand, origin),
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        url: `${origin}/`,
        name: brand.name,
        publisher: { "@id": `${origin}/#org` },
        potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${origin}/shop?q={search_term_string}` }, "query-input": "required name=search_term_string" },
      },
    ],
  };
}

type LdVariant = { sku: string; size?: string | null; vintage?: string | number | null; stock: string; price: { gross: number } | null };
export function productLd(p: {
  name: string; url: string; origin: string; description?: string; image?: string | null; brand?: string | null;
  category?: { name: string; slug: string } | null; ean?: string | null; currency: string; variants: LdVariant[];
}) {
  const crumbs = [
    { name: "Shop", item: `${p.origin}/shop` },
    ...(p.category ? [{ name: p.category.name, item: `${p.origin}/shop?category=${p.category.slug}` }] : []),
    { name: p.name, item: p.url },
  ];
  // offers only with a visible price (shops that hide prices from guests publish none)
  const offers = p.variants.filter((v) => v.price).map((v) => ({
    "@type": "Offer",
    sku: v.sku,
    price: (v.price!.gross / 100).toFixed(2),
    priceCurrency: p.currency,
    availability: v.stock === "out" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
    itemCondition: "https://schema.org/NewCondition",
    url: p.url,
    seller: { "@id": `${p.origin}/#org` },
    ...(v.size || v.vintage ? { name: [v.vintage, v.size].filter(Boolean).join(" · ") } : {}),
  }));
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: p.name,
        url: p.url,
        sku: p.variants[0]?.sku,
        ...(p.ean && /^\d{8,14}$/.test(p.ean) ? { gtin: p.ean } : {}),
        ...(p.description ? { description: p.description.slice(0, 5000) } : {}),
        ...(p.image ? { image: abs(p.image, p.origin) } : {}),
        ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
        ...(p.category ? { category: p.category.name } : {}),
        ...(offers.length === 1 ? { offers: offers[0] } : offers.length ? { offers } : {}),
      },
      { "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.item })) },
    ],
  };
}

/** Open Graph + Twitter tags (absolute image URL) */
export function socialMeta(o: { title: string; description?: string; url: string; image?: string | null; type?: string; siteName?: string }) {
  const img = o.image ? new URL(o.image, o.url).href : undefined;
  return [
    { property: "og:type", content: o.type ?? "website" },
    { property: "og:title", content: o.title },
    ...(o.description ? [{ property: "og:description", content: o.description }, { name: "description", content: o.description }] : []),
    { property: "og:url", content: o.url },
    ...(o.siteName ? [{ property: "og:site_name", content: o.siteName }] : []),
    ...(img ? [{ property: "og:image", content: img }] : []),
    { name: "twitter:card", content: img ? "summary_large_image" : "summary" },
    { tagName: "link", rel: "canonical", href: o.url },
  ];
}
