import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readCsv, readTable, readXml } from "~/.server/import/table";
import { detectMapping, toRows } from "~/.server/import/customers";

describe("customer import — file readers", () => {
  it("reads semicolon CSV with quotes, BOM and Windows line endings", () => {
    const t = readCsv('﻿E-Mail;Firma;Ort\r\n"a@b.ch";"Trattoria ""Da Mario""";Kriens\r\nc@d.ch;;Luzern\r\n');
    expect(t.headers).toEqual(["E-Mail", "Firma", "Ort"]);
    expect(t.rows[0].Firma).toBe('Trattoria "Da Mario"');
    expect(t.rows).toHaveLength(2);
  });
  it("reads comma CSV", () => {
    expect(readCsv("email,name\nx@y.ch,X").rows[0]).toEqual({ email: "x@y.ch", name: "X" });
  });
  it("reads Excel .xlsx (shared strings + numbers)", () => {
    const t = readTable("kunden.xlsx", new Uint8Array(readFileSync("tests/fixtures/customers.xlsx")));
    expect(t.headers).toEqual(["E-Mail", "Firma", "Ort", "Kundennummer"]);
    expect(t.rows[0]).toEqual({ "E-Mail": "anna@example.ch", Firma: "Osteria Bella & Co", Ort: "Luzern", Kundennummer: "41077" });
  });
  it("reads XML records (elements and attributes)", () => {
    const t = readXml('<?xml version="1.0"?><kunden><kunde nr="7"><email>a@b.ch</email><firma>A &amp; B</firma></kunde><kunde nr="8"><email>c@d.ch</email></kunde></kunden>');
    expect(t.rows).toEqual([{ nr: "7", email: "a@b.ch", firma: "A & B" }, { nr: "8", email: "c@d.ch", firma: "" }]);
  });
});

describe("customer import — mapping", () => {
  it("recognises German, Italian and English headers", () => {
    expect(detectMapping(["E-Mail", "Vorname", "Nachname", "Firma", "PLZ", "Ort", "Kundennummer"])).toMatchObject({ email: "E-Mail", firstName: "Vorname", lastName: "Nachname", company: "Firma", zip: "PLZ", city: "Ort", erpId: "Kundennummer" });
    expect(detectMapping(["Ragione sociale", "Indirizzo", "CAP", "Città", "Partita IVA"])).toMatchObject({ company: "Ragione sociale", street: "Indirizzo", zip: "CAP", city: "Città", uid: "Partita IVA" });
  });
  it("builds rows, flags invalid e-mails and derives B2B from company", () => {
    const table = readCsv("E-Mail;Vorname;Nachname;Firma;Land\nanna@x.ch;Anna;Muster;;Schweiz\nkaputt;Bob;B;Bar AG;IT");
    const rows = toRows(table, detectMapping(table.headers));
    expect(rows[0]).toMatchObject({ email: "anna@x.ch", name: "Anna Muster", b2b: false, billing: { country: "CH" } });
    expect(rows[1].error).toBeTruthy();
    expect(rows[1].b2b).toBe(true);
  });
});
