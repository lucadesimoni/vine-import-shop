# Handbuch für Shop-Betreiber

Dieses Handbuch beschreibt den Alltag im Admin (`/admin`). Technische Einrichtung, Hosting und vinX-Anbindung stehen in [DEPLOY.md](DEPLOY.md), [HOSTING.md](HOSTING.md) und [VINX.md](VINX.md).

## Anmelden und Zugänge

- **Admin:** `https://<ihr-shop>/login` mit E-Mail und Passwort. Beim ersten Login einer Neuinstallation verlangt der Shop ein neues Passwort.
- **Mitarbeitende** (Admin › Mitarbeitende, nur für Administratoren): Person per E-Mail einladen. Sie erhält einen Link (14 Tage gültig) und setzt ihr Passwort selbst.
  - **Administrator:** darf alles.
  - **Mitarbeiter:** Bestellungen, Produkte, Produzenten, Kunden, Konditionen und Inhalte, aber keine Einstellungen, kein Design, keine Storefronts, kein vinX, kein System und keine Mitarbeitenden.
  - Mindestens ein Administrator bleibt immer bestehen; den eigenen Zugang kann man dort nicht ändern.
- **Kundinnen und Kunden** melden sich mit Passwort an oder lassen sich einen **Login-Link per E-Mail** schicken (15 Minuten gültig, einmal verwendbar). Mitarbeitende melden sich immer mit Passwort an.
- **Protokoll** (Admin › Protokoll): Wer hat wann was geändert, inklusive Anmeldungen im Admin, mit Suche und Filtern. Formularinhalte werden nicht gespeichert; Einträge bleiben 365 Tage.

## Bestellungen

Admin › Bestellungen: Liste mit Filtern (Status, Kanal B2B/B2C, Zahlung, vinX, Zeitraum) und CSV-Export.

- **Status setzen:** in der Bestellung oder als Massenaktion. Kunden erhalten bei den eingestellten Status eine E-Mail, je Status einmal, in ihrer Sprache.
- **Versand:**
  - Versanddienst und Sendungsnummer eintragen; der Tracking-Link erscheint in der Mail und im Kundenkonto.
  - Mit Swiss-Post-Zugang erstellt der Shop das **Post-Etikett** direkt (Einstellungen › Versand).
- **vinX:** Bestellungen gehen automatisch an vinX. Bei Fehlern zeigt die Liste den Status «Fehler»; unter vinX › Ausgang können Sie sie erneut senden.
- **Anfragen** (B2B-Offertanfragen) erscheinen als eigene Art in derselben Liste.

## Produkte

Admin › Produkte: Suche, Filter (Kategorie, Produzent, Status, Merkmale wie «Ohne Bild», «Bild nicht optimiert», «Bild von Hand bearbeitet») und Massenaktionen (aktiv/inaktiv, Aktion, Empfohlen, nur B2B, Bildstandard, löschen).

- **Felder mit Schloss** pflegt vinX (z. B. Preise, Lager, Aktiv), sie werden beim nächsten Abgleich überschrieben. Texte, Bilder, Zuordnung und Sichtbarkeit pflegen Sie im Shop.
- **Texte** sind mehrsprachig; eine leere Sprache zeigt die Standardsprache.
- **Bild:** hochladen oder eine Bild-URL eintragen. Der Shop erstellt automatisch optimierte Versionen (WebP, 1200 und 480 px).

### Bild bearbeiten

Produkt › **Bild bearbeiten**. Das Original bleibt immer erhalten; «Zurücksetzen» stellt es wieder her.

- **Ausrichtung:** 90° drehen, spiegeln, gerade richten (±15°; schiefe Ecken werden automatisch abgeschnitten).
- **Zuschneiden:** Rahmen auf dem Original ziehen; bei gewähltem Format bleibt das Seitenverhältnis erhalten.
- **Freistellen:** entfernt einen hellen, gleichmässigen Hintergrund (Packshots auf Weiss oder Grau). Weisse Etiketten im Produkt bleiben erhalten. Mit dem Regler «Toleranz» stellen Sie ein, wie viel Hintergrund wegfällt.
- **Leere Ränder entfernen, Format** (1:1, 3:4, 4:5, 2:3), **Rand** und **Hintergrund** (transparent, weiss oder eine Farbe), **weicher Schatten**.
- Rechts sehen Sie das Ergebnis, wie es im Shop erscheint.

### Bildstandard für alle Produkte

Einstellungen › **Produktbilder**: Format, Rand, Hintergrund, Freistellen und Schatten einmal festlegen.

