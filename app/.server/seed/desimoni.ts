import { eq } from "drizzle-orm";
import { slugify } from "~/lib/slug";
import type { Localized } from "~/lib/localized";
import { parseSettings } from "~/lib/settings";
import { homeBlocks } from "../blocks";
import { hashPassword } from "../auth";
import type { DB } from "../db";
import { schema } from "../db";
import { seedLegalStubs } from "./legal";
import products from "./desimoni-catalog.json";
import texts from "./desimoni-texts.json";

/** Demo product texts (short / description / pairing, DE + IT), keyed by the first SKU. */
const TEXTS = texts as unknown as Record<string, { short: Localized; description: Localized; pairing: Localized }>;

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
    faviconUrl: `${D}/favicon.png`,
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
      eyebrow: { de: "Importeur · Seit 1917", it: "Importatore · Dal 1917" },
      title: { de: "Italien, direkt\nvom Erzeuger.", it: "L'Italia, direttamente\ndal produttore." },
      text: {
        de: "Weine, Öl, Pasta, Käse und Salumi von Familienbetrieben aus ganz Italien — für Restaurants, Hotels und alle, die zu Hause gut essen wollen. Aus Kriens, seit 1917.",
        it: "Vini, olio, pasta, formaggi e salumi da aziende di famiglia di tutta Italia — per ristoranti, hotel e per chi a casa vuole mangiare bene. Da Kriens, dal 1917.",
      },
      imageUrl: `${D}/home-nuova.jpg`,
      primary: { label: { de: "Sortiment entdecken", it: "Scoprire l'assortimento" }, href: "/shop" },
      secondary: { label: { de: "Für die Gastronomie", it: "Per la ristorazione" }, href: "/trade" },
    },
    stats: [
      { value: String(new Date().getFullYear() - 1917), label: { de: "Jahre in Kriens", it: "Anni a Kriens" } },
      { value: String(new Set((products as { producer: string }[]).map((p) => p.producer)).size), label: { de: "Produzenten", it: "Produttori" } },
      { value: (products as unknown[]).length.toLocaleString("de-CH"), label: { de: "Artikel", it: "Articoli" } },
    ],
    categories: { title: { de: "Was auf den Tisch kommt", it: "Cosa arriva in tavola" }, show: true },
    promo: { show: true, eyebrow: { de: "Diesen Monat", it: "Questo mese" }, title: { de: "Aktionen", it: "Promozioni" }, text: { de: "Ausgewählte Weine und Spezialitäten zu besonderen Preisen — solange Vorrat.", it: "Vini e specialità selezionati a prezzi speciali — fino a esaurimento scorte." } },
    spotlight: {
      show: true,
      productSlug: "", // filled below
      eyebrow: { de: "Neu im Sortiment", it: "Novità in assortimento" },
      bullets: [
        { de: "Nur Hartweizengriess und Wasser", it: "Solo semola di grano duro e acqua" },
        { de: "Bronzegezogen: raue Oberfläche, die die Sauce hält", it: "Trafilata al bronzo: superficie ruvida che trattiene il sugo" },
        { de: "Langsam bei niedriger Temperatur getrocknet", it: "Essiccata lentamente a bassa temperatura" },
      ],
      note: { de: "Ideal mit Ragù, Pilzsaucen, Butter und Salbei oder Fischsaucen.", it: "Ideale con ragù, funghi, burro e salvia o sughi di pesce." },
    },
    story: {
      show: true,
      eyebrow: { de: "— Seit 1917", it: "— Dal 1917" },
      title: { de: "Eine Familie,\nein Handwerk.", it: "Una famiglia,\nun mestiere." },
      text: {
        de: "Seit 1917 holen wir aus Kriens das Beste aus Italien in die Schweiz. Wir kennen die Betriebe, mit denen wir arbeiten, probieren jeden Jahrgang selbst und liefern mit eigenen Fahrzeugen — damit in der Küche ankommt, was beim Erzeuger begann.",
        it: "Dal 1917 portiamo da Kriens il meglio dell'Italia in Svizzera. Conosciamo le aziende con cui lavoriamo, assaggiamo ogni annata e consegniamo con i nostri mezzi — perché in cucina arrivi ciò che è iniziato dal produttore.",
      },
      imageUrl: `${D}/macchine.png`,
      link: { label: { de: "Unsere Geschichte", it: "La nostra storia" }, href: "/story" },
    },
    brands: { show: true, title: { de: "Mit diesen Betrieben arbeiten wir", it: "Le aziende con cui lavoriamo" } },
    values: {
      title: { de: "Worauf Sie sich verlassen können", it: "Su cosa potete contare" },
      items: [
        { icon: "grape", title: { de: "Direkt vom Erzeuger", it: "Direttamente dal produttore" }, text: { de: "Wir kaufen bei Familienbetrieben, die wir persönlich kennen — ohne Zwischenhandel.", it: "Acquistiamo da aziende di famiglia che conosciamo di persona — senza intermediari." } },
        { icon: "award", title: { de: "Selbst probiert", it: "Assaggiato da noi" }, text: { de: "Jeder Wein und jedes Produkt wird von uns verkostet, bevor es ins Sortiment kommt.", it: "Ogni vino e ogni prodotto viene degustato da noi prima di entrare in assortimento." } },
        { icon: "truck", title: { de: "Eigene Lieferung", it: "Consegna propria" }, text: { de: "Gastronomie-Kunden beliefern wir wöchentlich mit eigenen Fahrzeugen, gekühlt.", it: "Ai clienti della ristorazione consegniamo ogni settimana con mezzi propri, refrigerati." } },
        { icon: "users", title: { de: "Persönliche Beratung", it: "Consulenza personale" }, text: { de: "Ein fester Ansprechpartner kennt Ihre Karte und Ihre Gäste.", it: "Un referente fisso conosce il vostro menu e i vostri ospiti." } },
      ],
    },
  });

  const trade = parseSettings("trade", {
    imageUrl: `${D}/macchine.png`,
    eyebrow: { de: "— Für die Gastronomie", it: "— Per la ristorazione" },
    title: { de: "Ihr Partner\nhinter der Karte.", it: "Il vostro partner\ndietro il menu." },
    text: {
      de: "Vom Quartier-Bistro bis zum Hotelrestaurant: Wir liefern italienische Weine und Spezialitäten zu Ihren Konditionen, beraten bei der Karte und sind erreichbar, wenn es schnell gehen muss. Bestellt wird im B2B-Portal, per Excel-Liste oder telefonisch.",
      it: "Dal bistrò di quartiere al ristorante d'hotel: consegniamo vini e specialità italiane alle vostre condizioni, vi consigliamo sulla carta e ci siamo quando serve in fretta. Si ordina nel portale B2B, con una lista Excel o per telefono.",
    },
    servicesTitle: { de: "Was wir für Sie tun.", it: "Cosa facciamo per voi." },
    services: [
      { title: { de: "Persönliche Beratung", it: "Consulenza personale" }, text: { de: "Unser Aussendienst besucht Sie vor Ort, lernt Ihre Karte kennen und schlägt passende Weine und Spezialitäten vor.", it: "Il nostro servizio esterno vi visita sul posto, conosce il vostro menu e propone vini e specialità adatti." } },
      { title: { de: "Direktimport", it: "Importazione diretta" }, text: { de: "Wir importieren ohne Zwischenhändler — direkt aus den Familienbetrieben Italiens. Bessere Preise, klarer Ursprung.", it: "Importiamo senza intermediari — direttamente dalle aziende di famiglia italiane. Prezzi migliori, origine chiara." } },
      { title: { de: "Wöchentliche Lieferung", it: "Consegna settimanale" }, text: { de: "Mit eigener Tour und gekühlt — Frischprodukte, Wein und Trockenware in einer Lieferung.", it: "Con giro proprio e refrigerato — freschi, vino e secco in un'unica consegna." } },
      { title: { de: "Weinkarte & Schulung", it: "Carta dei vini & formazione" }, text: { de: "Wir stellen mit Ihnen eine Karte zusammen, die zu Küche und Budget passt, und schulen Ihr Service-Team.", it: "Componiamo con voi una carta adatta a cucina e budget e formiamo il vostro team di sala." } },
      { title: { de: "B2B-Portal", it: "Portale B2B" }, text: { de: "Ihre Preise und Rabatte, Schnellbestellung per Artikelnummer oder Excel, Bestellhistorie und Preisliste als CSV.", it: "I vostri prezzi e sconti, ordine rapido per numero d'articolo o Excel, storico ordini e listino in CSV." } },
      { title: { de: "Lager & Logistik", it: "Magazzino e logistica" }, text: { de: "Klimatisiertes Weinlager und sauber organisierte Logistik aus Kriens.", it: "Cantina climatizzata e logistica ben organizzata da Kriens." } },
    ],
    stepsTitle: { de: "So funktioniert's.", it: "Come funziona." },
    steps: [
      { title: { de: "Anfrage stellen", it: "Inviare la richiesta" }, text: { de: "Sie senden uns eine kurze Anfrage mit Angaben zu Ihrem Betrieb. Wir melden uns innerhalb von 24 Stunden.", it: "Inviateci una breve richiesta con i dati della vostra attività. Vi rispondiamo entro 24 ore." } },
      { title: { de: "Persönliches Gespräch", it: "Colloquio personale" }, text: { de: "Unser Aussendienst besucht Sie vor Ort, versteht Ihre Karte und Ihre Gäste.", it: "Il nostro servizio esterno vi visita, conosce il vostro menu e i vostri ospiti." } },
      { title: { de: "Wir liefern, Sie geniessen", it: "Noi consegniamo, voi gustate" }, text: { de: "Wöchentliche Lieferung, transparente Preise, persönlicher Ansprechpartner.", it: "Consegna settimanale, prezzi trasparenti, un referente personale." } },
    ],
    formTitle: { de: "Werden Sie Kunde.", it: "Diventate clienti." },
    formText: { de: "Füllen Sie das Formular aus — wir melden uns innerhalb von 24 Stunden persönlich bei Ihnen.", it: "Compilate il modulo — vi contatteremo personalmente entro 24 ore." },
    promises: [{ de: "Antwort in 24h", it: "Risposta in 24h" }, { de: "Persönlicher Ansprechpartner", it: "Referente personale" }, { de: "Keine Verpflichtung", it: "Nessun impegno" }],
  });

  const story = parseSettings("story", {
    eyebrow: { de: "— Unsere Geschichte", it: "— La nostra storia" },
    title: { de: "Seit 1917.", it: "Dal 1917." },
    intro: { de: "Was 1917 mit einem kleinen Geschäft in Kriens begann, ist heute eine der ältesten Adressen für italienische Weine und Spezialitäten in der Schweiz — geführt von der vierten Generation der Familie De Simoni.", it: "Quella che nel 1917 era una piccola bottega a Kriens è oggi uno degli indirizzi più antichi per vini e specialità italiane in Svizzera — guidata dalla quarta generazione della famiglia De Simoni." },
    imageUrl: `${D}/macchine.png`,
    timeline: [
      { year: "1917", title: { de: "Die Gründung", it: "La fondazione" }, text: { de: "In Kriens beginnt der Handel mit italienischen Spezialitäten — damals für die italienische Gemeinschaft in der Zentralschweiz.", it: "A Kriens inizia il commercio di specialità italiane — allora per la comunità italiana della Svizzera centrale." } },
      { year: "II", title: { de: "Wein wird zum Schwerpunkt", it: "Il vino diventa centrale" }, text: { de: "Die nächste Generation baut den Import von Weinen aus und knüpft direkte Beziehungen zu Kellereien in ganz Italien.", it: "La generazione successiva amplia l'importazione di vini e allaccia rapporti diretti con cantine di tutta Italia." } },
      { year: "III", title: { de: "Gastronomie", it: "Ristorazione" }, text: { de: "Restaurants und Hotels werden die wichtigsten Kunden — mit eigener Lieferung, Beratung und Weinkarten-Service.", it: "Ristoranti e hotel diventano i clienti principali — con consegna propria, consulenza e servizio carta dei vini." } },
      { year: "Heute", title: { de: "Italianità, digital", it: "Italianità, digitale" }, text: { de: "Ein Sortiment von Familienbetrieben aus ganz Italien — im Laden, im Onlineshop und im B2B-Portal mit Ihren Konditionen.", it: "Un assortimento di aziende di famiglia di tutta Italia — in negozio, nello shop online e nel portale B2B con le vostre condizioni." } },
    ],
    quote: { de: "Die besten Weine erzählen Geschichten — unsere geht inzwischen über vier Generationen.", it: "I vini migliori raccontano storie — la nostra attraversa ormai quattro generazioni." },
  });

  // ── Catalog ────────────────────────────────────────────────────────────
  const catDefs: [string, Record<string, string>, string | null, string | null, boolean][] = [
    ["wein", { de: "Weine", it: "Vini", fr: "Vins", en: "Wines" }, null, null, true],
    ["rotwein", { de: "Rotwein", it: "Vino rosso", fr: "Vin rouge", en: "Red wine" }, "wein", null, false],
    ["weisswein", { de: "Weisswein", it: "Vino bianco", fr: "Vin blanc", en: "White wine" }, "wein", null, false],
    ["schaumwein", { de: "Schaumwein", it: "Spumante", fr: "Vin mousseux", en: "Sparkling wine" }, "wein", null, false],
    ["rosewein", { de: "Roséwein", it: "Vino rosato", fr: "Vin rosé", en: "Rosé wine" }, "wein", null, false],
    ["suesswein", { de: "Süsswein & Vermouth", it: "Vini dolci & Vermouth", fr: "Vins doux & Vermouth", en: "Sweet wine & Vermouth" }, "wein", null, false],
    ["lebensmittel", { de: "Lebensmittel", it: "Alimentari", fr: "Alimentation", en: "Food" }, null, null, false],
    ["pasta-mehl", { de: "Pasta & Mehl", it: "Pasta & Farine", fr: "Pâtes & Farines", en: "Pasta & Flour" }, "lebensmittel", `${D}/pasta-farine.jpg`, true],
    ["olivenoel", { de: "Olivenöl & Würzmittel", it: "Olio & Condimenti", fr: "Huile & Condiments", en: "Olive oil & Condiments" }, "lebensmittel", `${D}/olio-condimenti.jpg`, true],
    ["wurstwaren", { de: "Wurstwaren", it: "Salumi", fr: "Charcuterie", en: "Cured meats" }, "lebensmittel", `${D}/salumi.jpg`, true],
    ["kaese", { de: "Käse & Butter", it: "Formaggi & Burro", fr: "Fromages & Beurre", en: "Cheese & Butter" }, "lebensmittel", `${D}/formaggi.jpg`, true],
    ["antipasti", { de: "Italienische Spezialitäten", it: "Specialità italiane", fr: "Spécialités italiennes", en: "Italian specialities" }, "lebensmittel", `${D}/specialita-italiane.jpg`, true],
    ["reis-polenta", { de: "Reis & Polenta", it: "Riso & Polenta", fr: "Riz & Polenta", en: "Rice & Polenta" }, "lebensmittel", null, false],
    ["dolci", { de: "Dolci & Snacks", it: "Dolci & Snack", fr: "Douceurs & Snacks", en: "Sweets & Snacks" }, "lebensmittel", null, false],
    ["spirituosen-gruppe", { de: "Spirituosen", it: "Distillati", fr: "Spiritueux", en: "Spirits" }, null, null, false],
    ["spirituosen", { de: "Gin & Spirituosen", it: "Gin & Distillati", fr: "Gin & Spiritueux", en: "Gin & Spirits" }, "spirituosen-gruppe", null, false],
    ["aperitif", { de: "Aperitif & Bitter", it: "Aperitivi & Amari", fr: "Apéritif & Bitter", en: "Aperitif & Bitters" }, "spirituosen-gruppe", null, false],
    ["grappa", { de: "Grappa & Brände", it: "Grappa & Acquaviti", fr: "Grappa & Eaux-de-vie", en: "Grappa & Brandies" }, "spirituosen-gruppe", null, false],
    ["getraenke", { de: "Getränke", it: "Bevande", fr: "Boissons", en: "Beverages" }, null, null, false],
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
  const promoNames = ["Sassella Riserva", "Taurus Black Gin", "Mozzarella di bufala 250", "Salame turista", "Tenuta Arcamone", "Involtini di melanzane", "Campania Aglianico", "Coppa stagionata"];
  let spotlightSlug = "";
  let skuCounter = 0;

  // Catalogue from the reference site's article list (scripts/demo/build-catalog.py): batched inserts keep a cold start fast.
  const catalog = products as DemoProduct[];
  const LOGOS = ["acquerello", "barlotti", "beppino-occelli", "brimi", "cavalieri", "de-carlo", "defendi", "delicius", "fabbri", "felicetti", "gusto-squisito", "i-solai-di-san-giorgio", "italianavera", "la-pasta-di-aldo", "la-valletta", "latteria-sociale-mantova", "madeo", "mancini", "marabotto", "molino-dallagiovanna", "nonno-nanni", "preite", "principato-di-lucedio", "rossogargano", "rovagnati", "rummo", "sant-agata", "sapori-del-lagonero"];
  const logoFor = (name: string) => {
    const s = slugify(name);
    const hit = LOGOS.find((l) => s === l || s.startsWith(`${l}-`) || s.includes(l) || (l.split("-").length > 1 && l.split("-").every((w) => s.includes(w))));
    return hit ? `${D}/marchi/${hit}.webp` : null;
  };
  // The test-site export has no region for producers outside Italy; their (public) wine region, so the maps drill down
  const REGION_OF: Record<string, string> = {
    "Georg Schlegel": "Bündner Herrschaft", "Weingut Roman Hermann": "Bündner Herrschaft", "Weingut Familie Hansruedi Adank": "Bündner Herrschaft",
    "Weingut Sprecher von Bernegg": "Bündner Herrschaft", "Weingut Erich Meier": "Zürichsee", "Weingut Bisang": "Luzern",
    "Il Cavaliere": "Tessin", "Tenuta San Giorgio": "Tessin", "Caves de Chambleau": "Neuenburg",
    "Gerhard Markowitsch": "Carnuntum", "Weingut Alzinger": "Wachau", "Domäne Wachau": "Wachau", "Tement": "Südsteiermark",
    "Encry": "Champagne", "Bodegas Altanza": "Rioja", "Bodegas y Viñedos Neo": "Ribera del Duero",
  };
  for (const p of catalog) if (!p.region && REGION_OF[p.producer]) p.region = REGION_OF[p.producer];
  const prodInfo = new Map<string, { region: string | null; country: string; curated: boolean; erp: string }>();
  for (const p of catalog) {
    const cur = prodInfo.get(p.producer);
    if (!cur || (!cur.region && p.region)) prodInfo.set(p.producer, { region: p.region ?? cur?.region ?? null, country: p.country ?? "Italia", curated: !!(cur?.curated || p.curated), erp: p.producerErp ?? p.producer });
  }
  const chunk = <T,>(a: T[], n = 250) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  const usedSlugs = new Set<string>();
  const uniq = (base: string) => { let s = base || "x", i = 2; while (usedSlugs.has(s)) s = `${base}-${i++}`; usedSlugs.add(s); return s; };

  const producerRows = [...prodInfo].map(([name, info]) => ({ slug: uniq(slugify(name)), name, erpId: info.erp, country: info.country, region: info.region, logo: logoFor(name), featured: !!logoFor(name) || info.curated }));
  for (const part of chunk(producerRows)) for (const r of await db.insert(schema.producers).values(part).returning({ id: schema.producers.id, name: schema.producers.name })) producerIds.set(r.name, r.id);

  usedSlugs.clear();
  const textFor = (p: DemoProduct) => p.variants.map((v) => TEXTS[v.sku]).find(Boolean) ?? {};
  const productRows = catalog.map((p) => {
    // promotions: the curated picks + a stable selection of pictured articles across the range
    const isPromo = (p.curated && promoNames.some((n) => p.name.includes(n))) || (!!p.image && p.variants[0].sku.endsWith("7") && Number(p.variants[0].sku) % 9 === 0);
    return {
      slug: uniq(slugify(p.name)), kind: p.kind, name: { de: p.name, it: p.name }, categoryId: catIds.get(p.category), producerId: producerIds.get(p.producer),
      color: p.color, country: p.country ?? "Italia", region: p.region ?? null, alcohol: p.alcohol, organic: /\bbio\b/i.test(p.name),
      taxClass: (p.kind === "food" || p.kind === "beverage" ? "reduced" : "standard") as "standard", ageRestricted: p.kind === "wine" || p.kind === "spirit",
      promo: isPromo, featured: isPromo || (p.curated && !!p.image), isNew: /di farro/.test(p.name), image: p.image, ...textFor(p),
    };
  });
  const productIds: number[] = [];
  for (const part of chunk(productRows)) productIds.push(...(await db.insert(schema.products).values(part).returning({ id: schema.products.id })).map((r) => r.id));
  spotlightSlug = productRows.find((r) => /Paccheri rigati/.test(r.name.de))?.slug ?? "";

  const variantRows = catalog.flatMap((p, pi) => p.variants.map((v, i) => ({
    productId: productIds[pi], sku: v.sku, erpId: String(500000 + ++skuCounter), vintage: v.vintage, size: v.size,
    volumeMl: /cl$/.test(v.size ?? "") ? Number(v.size!.replace(/[^\d.]/g, "")) * 10 : null,
    packSize: p.kind === "wine" ? 6 : 1, priceCents: Math.round(v.price * 100), stock: v.stock, sort: i,
    discountGroup: p.kind === "wine" ? "WEIN" : p.kind === "spirit" ? "SPIRITUOSEN" : "FOOD", // vinX "Artikelgruppe für Kundenrabatt"
  })));
  const priceRows: (typeof schema.prices.$inferInsert)[] = [];
  for (const part of chunk(variantRows)) {
    const rows = await db.insert(schema.variants).values(part).returning({ id: schema.variants.id, priceCents: schema.variants.priceCents, discountGroup: schema.variants.discountGroup });
    // Demo price lists: trade + gastro net prices with quantity breaks (normally from vinX ProductInfo / SellingPrices)
    for (const v of rows) {
      const rate = v.discountGroup === "FOOD" ? 2.6 : 8.1;
      const net = Math.round(v.priceCents / (1 + rate / 100));
      const breaks = v.discountGroup === "WEIN" ? [[1, 0.8], [12, 0.76], [60, 0.72]] : [[1, 0.82], [10, 0.78]];
      for (const [min, f] of breaks) {
        priceRows.push({ variantId: v.id, groupId: tradeGroup.id, minQty: min, netCents: Math.round(net * f) });
        priceRows.push({ variantId: v.id, groupId: gastro.id, minQty: min, netCents: Math.round(net * (f - 0.03)) });
      }
    }
  }
  for (const part of chunk(priceRows, 1000)) await db.insert(schema.prices).values(part);
  home.spotlight.productSlug = spotlightSlug;

  // Shop-only articles (not in vinX): fully editable and deletable in the admin, unlike the synced range
  const antipasti = catIds.get("antipasti");
  for (const [slug, name, short, sku, price] of [
    ["geschenkkarton-duo", { de: "Geschenkkarton für zwei Flaschen", it: "Confezione regalo per due bottiglie" }, { de: "Stabiler Karton mit Seidenpapier — wird mit Ihren Weinen verpackt.", it: "Scatola robusta con carta velina — confezionata con i vostri vini." }, "GK-02", 9.5],
    ["degustation-gutschein", { de: "Gutschein Degustation in Kriens", it: "Buono degustazione a Kriens" }, { de: "Geführte Degustation mit sechs Weinen und Antipasti für zwei Personen.", it: "Degustazione guidata di sei vini con antipasti per due persone." }, "GS-DEG", 89],
  ] as const) {
    const [prod] = await db.insert(schema.products).values({ slug, kind: "food", name, short, categoryId: antipasti, ageRestricted: false, taxClass: "standard", active: true }).onConflictDoNothing().returning();
    if (prod) await db.insert(schema.variants).values({ productId: prod.id, sku, priceCents: Math.round(price * 100), stock: 50, discountGroup: "FOOD" });
  }
  // Page builder: the classic sections as blocks + origin map and a B2B call-to-action
  const base = homeBlocks(home);
  const at = base.findIndex((b) => b.id === "brands");
  home.blocks = [
    ...base.slice(0, at),
    { id: "origin", type: "origin", enabled: true, data: { eyebrow: { de: "Herkunft", it: "Provenienza" }, title: { de: "Aus ganz Italien — und der Schweiz", it: "Da tutta Italia — e dalla Svizzera" }, text: { de: "Vom Piemont bis Sizilien, vom Tessin bis in die Wachau — wählen Sie eine Region und entdecken Sie ihre Produzenten.", it: "Dal Piemonte alla Sicilia, dal Ticino alla Wachau — scegliete una regione e scoprite i suoi produttori." }, buttonLabel: { de: "Zur Karte", it: "Alla mappa" } } },
    ...base.slice(at),
    { id: "cta-trade", type: "cta", enabled: true, data: { eyebrow: { de: "Gastronomie", it: "Ristorazione" }, title: { de: "Ihre Konditionen, Ihr Portal.", it: "Le vostre condizioni, il vostro portale." }, text: { de: "Kundenpreise, Schnellbestellung und Bestellhistorie — für Restaurants, Hotels und Fachhandel.", it: "Prezzi cliente, ordine rapido e storico ordini — per ristoranti, hotel e rivenditori." }, buttonLabel: { de: "B2B-Konto eröffnen", it: "Aprire un conto B2B" }, buttonHref: "/trade#apply", tone: "primary" } },
  ];

  for (const [key, value] of Object.entries({ brand, shop, home, trade, story })) {
    await db.insert(schema.settings).values({ key, value }).onConflictDoNothing();
  }

  // Demo customers
  await db.insert(schema.users).values([
    {
      email: "gastro@demo.ch", passwordHash: await hashPassword("gastro-demo-1234"), name: "Marco Rossi", company: "Trattoria Demo GmbH",
      uidNumber: "CHE-123.456.789", role: "customer", groupId: gastro.id, tradeStatus: "approved", locale: "de", erpId: "41001", // vinX address id
      billing: { company: "Trattoria Demo GmbH", name: "Marco Rossi", street: "Pilatusstrasse 12", zip: "6003", city: "Luzern", country: "CH", phone: "+41 41 000 00 00" },
    },
    {
      email: "kunde@demo.ch", passwordHash: await hashPassword("kunde-demo-1234"), name: "Anna Muster", role: "customer",
      groupId: groups.find((g) => g.code === "consumer")!.id, locale: "de",
      billing: { name: "Anna Muster", street: "Musterweg 5", zip: "6010", city: "Kriens", country: "CH" },
    },
  ]);
  await db.insert(schema.coupons).values({ code: "BENVENUTO10", type: "percent", value: 10, minTotalCents: 10000, consumerOnly: true });

  // Demo B2B conditions (vinX model) — source "platform" = maintained in the shop admin.
  // With vinX connected these rows are synced (source "vinx") or vinX calculates live.
  const [marco] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, "gastro@demo.ch"));
  const variantBySku = async (sku: string) => (await db.query.variants.findFirst({ where: eq(schema.variants.sku, sku) }))?.id;
  const felicetti = await db.query.producers.findFirst({ where: eq(schema.producers.slug, "felicetti") });
  const in60 = new Date(Date.now() + 60 * 864e5);
  const sassella = await variantBySku("10679");
  await db.insert(schema.conditions).values([
    { type: "customer_discount", customerId: marco.id, targetType: "discount_group", target: "SPIRITUOSEN", calc: "percent", value: "8", label: { de: "Kundenrabatt 8 %", it: "Sconto cliente 8 %" } },
    ...(sassella ? [{ type: "special_price" as const, customerId: marco.id, targetType: "variant" as const, target: String(sassella), calc: "fixed_price" as const, value: "2950", label: { de: "Spezialpreis", it: "Prezzo speciale" } }] : []),
    { type: "customer_discount", groupId: gastro.id, targetType: "discount_group", target: "WEIN", calc: "percent", value: "3", label: { de: "Gastro-Rabatt Wein 3 %", it: "Sconto gastro vino 3 %" } },
    ...(felicetti ? [{ type: "quantity_discount" as const, groupId: gastro.id, targetType: "producer" as const, target: String(felicetti.id), calc: "percent" as const, value: "5", minQty: 24, label: { de: "Mengenrabatt ab 24 Stk. 5 %", it: "Sconto quantità da 24 pz. 5 %" } }] : []),
    { type: "free_goods", groupId: gastro.id, targetType: "category", target: String(catIds.get("rotwein")), calc: "n_for_m", buyQty: 12, payQty: 11, label: { de: "12 für 11", it: "12 per 11" } },
    { type: "promotion_discount", targetType: "category", target: String(catIds.get("olivenoel")), calc: "percent", value: "10", validTo: in60, onNetPrices: true, label: { de: "Aktion Olivenöl −10 %", it: "Promozione olio −10 %" } },
  ]);
  await seedLegalStubs(db, brand.legalName);
  await seedDaFerrari(db, { brand, home, D });

  // A page built from blocks (Admin › Inhalte › Seiten)
  await db.insert(schema.pages).values({
    slug: "fragen", title: { de: "Häufige Fragen", it: "Domande frequenti" }, body: {}, showInFooter: true,
    blocks: [
      { id: "faq-hero", type: "hero", enabled: true, data: { eyebrow: { de: "Service", it: "Servizio" }, title: { de: "Häufige Fragen", it: "Domande frequenti" }, text: { de: "Lieferung, Bestellung und Konditionen — kurz erklärt.", it: "Consegna, ordini e condizioni — in breve." }, image: `${D}/macchine.png`, primaryLabel: {}, primaryHref: "", secondaryLabel: {}, secondaryHref: "", height: "compact", stats: [] } },
      { id: "faq-list", type: "faq", enabled: true, data: { title: {}, items: [
        { q: { de: "Wann wird geliefert?", it: "Quando consegnate?" }, a: { de: "Gastronomie-Kunden beliefern wir wöchentlich mit unserer eigenen Tour in der ganzen Deutschschweiz. Privatkunden erhalten ihre Bestellung per Post in 1–3 Werktagen.", it: "Ai clienti della ristorazione consegniamo settimanalmente con il nostro giro in tutta la Svizzera tedesca. I privati ricevono l'ordine per posta in 1–3 giorni lavorativi." } },
        { q: { de: "Gibt es einen Mindestbestellwert?", it: "C'è un ordine minimo?" }, a: { de: "Für Geschäftskunden gilt ein Mindestbestellwert von **CHF 250 netto**. Privatkunden bestellen ohne Mindestwert.", it: "Per i clienti commerciali vale un ordine minimo di **CHF 250 netti**. I privati ordinano senza minimo." } },
        { q: { de: "Wie erhalte ich meine Kundenpreise?", it: "Come ottengo i miei prezzi cliente?" }, a: { de: "Eröffnen Sie ein [B2B-Konto](/trade#apply). Nach der Freigabe sehen Sie im Portal Ihre Preise, Rabatte und Aktionen.", it: "Aprite un [conto B2B](/trade#apply). Dopo l'approvazione vedete nel portale i vostri prezzi, sconti e promozioni." } },
        { q: { de: "Kann ich per Excel bestellen?", it: "Posso ordinare con Excel?" }, a: { de: "Ja — in der **Schnellbestellung** Artikelnummern und Mengen direkt aus Excel einfügen.", it: "Sì — nell'**ordine rapido** incollate numeri d'articolo e quantità direttamente da Excel." } },
      ] } },
      { id: "faq-cta", type: "cta", enabled: true, data: { eyebrow: {}, title: { de: "Noch Fragen?", it: "Altre domande?" }, text: { de: "Wir sind persönlich für Sie da.", it: "Siamo a vostra disposizione." }, buttonLabel: { de: "Kontakt", it: "Contatto" }, buttonHref: "/contact", tone: "muted" } },
    ],
  }).onConflictDoNothing();
}

