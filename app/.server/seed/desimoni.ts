import { eq } from "drizzle-orm";
import { slugify } from "~/lib/slug";
import { parseSettings } from "~/lib/settings";
import { hashPassword } from "../auth";
import type { DB } from "../db";
import { schema } from "../db";
import products from "./desimoni-products.json";

/**
 * DEMO PROFILE — De Simoni AG, Kriens (Importatore dal 1917).
 * Brand, texts and the product sample are taken from the De Simoni test site.
 * Prices are DEMO VALUES (the real shop shows "Preis auf Anfrage"); in production
 * catalog, prices and stock come from vinX.
 */
export async function seedDeSimoniDemo(db: DB) {
  const D = "/demo/desimoni";

  const brand = parseSettings("brand", {
    name: "DE SIMONI",
    legalName: "De Simoni AG",
    claim: "Dal 1917",
    tagline: { de: "Italienische Weine & Spezialitäten seit 1917", it: "Vini e specialità italiane dal 1917" },
    logoUrl: `${D}/logo-scuro.png`,
    logoInverseUrl: `${D}/logo-bianco.png`,
    colors: {
      // Wine red from desimoni.ch (#a2193c), deeper wine for dark sections, logo pink as accent.
      background: "#f7f3f1", foreground: "#2b1d20", primary: "#a2193c", primaryForeground: "#ffffff",
      muted: "#efe7e5", mutedForeground: "#6f6064", accent: "#f2668f", border: "#e5dad8", card: "#ffffff",
      inverse: "#7d1631", inverseForeground: "#fbf4f4",
    },
    fonts: { display: "Bodoni Moda", body: "Montserrat", displayUppercaseEyebrows: true },
    radius: 2,
    buttonStyle: "square",
    buttonCase: "upper",
    contact: {
      street: "Schweighofstrasse 16", zip: "6010", city: "Kriens", country: "Schweiz", phone: "+41 41 349 50 10", email: "info@desimoni.ch",
      uid: "",
      hours: [
        { label: { de: "Montag – Donnerstag", it: "Lunedì – giovedì" }, value: "08:00–12:00 · 14:00–18:00" },
        { label: { de: "Freitag", it: "Venerdì" }, value: "08:00–12:00 · 14:00–17:00" },
      ],
    },
    announcement: { de: "Demo-Shop · Inhalte und Preise sind Beispiele", it: "Shop demo · contenuti e prezzi sono esempi" },
    footerQuote: { de: "Wir bringen seit über einem Jahrhundert die Seele Italiens in die Schweizer Gastronomie.", it: "Da oltre un secolo portiamo l'anima dell'Italia nella gastronomia svizzera." },
  });

  const shop = parseSettings("shop", {
    locales: ["de", "it"],
    defaultLocale: "de",
    // Demo: B2C shop with public consumer prices + B2B portal with customer-specific prices after login.
    channels: { mode: "separate" },
    priceVisibility: "public",
    consumerCheckout: true,
    guestCheckout: true,
    stockDisplay: "levels",
    stockLow: 12,
    stockHigh: 100,
    ageGate: false,
    orderPrefix: "DS",
    notifyEmail: "",
    shipping: [
      { code: "delivery", label: { de: "Lieferung (eigene Tour)", it: "Consegna (giro proprio)", en: "Delivery (own route)", fr: "Livraison (tournée)" }, description: { de: "Wöchentlich in der ganzen Deutschschweiz", it: "Settimanale in tutta la Svizzera tedesca" }, priceCents: 0, rates: [], freeFromCents: null, audience: "trade", minUnits: 0 },
      { code: "post", label: { de: "Postversand", it: "Spedizione postale", en: "Postal delivery", fr: "Envoi postal" }, description: { de: "1–3 Werktage", it: "1–3 giorni lavorativi" }, priceCents: 1500, rates: [[1, 1500], [7, 2200], [19, 3400]], freeFromCents: 30000, audience: "consumer", minUnits: 0 },
      { code: "pickup", label: { de: "Abholung in Kriens", it: "Ritiro a Kriens", en: "Pick-up in Kriens", fr: "Retrait à Kriens" }, description: { de: "Schweighofstrasse 16, nach Bestätigung", it: "Schweighofstrasse 16, dopo conferma" }, priceCents: 0, rates: [], freeFromCents: null, audience: "all", minUnits: 0 },
    ],
    payments: {
      invoice: { enabled: true, tradeOnly: true, termsDays: 30 },
      prepayment: { enabled: true, holder: "De Simoni AG (Demo)", iban: "CH00 0000 0000 0000 0000 0", bank: "Demo-Bank" },
      stripe: { enabled: false },
    },
  });

  const home = parseSettings("home", {
    hero: {
      eyebrow: { de: "Importatore · Dal 1917", it: "Importatore · Dal 1917" },
      title: { de: "Il gusto Italiano,\nin Svizzera.", it: "Il gusto Italiano,\nin Svizzera." },
      text: {
        de: "Seit über einem Jahrhundert wählen wir italienische Spezialitäten aus und liefern sie an alle, die Qualität, Authentizität und Leidenschaft suchen.",
        it: "Da oltre un secolo selezioniamo specialità italiane e le consegniamo a chi cerca qualità, autenticità e passione.",
      },
      imageUrl: `${D}/home-nuova.jpg`,
      primary: { label: { de: "B2B-Konto eröffnen", it: "Aprire un conto B2B" }, href: "/trade#apply" },
      secondary: { label: { de: "Für Gastronomen", it: "Per la ristorazione" }, href: "/trade" },
    },
    stats: [
      { value: String(new Date().getFullYear() - 1917), label: { de: "Anni di passione", it: "Anni di passione" } },
      { value: "200+", label: { de: "Etichette selezionate", it: "Etichette selezionate" } },
    ],
    categories: { title: { de: "Entdecken Sie unser Sortiment", it: "Scoprite il nostro assortimento" }, show: true },
    promo: { show: true, eyebrow: { de: "Exklusiv für die Gastronomie", it: "Esclusivo per la ristorazione" }, title: { de: "Aktionen im Monat", it: "Promozioni del mese" }, text: { de: "Exklusive Angebote warten auf Sie!", it: "Offerte esclusive vi aspettano!" } },
    spotlight: {
      show: true,
      productSlug: "", // filled below
      eyebrow: { de: "Neu bei De Simoni", it: "Novità da De Simoni" },
      bullets: [
        { de: "Nur Hartweizengriess und Wasser", it: "Solo semola di grano duro e acqua" },
        { de: "Bronzegezogen: raue Oberfläche, die die Sauce hält", it: "Trafilata al bronzo: superficie ruvida che trattiene il sugo" },
        { de: "Langsam bei niedriger Temperatur getrocknet", it: "Essiccata lentamente a bassa temperatura" },
      ],
      note: { de: "Ideal mit Ragù, Pilzsaucen, Butter und Salbei oder Fischsaucen.", it: "Ideale con ragù, funghi, burro e salvia o sughi di pesce." },
    },
    story: {
      show: true,
      eyebrow: { de: "— Dal 1917", it: "— Dal 1917" },
      title: { de: "Vier Generationen.\nEine Mission.", it: "Quattro generazioni.\nUna missione." },
      text: {
        de: "1917 in Kriens gegründet, importiert De Simoni heute in vierter Generation italienische Köstlichkeiten in die Schweiz. Was als kleines Familiengeschäft begann, ist heute eine der ältesten Adressen für italienische Weine und Spezialitäten en gros.",
        it: "Fondata a Kriens nel 1917, De Simoni importa oggi alla quarta generazione prelibatezze italiane in Svizzera.",
      },
      imageUrl: `${D}/macchine.png`,
      link: { label: { de: "La nostra storia", it: "La nostra storia" }, href: "/story" },
    },
    brands: { show: true, title: { de: "Einige unserer besten Marken", it: "Alcuni dei nostri migliori marchi" } },
    values: {
      title: { de: "Woran wir glauben", it: "In cosa crediamo" },
      items: [
        { icon: "sprout", title: { de: "Tradition", it: "Tradizione" }, text: { de: "Ausgewählte italienische Produzenten und ihre echten Geschichten.", it: "Produttori italiani selezionati e le loro storie vere." } },
        { icon: "award", title: { de: "Qualität", it: "Qualità" }, text: { de: "Mit Sorgfalt ausgewählte Produkte — vom Produzenten auf den Tisch.", it: "Prodotti scelti con cura — dal produttore alla tavola." } },
        { icon: "heart", title: { de: "Leidenschaft", it: "Passione" }, text: { de: "Ein Wissen über die Welt der Lebensmittel, das jeden Tag wächst.", it: "Una conoscenza del mondo alimentare che cresce ogni giorno." } },
        { icon: "truck", title: { de: "Verlässlichkeit", it: "Affidabilità" }, text: { de: "Lieferung und Service, gemacht für Profis der Gastronomie.", it: "Consegna e servizio pensati per i professionisti." } },
      ],
    },
  });

  const trade = parseSettings("trade", {
    imageUrl: `${D}/macchine.png`,
    eyebrow: { de: "— Per la ristorazione", it: "— Per la ristorazione" },
    title: { de: "Ihr Partner\nhinter der Karte.", it: "Il vostro partner\ndietro il menu." },
    text: {
      de: "Über 800 Restaurants, Hotels und Trattorien in der Deutschschweiz arbeiten mit uns. Vom Quartier-Bistro bis zum Fine-Dining-Haus — wir liefern, beraten und teilen unsere Leidenschaft für die italienische Küche.",
      it: "Oltre 800 ristoranti, hotel e trattorie nella Svizzera tedesca lavorano con noi.",
    },
    servicesTitle: { de: "Was wir für Sie tun.", it: "Cosa facciamo per voi." },
    services: [
      { title: { de: "Persönliche Beratung", it: "Consulenza personale" }, text: { de: "Unser Aussendienst besucht Sie vor Ort, lernt Ihre Karte kennen und schlägt passende Weine und Spezialitäten vor." } },
      { title: { de: "Direktimport", it: "Importazione diretta" }, text: { de: "Wir importieren ohne Zwischenhändler — direkt aus den Familienbetrieben Italiens. Bessere Preise, klarer Ursprung." } },
      { title: { de: "Wöchentliche Lieferung", it: "Consegna settimanale" }, text: { de: "Frische Wurstwaren, Käse und Bestände — pünktlich in der ganzen Deutschschweiz." } },
      { title: { de: "Sommelier-Service", it: "Servizio sommelier" }, text: { de: "Wein-Pairings, Karten-Erstellung und Schulungen für Ihr Service-Team." } },
      { title: { de: "Exklusive Etiketten", it: "Etichette esclusive" }, text: { de: "Über 40 Weine, die Sie nur über uns beziehen können." } },
      { title: { de: "Lager & Logistik", it: "Magazzino e logistica" }, text: { de: "Klimatisiertes Weinlager und sauber organisierte Logistik aus Kriens." } },
    ],
    stepsTitle: { de: "So funktioniert's.", it: "Come funziona." },
    steps: [
      { title: { de: "Anfrage stellen", it: "Inviare la richiesta" }, text: { de: "Sie senden uns eine kurze Anfrage mit Angaben zu Ihrem Betrieb. Wir melden uns innerhalb von 24 Stunden." } },
      { title: { de: "Persönliches Gespräch", it: "Colloquio personale" }, text: { de: "Unser Aussendienst besucht Sie vor Ort, versteht Ihre Karte und Ihre Gäste." } },
      { title: { de: "Wir liefern, Sie geniessen", it: "Noi consegniamo, voi gustate" }, text: { de: "Wöchentliche Lieferung, transparente Preise, persönlicher Ansprechpartner." } },
    ],
    formTitle: { de: "Werden Sie Kunde.", it: "Diventate clienti." },
    formText: { de: "Füllen Sie das Formular aus — wir melden uns innerhalb von 24 Stunden persönlich bei Ihnen.", it: "Compilate il modulo — vi contatteremo personalmente entro 24 ore." },
    promises: [{ de: "Antwort in 24h", it: "Risposta in 24h" }, { de: "Persönlicher Ansprechpartner", it: "Referente personale" }, { de: "Keine Verpflichtung", it: "Nessun impegno" }],
  });

  const story = parseSettings("story", {
    eyebrow: { de: "— La nostra storia", it: "— La nostra storia" },
    title: { de: "Seit 1917.", it: "Dal 1917." },
    intro: { de: "Was 1917 mit einem kleinen Geschäft in Kriens begann, ist heute eine der ältesten Adressen für italienische Weine und Spezialitäten in der Schweiz — geführt von der vierten Generation der Familie De Simoni." },
    imageUrl: `${D}/macchine.png`,
    timeline: [
      { year: "1917", title: { de: "Die Gründung" }, text: { de: "Giuseppe De Simoni eröffnet in Kriens das erste Geschäft für italienische Spezialitäten — wenige Jahre nach seiner Auswanderung aus dem Tessin." } },
      { year: "1948", title: { de: "Nachkriegszeit" }, text: { de: "Die zweite Generation übernimmt und beginnt mit dem systematischen Import italienischer Weine in die Zentralschweiz." } },
      { year: "1976", title: { de: "Eigenes Lager" }, text: { de: "Bezug der Schweighofstrasse 16 — bis heute unser Hauptsitz mit klimatisiertem Weinlager." } },
      { year: "1995", title: { de: "Direktimporte" }, text: { de: "Ausbau der direkten Beziehungen zu kleinen Familien-Winzern in Piemont, Toskana und Sizilien." } },
      { year: "2010", title: { de: "Vierte Generation" }, text: { de: "Die Familie führt das Unternehmen in vierter Generation weiter — mit dem gleichen Anspruch wie 1917." } },
      { year: "Heute", title: { de: "Italianità" }, text: { de: "Über 800 Gastronomie-Kunden, mehr als 200 Etiketten, ein einziger Standard: das Beste, was Italien zu bieten hat." } },
    ],
    quote: { de: "Die besten Weine erzählen Geschichten — unsere geht inzwischen über vier Generationen." },
  });

  // ── Catalog ────────────────────────────────────────────────────────────
  const catDefs: [string, Record<string, string>, string | null, string | null, boolean][] = [
    ["wein", { de: "Weine", it: "Vini", fr: "Vins", en: "Wines" }, null, null, true],
    ["rotwein", { de: "Rotwein", it: "Vino rosso", fr: "Vin rouge", en: "Red wine" }, "wein", null, false],
    ["weisswein", { de: "Weisswein", it: "Vino bianco", fr: "Vin blanc", en: "White wine" }, "wein", null, false],
    ["lebensmittel", { de: "Lebensmittel", it: "Alimentari", fr: "Alimentation", en: "Food" }, null, null, false],
    ["pasta-mehl", { de: "Pasta & Mehl", it: "Pasta & Farine", fr: "Pâtes & Farines", en: "Pasta & Flour" }, "lebensmittel", `${D}/pasta-farine.jpg`, true],
    ["olivenoel", { de: "Olivenöl & Würzmittel", it: "Olio & Condimenti", fr: "Huile & Condiments", en: "Olive oil & Condiments" }, "lebensmittel", `${D}/olio-condimenti.jpg`, true],
    ["wurstwaren", { de: "Wurstwaren", it: "Salumi", fr: "Charcuterie", en: "Cured meats" }, "lebensmittel", `${D}/salumi.jpg`, true],
    ["kaese", { de: "Käse & Butter", it: "Formaggi & Burro", fr: "Fromages & Beurre", en: "Cheese & Butter" }, "lebensmittel", `${D}/formaggi.jpg`, true],
    ["antipasti", { de: "Italienische Spezialitäten", it: "Specialità italiane", fr: "Spécialités italiennes", en: "Italian specialities" }, "lebensmittel", `${D}/specialita-italiane.jpg`, true],
    ["spirituosen-gruppe", { de: "Spirituosen", it: "Distillati", fr: "Spiritueux", en: "Spirits" }, null, null, false],
    ["spirituosen", { de: "Gin & Spirituosen", it: "Gin & Distillati", fr: "Gin & Spiritueux", en: "Gin & Spirits" }, "spirituosen-gruppe", null, false],
    ["aperitif", { de: "Aperitif & Bitter", it: "Aperitivi & Amari", fr: "Apéritif & Bitter", en: "Aperitif & Bitters" }, "spirituosen-gruppe", null, false],
  ];
  const catIds = new Map<string, number>();
  for (const [i, [slug, name, parent, image, showOnHome]] of catDefs.entries()) {
    const [row] = await db
      .insert(schema.categories)
      .values({ slug, name, parentId: parent ? catIds.get(parent) : null, image, sort: i, showOnHome, erpCode: name.de })
      .returning();
    catIds.set(slug, row.id);
  }
  // Wine tile image: first wine product image
  const firstWine = (products as DemoProduct[]).find((p) => p.kind === "wine" && p.image);
  if (firstWine) await db.update(schema.categories).set({ image: firstWine.image }).where(eq(schema.categories.slug, "wein"));

  const producerIds = new Map<string, number>();
  const groups = await db.select().from(schema.customerGroups);
  const tradeGroup = groups.find((g) => g.code === "trade")!;
  const gastro = groups.find((g) => g.code === "gastro")!;
  const promoNames = ["Riserva Sassella", "Black Gin", "Mozzarella con latte di bufala 250", "Salame Turista", "Olio Extra Vergine di Oliva BIO", "Involtini di Melanzane", "Campania Aglianico", "Coppa ca."];
  let spotlightSlug = "";
  let skuCounter = 0;

  for (const p of products as DemoProduct[]) {
    let producerId = producerIds.get(p.producer);
    if (!producerId) {
      const [row] = await db.insert(schema.producers).values({ slug: slugify(p.producer), name: p.producer, country: "Italia", featured: producerIds.size < 12 }).onConflictDoNothing().returning();
      producerId = row?.id ?? (await db.query.producers.findFirst({ where: eq(schema.producers.slug, slugify(p.producer)) }))!.id;
      producerIds.set(p.producer, producerId);
    }
    const slug = slugify(p.name);
    const isPromo = promoNames.some((n) => p.name.includes(n));
    const [prod] = await db
      .insert(schema.products)
      .values({
        slug,
        kind: p.kind,
        name: { de: p.name, it: p.name },
        short: p.kind === "wine" ? { de: `${p.producer}`, it: `${p.producer}` } : null,
        categoryId: catIds.get(p.category),
        producerId,
        color: p.color,
        country: "Italia",
        alcohol: p.alcohol,
        organic: /bio/i.test(p.name),
        taxClass: p.kind === "food" ? "reduced" : "standard",
        ageRestricted: p.kind !== "food",
        promo: isPromo,
        featured: isPromo,
        isNew: /Spaghetti di FARRO/.test(p.name),
        image: p.image,
      })
      .onConflictDoNothing()
      .returning();
    if (!prod) continue;
    if (/Paccheri Rigati/.test(p.name)) spotlightSlug = slug;

    for (const [i, v] of p.variants.entries()) {
      const [variant] = await db
        .insert(schema.variants)
        .values({
          productId: prod.id, sku: v.sku, erpId: String(500000 + ++skuCounter), vintage: v.vintage, size: v.size,
          volumeMl: v.size?.endsWith("cl") ? Number(v.size.replace(/[^\d.]/g, "")) * 10 : null,
          packSize: p.kind === "wine" ? 6 : 1, priceCents: Math.round(v.price * 100), stock: v.stock, sort: i,
        })
        .onConflictDoNothing()
        .returning();
      if (!variant) continue;
      // Demo price lists: trade + gastro net prices with quantity breaks (normally from vinX ProductInfo)
      const rate = p.kind === "food" ? 2.6 : 8.1;
      const net = Math.round((v.price * 100) / (1 + rate / 100));
      const breaks = p.kind === "wine" ? [[1, 0.8], [12, 0.76], [60, 0.72]] : [[1, 0.82], [10, 0.78]];
      await db.insert(schema.prices).values([
        ...breaks.map(([min, f]) => ({ variantId: variant.id, groupId: tradeGroup.id, minQty: min, netCents: Math.round(net * f) })),
        ...breaks.map(([min, f]) => ({ variantId: variant.id, groupId: gastro.id, minQty: min, netCents: Math.round(net * (f - 0.03)) })),
      ]);
    }
  }
  home.spotlight.productSlug = spotlightSlug;

  for (const [key, value] of Object.entries({ brand, shop, home, trade, story })) {
    await db.insert(schema.settings).values({ key, value }).onConflictDoNothing();
  }

  // Demo customers
  await db.insert(schema.users).values([
    {
      email: "gastro@demo.ch", passwordHash: await hashPassword("gastro-demo-1234"), name: "Marco Rossi", company: "Trattoria Demo GmbH",
      uidNumber: "CHE-123.456.789", role: "customer", groupId: gastro.id, tradeStatus: "approved", locale: "de",
      billing: { company: "Trattoria Demo GmbH", name: "Marco Rossi", street: "Pilatusstrasse 12", zip: "6003", city: "Luzern", country: "CH", phone: "+41 41 000 00 00" },
    },
    {
      email: "kunde@demo.ch", passwordHash: await hashPassword("kunde-demo-1234"), name: "Anna Muster", role: "customer",
      groupId: groups.find((g) => g.code === "consumer")!.id, locale: "de",
      billing: { name: "Anna Muster", street: "Musterweg 5", zip: "6010", city: "Kriens", country: "CH" },
    },
  ]);
  await db.insert(schema.coupons).values({ code: "BENVENUTO10", type: "percent", value: 10, minTotalCents: 10000, consumerOnly: true });
  await seedLegalStubs(db, brand.legalName);
}

