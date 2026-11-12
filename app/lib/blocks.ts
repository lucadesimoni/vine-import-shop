import type { ReactNode } from "react";
import { z } from "zod";
import type { Locale, Localized } from "./localized";

/**
 * Page building blocks — shared definitions (client + server).
 *
 * A page is an ordered list of blocks: { id, type, enabled, data }. The admin edits them with a drag & drop
 * editor generated from the field definitions below; the storefront renders them with components/blocks.tsx;
 * blocks that need catalog data (products, categories, producers, origin) are resolved by .server/blocks.ts.
 *
 * Add a block: add a definition here + a renderer in components/blocks.tsx (+ a resolver if it needs data),
 * or drop a self-contained block into custom/blocks/<name>/index.tsx (see custom/README.md).
 */

export type FieldType = "loc" | "locText" | "markdown" | "text" | "url" | "image" | "product" | "category" | "producer" | "number" | "bool" | "select" | "list";
export type Field = {
  key: string;
  label: string;
  type: FieldType;
  hint?: string;
  options?: [string, string][]; // select
  fields?: Field[]; // list item fields
  itemLabel?: string; // list
  max?: number; // list
  /** show this field only when another field has one of these values */
  when?: { key: string; is: string[] };
};

export type BlockData = Record<string, unknown>;
export type Block = { id: string; type: string; enabled: boolean; data: BlockData };

export type BlockDef = {
  type: string;
  label: string;
  description: string;
  /** lucide icon name (resolved in the editor) */
  icon: string;
  fields: Field[];
  defaults: () => BlockData;
  /** short text shown in the editor list */
  summary?: (d: BlockData) => string;
};

const LINK_HINT = "Interner Pfad wie /shop?promo=1 oder https://…";
const loc = (de: string, it = "", fr = "", en = ""): Localized => Object.fromEntries(Object.entries({ de, it, fr, en }).filter(([, v]) => v));
const first = (v: unknown) => (v && typeof v === "object" ? (Object.values(v as Localized).find(Boolean) ?? "") : typeof v === "string" ? v : "");

const ICON_OPTIONS: [string, string][] = [["sprout", "Spross"], ["award", "Auszeichnung"], ["heart", "Herz"], ["truck", "Lieferung"], ["grape", "Traube"], ["wine", "Wein"], ["leaf", "Blatt"], ["shield", "Sicherheit"], ["clock", "Uhr"], ["star", "Stern"], ["users", "Menschen"], ["map-pin", "Ort"]];

