#!/usr/bin/env node
// Prints the CHANGELOG section of a version (used as GitHub release notes): node scripts/release-notes.mjs 1.2.0
import { readFileSync } from "node:fs";
const v = (process.argv[2] ?? JSON.parse(readFileSync("package.json", "utf8")).version).replace(/^v/, "");
const log = readFileSync("CHANGELOG.md", "utf8");
const m = log.match(new RegExp(`## \\[${v.replace(/\./g, "\\.")}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## \\[|\\n\\[Unreleased\\]:)`));
process.stdout.write((m?.[1] ?? "").trim() + "\n\n---\nUpdate & rollback: see docs/UPDATING.md · Archive: shop-" + v + ".tar.gz · Image: ghcr.io/<repo>:v" + v + "\n");
