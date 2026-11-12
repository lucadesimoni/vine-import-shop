#!/usr/bin/env node
// CI guard: the package version must have a CHANGELOG section; tags must match the package version.
import { readFileSync } from "node:fs";
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const log = readFileSync("CHANGELOG.md", "utf8");
const errors = [];
if (!log.includes("## [Unreleased]")) errors.push("CHANGELOG.md needs an '## [Unreleased]' section");
if (!new RegExp(`## \\[${version.replace(/\./g, "\\.")}\\] - \\d{4}-\\d{2}-\\d{2}`).test(log)) errors.push(`CHANGELOG.md has no dated section for v${version}`);
const tag = process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : null;
if (tag && tag !== `v${version}`) errors.push(`tag ${tag} does not match package.json version v${version}`);
if (errors.length) { console.error(errors.map((e) => `✗ ${e}`).join("\n")); process.exit(1); }
console.log(`✓ CHANGELOG ok for v${version}`);
