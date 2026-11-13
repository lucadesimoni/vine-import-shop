#!/usr/bin/env node
// Builds an upload-ready archive for hosts without a build step (Hostpoint, Passenger hosts, plain VPS):
//   npm run release  →  release/shop-<version>.tar.gz
// On the server:  tar xzf shop-*.tar.gz && cd shop && npm ci --omit=dev && npm run setup && npm start
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const run = (c) => execSync(c, { stdio: "inherit" });
// the archive is the licensed customer distribution: no demo content (SHOP_DIST=customer, see docs/LICENSING.md)
execSync("npm run build", { stdio: "inherit", env: { ...process.env, SHOP_DIST: process.env.SHOP_DIST ?? "customer" } });
rmSync("release", { recursive: true, force: true });
const dir = "release/shop";
mkdirSync(dir, { recursive: true });
for (const f of ["build", "drizzle", "deploy", "scripts/setup.mjs", "server.js", "passenger.cjs", "package.json", "package-lock.json", ".env.example", "README.md", "CHANGELOG.md", "LICENSE", "NOTICE.md", "THIRD_PARTY_LICENSES.md", "docs"]) {
  cpSync(f, `${dir}/${f}`, { recursive: true });
}
run(`tar -czf release/shop-${pkg.version ?? "0.0.0"}.tar.gz -C release shop`);
console.log(`✓ release/shop-${pkg.version ?? "0.0.0"}.tar.gz`);
