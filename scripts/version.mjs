#!/usr/bin/env node
// Cut a release: npm run version:bump -- patch | minor | major
//  1. moves CHANGELOG "## [Unreleased]" entries into "## [x.y.z] - YYYY-MM-DD" (+ compare links)
//  2. bumps package.json / package-lock.json
//  3. commits "Release vX.Y.Z" and creates the tag vX.Y.Z  →  git push && git push --tags  (CI publishes the release)
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const kind = process.argv[2];
if (!["patch", "minor", "major"].includes(kind)) { console.error("usage: npm run version:bump -- patch|minor|major"); process.exit(1); }
const sh = (c) => execSync(c, { encoding: "utf8" }).trim();
if (sh("git status --porcelain")) { console.error("✗ working tree not clean — commit first"); process.exit(1); }

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const [ma, mi, pa] = pkg.version.split(".").map(Number);
const next = kind === "major" ? `${ma + 1}.0.0` : kind === "minor" ? `${ma}.${mi + 1}.0` : `${ma}.${mi}.${pa + 1}`;

let log = readFileSync("CHANGELOG.md", "utf8");
const m = log.match(/## \[Unreleased\]\n([\s\S]*?)(?=\n## \[)/);
if (!m || !m[1].trim()) { console.error("✗ CHANGELOG has no entries under [Unreleased]"); process.exit(1); }
const today = new Date().toISOString().slice(0, 10);
log = log.replace("## [Unreleased]\n", `## [Unreleased]\n\n## [${next}] - ${today}\n`);
const repo = (log.match(/\[Unreleased\]: (https:\/\/github\.com\/[^/]+\/[^/]+)\/compare/) ?? [])[1];
if (repo) {
  log = log.replace(/\[Unreleased\]: .*\n/, `[Unreleased]: ${repo}/compare/v${next}...HEAD\n[${next}]: ${repo}/compare/v${pkg.version}...v${next}\n`);
}
writeFileSync("CHANGELOG.md", log);
pkg.version = next;
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
lock.version = next;
if (lock.packages?.[""]) lock.packages[""].version = next;
writeFileSync("package-lock.json", JSON.stringify(lock, null, 2) + "\n");
sh(`git add CHANGELOG.md package.json package-lock.json && git commit -m "Release v${next}" && git tag -a v${next} -m "v${next}"`);
console.log(`✓ v${next} — now: git push && git push origin v${next}`);