export const BLOCKS: BlockDef[] = [
  {
    type: "hero",
    label: "Hero",
    description: "Grosses Bild mit Titel, Text, Buttons und Kennzahlen.",
    icon: "image",
    summary: (d) => first(d.title),
    defaults: () => ({ eyebrow: {}, title: loc("Willkommen", "Benvenuti", "Bienvenue", "Welcome"), text: {}, image: "", primaryLabel: loc("Zum Shop", "Al negozio", "Boutique", "Shop now"), primaryHref: "/shop", secondaryLabel: {}, secondaryHref: "", height: "tall", stats: [] }),
    fields: [
      { key: "eyebrow", label: "Eyebrow", type: "loc" },
      { key: "title", label: "Titel", type: "locText", hint: "Zeilenumbruch mit Enter" },
      { key: "text", label: "Text", type: "locText" },
      { key: "image", label: "Hintergrundbild", type: "image" },
      { key: "primaryLabel", label: "Button", type: "loc" },
      { key: "primaryHref", label: "Button-Link", type: "url", hint: LINK_HINT },
      { key: "secondaryLabel", label: "Zweiter Button", type: "loc" },
      { key: "secondaryHref", label: "Zweiter Button-Link", type: "url" },
      { key: "height", label: "Höhe", type: "select", options: [["tall", "Gross"], ["medium", "Mittel"], ["compact", "Kompakt"]] },
      { key: "stats", label: "Kennzahlen", type: "list", itemLabel: "Kennzahl", max: 4, fields: [{ key: "value", label: "Wert", type: "text" }, { key: "label", label: "Bezeichnung", type: "loc" }] },
    ],
  },
  {
    type: "categories",
    label: "Kategorien",
    description: "Kacheln der Kategorien, die auf der Startseite erscheinen sollen.",
    icon: "layout-grid",
    summary: (d) => first(d.title) || "Kategorien",
    defaults: () => ({ title: loc("Unser Sortiment", "Il nostro assortimento", "Notre assortiment", "Our range") }),
    fields: [{ key: "title", label: "Titel", type: "loc", hint: "Welche Kategorien erscheinen, steuern Sie unter Produkte › Kategorie „auf Startseite“." }],
  },
  {
    type: "products",
    label: "Produkte",
    description: "Karussell oder Raster: Aktionen, Empfehlungen, Neuheiten, eine Kategorie oder ein Produzent.",
    icon: "wine",
    summary: (d) => first(d.title) || String(d.source),
    defaults: () => ({ eyebrow: {}, title: loc("Empfehlungen", "Consigliati", "Recommandations", "Recommended"), text: {}, source: "featured", category: "", producer: "", layout: "carousel", limit: 8 }),
    fields: [
      { key: "eyebrow", label: "Eyebrow", type: "loc" },
      { key: "title", label: "Titel", type: "loc" },
      { key: "text", label: "Text", type: "locText" },
      { key: "source", label: "Produkte", type: "select", options: [["promo", "Aktionen"], ["featured", "Empfohlene"], ["new", "Neuheiten"], ["category", "Aus einer Kategorie"], ["producer", "Von einem Produzenten"]] },
      { key: "category", label: "Kategorie", type: "category", when: { key: "source", is: ["category"] } },
      { key: "producer", label: "Produzent", type: "producer", when: { key: "source", is: ["producer"] } },
      { key: "layout", label: "Darstellung", type: "select", options: [["carousel", "Karussell"], ["grid", "Raster"]] },
      { key: "limit", label: "Anzahl", type: "number" },
    ],
  },
  {
    type: "spotlight",
    label: "Produkt im Fokus",
    description: "Ein Produkt gross mit Merkmalen und Hinweis.",
    icon: "sparkles",
    summary: (d) => String(d.product || "—"),
    defaults: () => ({ product: "", eyebrow: loc("Neu", "Novità", "Nouveau", "New"), bullets: [], note: {} }),
    fields: [
      { key: "product", label: "Produkt", type: "product" },
      { key: "eyebrow", label: "Eyebrow", type: "loc" },
      { key: "bullets", label: "Merkmale", type: "list", itemLabel: "Merkmal", max: 6, fields: [{ key: "text", label: "Text", type: "loc" }] },
      { key: "note", label: "Hinweis", type: "loc" },
    ],
  },
  {
    type: "imageText",
    label: "Bild & Text",
    description: "Bild neben Titel und Text — für Geschichte, Service oder Neuheiten.",
    icon: "columns-2",
    summary: (d) => first(d.title),
    defaults: () => ({ eyebrow: {}, title: loc("Unsere Geschichte", "La nostra storia", "Notre histoire", "Our story"), text: {}, image: "", imageSide: "left", linkLabel: {}, linkHref: "", tone: "surface" }),
    fields: [
      { key: "eyebrow", label: "Eyebrow", type: "loc" },
      { key: "title", label: "Titel", type: "locText" },
      { key: "text", label: "Text", type: "markdown" },
      { key: "image", label: "Bild", type: "image" },
      { key: "imageSide", label: "Bild", type: "select", options: [["left", "Links"], ["right", "Rechts"]] },
      { key: "linkLabel", label: "Link-Text", type: "loc" },
      { key: "linkHref", label: "Link", type: "url", hint: LINK_HINT },
      { key: "tone", label: "Hintergrund", type: "select", options: [["plain", "Seite"], ["surface", "Fläche"], ["muted", "Getönt"]] },
    ],
  },
  {
    type: "text",
    label: "Text",
    description: "Freier Text mit Titeln, Listen und Links (Markdown).",
    icon: "align-left",
    summary: (d) => first(d.title) || first(d.body).slice(0, 60),
    defaults: () => ({ title: {}, body: loc("Ihr Text …"), width: "narrow", align: "left" }),
    fields: [
      { key: "title", label: "Titel", type: "loc" },
      { key: "body", label: "Text", type: "markdown", hint: "## Zwischentitel, **fett**, *kursiv*, - Liste, [Link](https://…)" },
      { key: "width", label: "Breite", type: "select", options: [["narrow", "Lesebreite"], ["wide", "Breit"]] },
      { key: "align", label: "Ausrichtung", type: "select", options: [["left", "Links"], ["center", "Zentriert"]] },
    ],
  },
  {
    type: "cta",
    label: "Call-to-Action",
    description: "Farbiges Band mit Titel und Button — z. B. B2B-Konto, Aktion, Newsletter.",
    icon: "megaphone",
    summary: (d) => first(d.title),
    defaults: () => ({ eyebrow: {}, title: loc("Für die Gastronomie", "Per la ristorazione", "Pour la restauration", "For restaurants"), text: {}, buttonLabel: loc("Konto eröffnen", "Aprire un conto", "Ouvrir un compte", "Open an account"), buttonHref: "/trade#apply", tone: "primary" }),
    fields: [
      { key: "eyebrow", label: "Eyebrow", type: "loc" },
      { key: "title", label: "Titel", type: "loc" },
      { key: "text", label: "Text", type: "locText" },
      { key: "buttonLabel", label: "Button", type: "loc" },
      { key: "buttonHref", label: "Button-Link", type: "url", hint: LINK_HINT },
      { key: "tone", label: "Farbe", type: "select", options: [["primary", "Markenfarbe"], ["inverse", "Dunkel"], ["muted", "Hell"]] },
    ],
  },
  {
    type: "brands",
    label: "Marken / Produzenten",
    description: "Logos oder Namen der hervorgehobenen Produzenten.",
    icon: "grape",
    summary: (d) => first(d.title),
    defaults: () => ({ title: loc("Einige unserer Produzenten", "Alcuni dei nostri produttori", "Quelques-uns de nos producteurs", "Some of our producers") }),
    fields: [{ key: "title", label: "Titel", type: "loc", hint: "Hervorheben unter Admin › Produzenten." }],
  },
  {
    type: "origin",
    label: "Herkunftskarte",
    description: "Kleine Karte der Herkunftsregionen mit Link zur Produzenten-Seite.",
    icon: "map",
    summary: (d) => first(d.title),
    defaults: () => ({ eyebrow: loc("Herkunft", "Provenienza", "Provenance", "Origin"), title: loc("Woher unsere Produkte kommen", "Da dove vengono i nostri prodotti", "D'où viennent nos produits", "Where our products come from"), text: {}, buttonLabel: loc("Zur Karte", "Alla mappa", "Voir la carte", "Explore the map") }),
    fields: [
      { key: "eyebrow", label: "Eyebrow", type: "loc" },
      { key: "title", label: "Titel", type: "loc" },
      { key: "text", label: "Text", type: "locText" },
      { key: "buttonLabel", label: "Button", type: "loc" },
    ],
  },
  {
    type: "values",
    label: "Werte / Vorteile",
    description: "Drei bis vier Punkte mit Symbol — Qualität, Lieferung, Beratung …",
    icon: "badge-check",
    summary: (d) => first(d.title),
    defaults: () => ({ title: loc("Woran wir glauben", "In cosa crediamo", "Nos valeurs", "What we believe in"), items: [] }),
    fields: [
      { key: "title", label: "Titel", type: "loc" },
      { key: "items", label: "Punkte", type: "list", itemLabel: "Punkt", max: 8, fields: [{ key: "icon", label: "Symbol", type: "select", options: ICON_OPTIONS }, { key: "title", label: "Titel", type: "loc" }, { key: "text", label: "Text", type: "locText" }] },
    ],
  },
  {
    type: "quote",
    label: "Zitat",
    description: "Grosses Zitat mit Autor.",
    icon: "quote",
    summary: (d) => first(d.text).slice(0, 60),
    defaults: () => ({ text: loc("„…“"), author: "" }),
    fields: [{ key: "text", label: "Zitat", type: "locText" }, { key: "author", label: "Autor", type: "text" }],
  },
  {
    type: "image",
    label: "Bild",
    description: "Bild über die volle Breite, optional mit Bildunterschrift und Link.",
    icon: "image-plus",
    summary: (d) => first(d.caption) || String(d.image || "—").split("/").pop()!,
    defaults: () => ({ image: "", caption: {}, href: "", ratio: "wide" }),
    fields: [
      { key: "image", label: "Bild", type: "image" },
      { key: "caption", label: "Bildunterschrift", type: "loc" },
      { key: "href", label: "Link", type: "url" },
      { key: "ratio", label: "Format", type: "select", options: [["wide", "Breit (16:9)"], ["cinema", "Panorama (21:9)"], ["square", "Quadratisch"]] },
    ],
  },
  {
    type: "faq",
    label: "Fragen & Antworten",
    description: "Aufklappbare Fragen — Lieferung, Bestellung, Konditionen.",
    icon: "circle-help",
    summary: (d) => first(d.title) || `${(d.items as unknown[] | undefined)?.length ?? 0} Fragen`,
    defaults: () => ({ title: loc("Häufige Fragen", "Domande frequenti", "Questions fréquentes", "FAQ"), items: [] }),
    fields: [
      { key: "title", label: "Titel", type: "loc" },
      { key: "items", label: "Fragen", type: "list", itemLabel: "Frage", max: 30, fields: [{ key: "q", label: "Frage", type: "loc" }, { key: "a", label: "Antwort", type: "markdown" }] },
    ],
  },
];

export const blockDef = (type: string, extra: BlockDef[] = []) => [...BLOCKS, ...extra].find((b) => b.type === type);

export const newBlockId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const newBlock = (def: BlockDef): Block => ({ id: newBlockId(), type: def.type, enabled: true, data: def.defaults() });

/** Stored shape (validated on save; data is sanitised field by field in .server/blocks.ts). */
export const blockSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.string().min(1).max(40),
  enabled: z.boolean().default(true),
  data: z.record(z.string(), z.unknown()).default({}),
});
export const blocksSchema = z.array(blockSchema).max(80);

/** Links in blocks: internal paths, anchors, https, mailto/tel only. */
export const safeHref = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : "";
  return /^(\/(?!\/)|#|https:\/\/|mailto:|tel:)/.test(s) ? s : "";
};

/** Self-contained custom block (custom/blocks/<name>/index.tsx): fields for the editor + its own renderer. */
export type CustomBlock = BlockDef & { Component: (props: { data: BlockData; locale: Locale }) => ReactNode };
export const defineBlock = (b: CustomBlock) => b;