type DemoProduct = {
  name: string; category: string; kind: "wine" | "food" | "spirit"; producer: string; color: "red" | "white" | null; alcohol: number | null; image: string | null;
  variants: { sku: string; vintage: string | null; size: string | null; price: number; stock: number }[];
};

export async function seedLegalStubs(db: DB, company: string) {
  const note = "> Vorlage — bitte durch eigene, rechtlich geprüfte Texte ersetzen (Admin → Inhalte).\n\n";
  await db.insert(schema.pages).values([
    { slug: "impressum", title: { de: "Impressum", it: "Colophon", fr: "Mentions légales", en: "Imprint" }, body: { de: `${note}## ${company}\n\nAdresse, Handelsregister, UID und Vertretungsberechtigte.` } },
    { slug: "agb", title: { de: "AGB", it: "CG", fr: "CG", en: "Terms" }, body: { de: `${note}## Geltungsbereich\n\nDiese AGB gelten für alle Bestellungen bei ${company}.\n\n## Preise\n\nAlle Preise in CHF. Geschäftskunden: exkl. MWST.\n\n## Alter\n\nAlkoholische Getränke werden nur an Personen ab 18 Jahren abgegeben.` } },
    { slug: "datenschutz", title: { de: "Datenschutz", it: "Protezione dei dati", fr: "Protection des données", en: "Privacy" }, body: { de: `${note}Verantwortlich: ${company}.\n\nWir bearbeiten Personendaten nach dem Schweizer Datenschutzgesetz (DSG). Schriften werden über Bunny Fonts (EU) geladen, es werden keine Tracking-Dienste eingesetzt.` } },
  ]).onConflictDoNothing();
}
