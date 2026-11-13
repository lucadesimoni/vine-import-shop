/**
 * Tabular file readers for admin imports — no dependencies:
 *  - CSV / TSV (delimiter auto-detected, quotes, BOM, Excel "CSV UTF-8")
 *  - XML (the most frequent repeating element becomes a row; child elements and attributes become columns)
 * Every reader returns { headers, rows } with rows as string records.
 */
export type Table = { headers: string[]; rows: Record<string, string>[] };
const MAX_ROWS = 20000;

export function readTable(name: string, bytes: Uint8Array): Table {
  const lower = name.toLowerCase();
  if (/\.(xlsx?|ods)$/.test(lower)) throw new Error("Bitte als CSV oder XML exportieren (in Excel: Speichern unter › CSV UTF-8).");
  const text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
  if (lower.endsWith(".xml") || /^\s*<\?xml|^\s*<[A-Za-z]/.test(text)) return readXml(text);
  return readCsv(text);
}

/* ── CSV ─────────────────────────────────────────────────────────────── */

export function readCsv(text: string): Table {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = [";", ",", "\t", "|"].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const records: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim())) records.push(row);
      row = [];
      if (records.length > MAX_ROWS) break;
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim())) records.push(row);
  return toTable(records);
}

function toTable(records: string[][]): Table {
  const [head = [], ...body] = records;
  const headers = head.map((h, i) => h.trim() || `Spalte ${i + 1}`);
  return { headers, rows: body.slice(0, MAX_ROWS).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()]))) };
}

const decodeXml = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");

/* ── XML ─────────────────────────────────────────────────────────────── */

export function readXml(text: string): Table {
  const xml = text.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g, "");
  // candidate record element: the most frequent element that has child elements
  const counts = new Map<string, number>();
  for (const m of xml.matchAll(/<([A-Za-z_][\w.:-]*)(\s[^>]*)?>(?=\s*<(?!\/))/g)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  const record = [...counts].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1])[0]?.[0] ?? [...counts.keys()][1];
  if (!record) throw new Error("Keine Datensätze im XML gefunden");
  const rows: Record<string, string>[] = [];
  const headers = new Set<string>();
  for (const m of xml.matchAll(new RegExp(`<${record.replace(/[.]/g, "\\.")}(\\s[^>]*)?>([\\s\\S]*?)</${record.replace(/[.]/g, "\\.")}>`, "g"))) {
    const r: Record<string, string> = {};
    for (const a of (m[1] ?? "").matchAll(/([\w:.-]+)="([^"]*)"/g)) r[a[1]] = decodeXml(a[2]);
    for (const c of m[2].matchAll(/<([\w:.-]+)(?:\s[^>]*)?>((?:<!\[CDATA\[[\s\S]*?\]\]>|[^<])*)<\/\1>/g)) r[c[1].replace(/^[\w-]+:/, "")] = decodeXml(c[2].trim());
    Object.keys(r).forEach((k) => headers.add(k));
    rows.push(r);
    if (rows.length > MAX_ROWS) break;
  }
  const hs = [...headers];
  return { headers: hs, rows: rows.map((r) => Object.fromEntries(hs.map((h) => [h, r[h] ?? ""]))) };
}
