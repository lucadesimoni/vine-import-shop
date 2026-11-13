import type { DB } from "../db";
import { schema } from "../db";

/** Brand-neutral legal page templates (imprint, terms, privacy) for a fresh installation. */
export async function seedLegalStubs(db: DB, company: string, storefrontId: number | null = null) {
  const note = "> Vorlage — bitte durch eigene, rechtlich geprüfte Texte ersetzen (Admin → Inhalte).\n\n";
  const noteIt = "> Modello — sostituire con testi propri verificati legalmente (Admin → Contenuti).\n\n";
  await db.insert(schema.pages).values([
    { slug: "impressum", title: { de: "Impressum", it: "Colophon", fr: "Mentions légales", en: "Imprint" }, body: { de: `${note}## ${company}\n\nAdresse, Handelsregister, UID und Vertretungsberechtigte.`, it: `${noteIt}## ${company}\n\nIndirizzo, registro di commercio, IDI e persone autorizzate a rappresentare.` } },
    { slug: "agb", title: { de: "AGB", it: "CG", fr: "CG", en: "Terms" }, body: { de: `${note}## Geltungsbereich\n\nDiese AGB gelten für alle Bestellungen bei ${company}.\n\n## Preise\n\nAlle Preise in CHF. Geschäftskunden: exkl. MWST.\n\n## Alter\n\nAlkoholische Getränke werden nur an Personen ab 18 Jahren abgegeben.`, it: `${noteIt}## Campo di applicazione\n\nLe presenti CG valgono per tutti gli ordini presso ${company}.\n\n## Prezzi\n\nTutti i prezzi in CHF. Clienti commerciali: IVA esclusa.\n\n## Età\n\nLe bevande alcoliche vengono consegnate solo a persone maggiorenni (18 anni).` } },
    { slug: "datenschutz", title: { de: "Datenschutz", it: "Protezione dei dati", fr: "Protection des données", en: "Privacy" }, body: { de: `${note}Verantwortlich: ${company}.\n\nWir bearbeiten Personendaten nach dem Schweizer Datenschutzgesetz (DSG). Schriften werden über Bunny Fonts (EU) geladen, es werden keine Tracking-Dienste eingesetzt.`, it: `${noteIt}Responsabile: ${company}.\n\nTrattiamo i dati personali secondo la legge svizzera sulla protezione dei dati (LPD). I caratteri vengono caricati tramite Bunny Fonts (UE), non vengono utilizzati servizi di tracciamento.` } },
  ].map((p) => ({ ...p, storefrontId }))).onConflictDoNothing();
}
