# Vertrieb & Lizenzierung (für den Rechteinhaber)

Die Plattform ist proprietär ([LICENSE](../LICENSE)): Alle Rechte liegen beim Rechteinhaber, der sie an Kunden lizenziert.
Dieses Dokument beschreibt, was zum Vertrieb gehört. **Keine Rechtsberatung** — den Lizenzvertrag vor dem ersten Verkauf von einer Anwältin / einem Anwalt (Schweizer IT-/Vertragsrecht) prüfen lassen.

## 1. Was Kunden bekommen (Kundendistribution)

| Weg | Befehl | Inhalt |
|---|---|---|
| Archiv für eigene Server / Hoster | `npm run release` → `release/shop-<version>.tar.gz` | Build, Migrationen, Doku, LICENSE, NOTICE, THIRD_PARTY_LICENSES |
| Docker-Image | `docker build .` (Standard: `SHOP_DIST=customer`) | dito, als Image |
| Gehosteter Betrieb (SaaS / Managed) | eigene Installation je Kunde, gebaut mit `SHOP_DIST=customer` | Kunde erhält keinen Code |

Die Kundendistribution (`SHOP_DIST=customer`) enthält **keine Demo-Inhalte**: Der De-Simoni-Seed wird nicht gebündelt, `public/demo` (Logos, Fotos, Produzentenmarken) wird entfernt. Eine neue Installation startet mit neutralen Vorlagen. Die Demo (Vercel) wird ohne diese Variable gebaut und bleibt unverändert.

Den Quellcode (dieses Repository) erhalten Kunden nur, wenn der Vertrag das ausdrücklich vorsieht (z. B. Agentur-/Source-Lizenz). Das Repository bleibt privat.

## 2. Lizenzschlüssel

Jede Kundeninstallation erhält einen signierten Schlüssel (Ed25519). Er wird offline geprüft — kein «Nach-Hause-Telefonieren», kein externer Dienst. Admin › System zeigt Lizenznehmer, Paket, Domains und Ablaufdatum; die Go-live-Checkliste meldet fehlende, ungültige, abgelaufene oder domainfremde Lizenzen. Der Shop wird dabei **nie gesperrt** (keine Gefahr für laufende Bestellungen); die Durchsetzung erfolgt vertraglich.

Einmalig (nur der Rechteinhaber, lokal):

```bash
npm run licence -- keygen
# → licence-private.pem  (im Passwortmanager / Tresor sichern, NIE committen — .gitignore schützt *.pem)
# → druckt den öffentlichen Schlüssel: in app/.server/licence-key.ts einfügen und committen
```

Pro Kunde:

```bash
npm run licence -- issue --licensee "Weinhandel Muster AG" --domains shop.muster.ch,b2b.muster.ch --plan business --expires 2027-12-31
# → LICENSE_KEY=…  (dem Kunden geben bzw. in seiner Umgebung setzen)
npm run licence -- verify <key>
```

- `--domains`: Hosts der Installation, `*.muster.ch` für Subdomains, leer = alle. Für die separaten Shop-Domains eines Kunden (Tochterfirmen, siehe Admin › Storefronts) alle Domains aufnehmen.
- `--expires`: Ende der Lizenz-/Wartungsperiode; ohne Angabe unbefristet.
- Geht der private Schlüssel verloren, kann kein neuer Schlüssel mehr ausgestellt werden, der zur ausgelieferten Version passt → neues Schlüsselpaar, neue Version, alle Kunden neu lizenzieren. Deshalb sicher aufbewahren.

## 3. Lizenzmodelle (Vorschlag)

| Modell | Für | Typischer Inhalt |
|---|---|---|
| **Jahreslizenz Self-hosted** | Händler mit eigener IT / Hoster | Nutzungsrecht 1 Installation, n Domains, Updates & Sicherheitsfixes während der Laufzeit, Support per E-Mail |
| **Managed / SaaS** | Händler ohne IT | Betrieb, Backups, Updates durch den Rechteinhaber; Kunde erhält keine Software, nur Nutzung |
| **Agentur / White-Label** | Agenturen, die für eigene Kunden einrichten | Mehrere Installationen, Weiterlizenzierung nur an benannte Endkunden, Quellcodezugang optional |
| **Einrichtung & Anpassungen** | alle | Branding, vinX-Anbindung, Datenimport, Erweiterungen in `custom/` (gehören dem Kunden, LICENSE §2c) |

## 4. Vorlage Lizenzvertrag (Eckpunkte)

1. **Parteien** — Rechteinhaber (Lizenzgeber) · Kunde (Lizenznehmer).
2. **Gegenstand** — Software «[Produktname]» in der jeweils aktuellen Version, Kundendistribution; Dokumentation.
3. **Nutzungsrecht** — nicht exklusiv, nicht übertragbar, für [1] Installation und die Domains [ … ], für den eigenen Geschäftsbetrieb des Lizenznehmers (inkl. Tochtergesellschaften gemäss Anhang). Keine Weitergabe, kein Weiterverkauf, keine Unterlizenzierung.
4. **Laufzeit & Kündigung** — [12] Monate, stillschweigende Verlängerung, Kündigungsfrist [3] Monate. Nach Ende: Nutzung einstellen (bzw. bei Perpetual-Modell: letzte Version weiter nutzbar, ohne Updates).
5. **Vergütung** — Einrichtung [CHF …] einmalig; Lizenz/Wartung [CHF …] pro Jahr; Zahlung im Voraus.
6. **Updates & Support** — Sicherheits- und Funktionsupdates während der Laufzeit; Reaktionszeiten; Support-Kanal.
7. **Kundenanpassungen** — Code in `custom/` und eigene Inhalte (Texte, Bilder, Daten) gehören dem Kunden.
8. **Daten & Datenschutz** — Kundendaten gehören dem Kunden; bei Managed-Betrieb Auftragsbearbeitungsvereinbarung (DSG/DSGVO); Hosting-Standort.
9. **Gewährleistung & Haftung** — Beschränkung auf [Jahresvergütung]; Ausschluss für Folgeschäden, soweit gesetzlich zulässig; keine Haftung für Drittsysteme (ERP, Zahlungsanbieter).
10. **Drittkomponenten** — Open-Source-Komponenten unter ihren eigenen Lizenzen (THIRD_PARTY_LICENSES.md, NOTICE.md), alle permissiv; Kartendaten mit Quellenangabe.
11. **Vertraulichkeit**, **Schlussbestimmungen** — Schweizer Recht, Gerichtsstand [Sitz des Lizenzgebers].

## 5. Vor dem ersten Verkauf

- [ ] Rechteinhaber in `LICENSE` prüfen (natürliche Person oder Firma, z. B. «… GmbH»); Kontaktadresse statt GitHub-Link.
- [ ] `npm run licence -- keygen`, öffentlichen Schlüssel committen, privaten sicher ablegen.
- [ ] Lizenzvertrag/AGB juristisch prüfen lassen (Punkt 4).
- [ ] Italien-Karte: Lizenz der Quelle (openpolis/ISTAT) bestätigen oder `it.json` mit Natural Earth bauen (`scripts/maps/build-region-maps.py … IT`), siehe NOTICE.md.
- [ ] Demo nur mit schriftlicher Zustimmung der gezeigten Marken öffentlich zeigen (NOTICE.md).
- [ ] Produktname / Marke für den Vertrieb festlegen (ggf. Markeneintrag beim IGE).
