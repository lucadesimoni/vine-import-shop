#!/usr/bin/env node
// Every UI text key in the German master (app/lib/i18n/de.ts) must exist in it/fr/en, and placeholders must match.
//   npm run i18n:check
import { readFileSync } from "node:fs";

const read = (l) => {
  const src = readFileSync(new URL(`../app/lib/i18n/${l}.ts`, import.meta.url), "utf8");
  return new Map([...src.matchAll(/"([\w.-]+)":\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => [m[1], m[2]]));
};
const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const de = read("de");
let problems = 0;
for (const l of ["it", "fr", "en"]) {
  const m = read(l);
  const missing = [...de.keys()].filter((k) => !m.has(k));
  const unknown = [...m.keys()].filter((k) => !de.has(k));
  const badVars = [...m].filter(([k, v]) => de.has(k) && vars(de.get(k)) !== vars(v)).map(([k]) => k);
  for (const [label, list] of [["missing", missing], ["not in de.ts", unknown], ["placeholder mismatch", badVars]]) {
    if (list.length) { problems += list.length; console.error(`${l}: ${list.length} ${label}: ${list.join(", ")}`); }
  }
  if (!missing.length && !unknown.length && !badVars.length) console.log(`${l}: ${m.size}/${de.size} keys ✓`);
}
process.exit(problems ? 1 : 0);