- Der Standard gilt automatisch für neue Bilder.
- «Speichern & alle Produktbilder aufbereiten» wendet ihn auf alle Bilder an, die nicht von Hand bearbeitet wurden. Bei vielen Produkten läuft das in mehreren Durchgängen weiter.
- Einzelne Bilder bearbeiten Sie danach wie oben beschrieben; Handbearbeitungen werden nie überschrieben.

## Produzenten

Admin › Produzenten: Name, Region und Land (für die Herkunftskarte), Beschreibung, Website und Logo (SVG, PNG oder WebP mit transparentem Hintergrund). Die Produzentenseite im Shop zeigt das Sortiment und die Herkunft auf der Karte.

## Kunden

Admin › Kunden.

- **B2B-Anträge** (Badge in der Navigation): prüfen, Kundengruppe zuweisen, **freigeben** oder ablehnen. Freigegebene Geschäftskunden sehen ihre Preise und bestellen im Portal.
- **Einladen:** Konten für bestehende Kunden anlegen und einladen; die Person setzt ihr Passwort selbst.
- **Import:** Kunden aus CSV, Excel oder XML übernehmen (Spalten werden erkannt, Zuordnung prüfbar).
- **Zahlungsarten pro Kunde:** überschreiben die Einstellungen aus vinX und der Kundengruppe.
- Mit vinX verknüpfte Kunden erhalten Adressen, Konditionen, Liefertage und Aussendienst aus vinX.

## Konditionen

Admin › Konditionen: Rabatte und Spezialpreise für alle, eine Kundengruppe oder einzelne Kunden; für das ganze Sortiment oder je Artikel, Produkt, Rabattgruppe, Kategorie oder Produzent; mit Mindestmenge und Gültigkeit. «Pausieren» deaktiviert eine Kondition, ohne sie zu löschen. Konditionen aus vinX werden dort gepflegt.

## Inhalte und Design

- **Design & Marke** (Administratoren): Name, Logos, Farben, Schriften, Ecken, Buttons, Kontakt und Öffnungszeiten, mit Live-Vorschau.
- **Inhalte:** Startseite, Gastronomie-Seite, Geschichte und eigene Seiten aus Bausteinen (Hero, Kategorien, Aktionen, Bild/Text, FAQ …) per Drag & Drop, mehrsprachig.
- **Rechtliche Seiten** (Impressum, AGB, Datenschutz) sind Seiten unter Inhalte; bitte vor dem Livegang prüfen.

## Einstellungen (Administratoren)

Sprachen, Verkaufsmodell und Preisanzeige je Kundengruppe, Kanäle (gemeinsamer Shop oder getrennter B2B-Bereich mit eigener Domain), Zahlungsarten, Versandarten und -kosten, Status-Mails und Swiss-Post-Etiketten, Lager- und Steuereinstellungen, Herkunftskarte sowie Produktbilder.

**Storefronts:** weitere Shops (z. B. einer Tochterfirma) mit eigener Domain, eigener Marke, eigenem Sortiment und eigenen Kunden. Einstellungen und Inhalte gelten pro Storefront oder werden vom Hauptshop übernommen. Siehe [STOREFRONTS.md](STOREFRONTS.md).

## vinX ERP (Administratoren)

Admin › vinX ERP:
- Verbindung und Feld-Zuordnung.
- Jobs von Hand starten: Artikel, Lager, Preise, Spezialpreise, Kunden, Bestellstatus, Bilder.
- Ausgang (Bestellungen an vinX) mit «Erneut senden».
- Protokoll der Abgleiche.

Die Jobs laufen automatisch im Hintergrund. Lange Abgleiche setzen beim nächsten Durchgang fort; «Teilweise — wird fortgesetzt» ist also normal.

## System (Administratoren)

- **Go-live-Checkliste:** zeigt, was vor dem Start noch fehlt (Passwort, Rechtliches, Mail, Zahlungsanbieter, Lizenz …).
- **Backups:** automatisch täglich und vor jedem Update; «Backup jetzt erstellen» für ein Backup von Hand; herunterladen für eine Kopie ausserhalb des Servers.
- **Version und Updates:** Die installierte Version steht in der Seitenleiste. Updates beschreibt [UPDATING.md](UPDATING.md); im Hosting mit `shopctl` laufen sie automatisch mit Rücksprung bei Fehlern.
- **Lizenz:** Lizenznehmer, Paket, Domains und Gültigkeit.

## Hilfe

Fragen zum Produkt und zur Lizenz: über den Lizenzgeber (siehe Admin › System). Technische Hinweise für die IT stehen im Ordner `docs/`.