/**
 * Demo storefront for a subsidiary: own domain (here: preview via /?storefront=daferrari), own brand,
 * a B2C-only delicatessen & wine assortment, own home page and legal pages, own customers and orders.
 */
async function seedDaFerrari(db: DB, main: { brand: ReturnType<typeof parseSettings<"brand">>; home: ReturnType<typeof parseSettings<"home">>; D: string }) {
  // runs inside the database bootstrap → write with `db` directly (getDb() would wait for itself)
  const consumer = await db.query.customerGroups.findFirst({ where: eq(schema.customerGroups.code, "consumer") });
  const [sf] = await db.insert(schema.storefronts).values({
    name: "Da Ferrari", slug: "daferrari", hosts: [], guestGroupId: consumer?.id ?? null,
    catalog: { kinds: ["food", "wine"], categoryIds: [], producerIds: [], includeIds: [], excludeIds: [] },
  }).returning();
  const mainShop = (await db.query.settings.findFirst({ where: eq(schema.settings.key, "shop") }))?.value;
  const shop = parseSettings("shop", mainShop);
  const saveSetting = async (key: "brand" | "shop" | "home", value: unknown) => {
    await db.insert(schema.settings).values({ key: `${key}@${sf.slug}`, value: parseSettings(key, value) }).onConflictDoNothing();
  };
  await seedLegalStubs(db, "Da Ferrari (Demo)", sf.id);
  await saveSetting("brand", {
    ...main.brand,
    name: "Da Ferrari",
    legalName: "Da Ferrari (Demo)",
    claim: "Gastronomia italiana",
    tagline: { de: "Italienische Feinkost & Weine für zu Hause", it: "Gastronomia e vini italiani per la casa" },
    logoUrl: "", logoInverseUrl: "", faviconUrl: "",
    colors: {
      background: "#f6f2e9", foreground: "#1f2a22", primary: "#2f5d46", primaryForeground: "#ffffff",
      muted: "#ece5d6", mutedForeground: "#5f675f", accent: "#c8873a", border: "#e0d8c7", card: "#fffdf8",
      inverse: "#1f3a2d", inverseForeground: "#f6f2e9",
    },
    fonts: { display: "Playfair Display", body: "Lato", displayUppercaseEyebrows: true },
    radius: 10, buttonStyle: "pill", buttonCase: "normal",
    contact: { ...main.brand.contact, email: "ciao@daferrari.example", phone: "" },
    announcement: { de: "Demo-Storefront einer Tochterfirma · gleiche Plattform, eigene Marke", it: "Storefront demo di una consociata · stessa piattaforma, marchio proprio" },
    footerQuote: { de: "Was in Italien auf den Tisch kommt — für Ihre Küche ausgewählt.", it: "Quello che in Italia arriva in tavola — scelto per la vostra cucina." },
  });
  await saveSetting("shop", {
    ...shop, locales: ["de", "it"], orderPrefix: "DF", channels: { mode: "shop-only", portalHost: "", shopHost: "" },
    originMap: { ...shop.originMap, world: false }, modules: { ...shop.modules, story: false, trade: false },
  });
  await saveSetting("home", {
    ...main.home,
    blocks: undefined,
    hero: {
      eyebrow: { de: "Gastronomia · Online", it: "Gastronomia · Online" },
      title: { de: "Italien für die eigene Küche.", it: "L'Italia nella vostra cucina." },
      text: { de: "Pasta, Öl, Antipasti und Weine aus kleinen Betrieben — ausgewählt für zu Hause, geliefert in 1–3 Tagen.", it: "Pasta, olio, antipasti e vini da piccole aziende — scelti per la casa, consegnati in 1–3 giorni." },
      imageUrl: `${main.D}/pasta-farine.jpg`,
      primary: { label: { de: "Zum Sortiment", it: "All'assortimento" }, href: "/shop" },
      secondary: null,
    },
    stats: [],
    story: { ...main.home.story, show: false },
    spotlight: { ...main.home.spotlight, show: false },
  });
}

type DemoProduct = {
  name: string; category: string; kind: "wine" | "food" | "spirit" | "beverage"; producer: string; producerErp?: string; region?: string | null; country?: string; curated?: boolean;
  color: "red" | "white" | "rose" | "sparkling" | "sweet" | null; alcohol: number | null; image: string | null;
  variants: { sku: string; vintage: string | null; size: string | null; price: number; stock: number }[];
};

