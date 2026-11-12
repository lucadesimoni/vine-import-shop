import type { CustomerPayload, ErpClient, OrderPayload, Raw } from "./client";

/** RFC-4180-ish CSV parser (auto-detects ; , or tab). Handles quotes and BOM. */
export function parseCsv(text: string): Raw[] {
  text = text.replace(/^﻿/, "");
  const firstLine = text.slice(0, text.indexOf("\n") >>> 0);
  const delim = [";", "\t", ","].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c !== "")) rows.push(row);
  const [header, ...data] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

/** Decode uploaded bytes: UTF-8 if valid, else Windows-1252 (typical for Swiss ERP exports). */
export function decodeUpload(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * File-exchange driver: ERP exports (articles / stock / prices) are uploaded in
 * Admin or POSTed to /api/vinx/import (token-protected) — works on every host,
 * including serverless. Outbound orders are queued and exposed for pickup at
 * /api/vinx/orders.csv (token-protected) for ERP import.
 */
export class CsvClient implements ErpClient {
  readonly name = "CSV file exchange";
  readonly mapping = "csv" as const;
  constructor(private files: { articles?: string; stock?: string; prices?: string } = {}) {}
  async ping() {
    return "CSV mode — upload exports in Admin or POST to /api/vinx/import";
  }
  async *articles() { yield* parseCsv(this.files.articles ?? ""); }
  async *stock() { yield* parseCsv(this.files.stock ?? ""); }
  async *prices() { yield* parseCsv(this.files.prices ?? ""); }
  async pushOrder(p: OrderPayload) { return p.order.number; } // picked up via /api/vinx/orders.csv
  async pushCustomer(p: CustomerPayload) { return `web-${p.id}`; }
}
