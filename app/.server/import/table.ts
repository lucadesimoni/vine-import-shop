import { inflateRawSync } from "node:zlib";

/**
 * Tabular file readers for admin imports — no dependencies:
 *  - CSV / TSV (delimiter auto-detected, quotes, BOM, Excel "CSV UTF-8")
 *  - Excel .xlsx (first worksheet; shared + inline strings)
 *  - XML (the most frequent repeating element becomes a row; child elements and attributes become columns)
 * Every reader returns { headers, rows } with rows as string records.
 */
export type Table = { headers: string[]; rows: Record<string, string>[] };
const MAX_ROWS = 20000;

export function readTable(name: string, bytes: Uint8Array): Table {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xlsx")) return readXlsx(bytes);
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

/* ── XLSX (zip + XML) ────────────────────────────────────────────────── */

function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
  const buf = Buffer.from(bytes);
  const out = new Map<string, Uint8Array>();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Keine gültige Excel-Datei (.xlsx)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (/^xl\/(sharedStrings|workbook|worksheets\/sheet\d+)\.xml$/.test(name)) out.set(name, method === 8 ? inflateRawSync(data) : data);
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

const decodeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");
const colIndex = (ref: string) => [...ref.replace(/\d+$/, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export function readXlsx(bytes: Uint8Array): Table {
  const files = unzip(bytes);
  const td = new TextDecoder();
  const shared = [...td.decode(files.get("xl/sharedStrings.xml") ?? new Uint8Array()).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decodeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  const sheetName = [...files.keys()].filter((k) => k.startsWith("xl/worksheets/")).sort()[0];
  if (!sheetName) throw new Error("Keine Tabelle in der Excel-Datei gefunden");
  const xml = td.decode(files.get(sheetName));
  const records: string[][] = [];
  for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], inner = c[2] ?? "";
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /t="(\w+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      const value = type === "s" ? shared[Number(v)] ?? "" : type === "inlineStr" ? decodeXml([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")) : decodeXml(v ?? "");
      row[ref ? colIndex(ref) : row.length] = value;
    }
    if (row.some((x) => x?.trim())) records.push(Array.from(row, (x) => x ?? ""));
    if (records.length > MAX_ROWS) break;
  }
  return toTable(records);
}

/* ── XML ─────────────────────────────────────────────────────────────── */

export function readXml(text: string): Table {
  const xml = text.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g, "");
  // candidate record element: the most frequent element that has child elements
  const counts = new Map<string, number>();
  for (const m of xml.matchAll(/<([A-Za-z_][\w.-]*)(\s[^>]*)?>\s*</g)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  const record = [...counts].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1])[0]?.[0] ?? [...counts.keys()][1];
  if (!record) throw new Error("Keine Datensätze im XML gefunden");
  const rows: Record<string, string>[] = [];
  const headers = new Set<string>();
  for (const m of xml.matchAll(new RegExp(`<${record}(\\s[^>]*)?>([\\s\\S]*?)</${record}>`, "g"))) {
    const r: Record<string, string> = {};
    for (const a of (m[1] ?? "").matchAll(/([\w:.-]+)="([^"]*)"/g)) r[a[1]] = decodeXml(a[2]);
    for (const c of m[2].matchAll(/<([\w:.-]+)(?:\s[^>]*)?>([^<]*)<\/\1>/g)) r[c[1]] = decodeXml(c[2].trim());
    Object.keys(r).forEach((k) => headers.add(k));
    rows.push(r);
    if (rows.length > MAX_ROWS) break;
  }
  const hs = [...headers];
  return { headers: hs, rows: rows.map((r) => Object.fromEntries(hs.map((h) => [h, r[h] ?? ""]))) };
}
