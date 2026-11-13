/** Column names recognised by the customer import (DE / IT / FR / EN), shared by the admin page and the importer. */
export const FIELDS = {
  email: ["email", "e-mail", "mail", "emailadresse", "e-mailadresse", "courriel", "posta elettronica"],
  name: ["name", "kontakt", "kontaktperson", "ansprechpartner", "contact", "fullname", "nominativo", "referente"],
  firstName: ["vorname", "firstname", "first name", "prenom", "prénom", "nome"],
  lastName: ["nachname", "lastname", "last name", "nom", "cognome", "familienname"],
  company: ["firma", "company", "unternehmen", "betrieb", "companyname", "ragione sociale", "ragionesociale", "societa", "société", "entreprise", "firmenname"],
  uid: ["uid", "uid-nr", "uidnummer", "mwst-nr", "mwstnr", "vat", "vatnumber", "vat number", "partita iva", "piva", "ide", "tva"],
  phone: ["telefon", "phone", "tel", "telefono", "téléphone", "mobile", "natel", "handy", "phonebusiness"],
  street: ["strasse", "straße", "street", "adresse", "address", "via", "indirizzo", "rue", "address1"],
  zip: ["plz", "zip", "zipcode", "postcode", "postleitzahl", "cap", "npa", "code postal"],
  city: ["ort", "city", "stadt", "citta", "città", "localita", "località", "ville", "town"],
  country: ["land", "country", "paese", "pays", "countrycode", "iso", "länderkennzeichen"],
  language: ["sprache", "language", "lingua", "langue", "locale"],
  group: ["gruppe", "kundengruppe", "group", "customergroup", "preisgruppe", "pricegroup", "gruppo", "groupe"],
  erpId: ["kundennummer", "kundennr", "kunden-nr", "customernumber", "customer number", "adressnummer", "addressnumber", "addressid", "erpid", "erp-id", "vinx", "debitor", "debitorennummer", "numero cliente", "n. cliente", "numéro client"],
  b2b: ["b2b", "geschäftskunde", "geschaeftskunde", "gewerbe", "trade", "business", "gastro", "wiederverkäufer"],
} as const;
export type FieldKey = keyof typeof FIELDS;
