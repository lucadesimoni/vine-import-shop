#!/usr/bin/env node
// New customer shop in one command, from the owner's machine (the licence private key never leaves it):
//
//   npm run customer:new -- --host root@shops.example.ch --name muster --domains shop.muster.ch,b2b.muster.ch \
//        --admin info@muster.ch --licensee "Weinhandel Muster AG" [--plan business] [--expires 2027-12-31] [--version v1.10.0]
//
// 1. issues a licence key for the domains (scripts/licence.mjs, ./licence-private.pem or LICENCE_PRIVATE_KEY_FILE)
// 2. runs `shopctl new` on the shop host over SSH: database, container, HTTPS, admin login
// Without a private key: --no-licence (the shop runs; Admin › System shows "Keine Lizenz").
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
const need = (k) => arg(k) ?? fail(`--${k} is required`);
function fail(msg) { console.error(`✗ ${msg}\n\nusage: npm run customer:new -- --host root@server --name muster --domains shop.muster.ch --admin info@muster.ch --licensee "Muster AG" [--plan business] [--expires YYYY-MM-DD] [--version vX.Y.Z] [--no-licence]`); process.exit(1); }

const host = need("host"), name = need("name"), domains = need("domains"), admin = need("admin");
if (!/^[a-z][a-z0-9-]{1,30}$/.test(name)) fail("--name: lowercase letters, digits, dashes");
if (!/^[a-z0-9.-]+(,[a-z0-9.-]+)*$/.test(domains)) fail("--domains: a.ch,b.ch");

let key = "";
if (!argv.includes("--no-licence")) {
  const licensee = need("licensee");
  const r = spawnSync(process.execPath, ["scripts/licence.mjs", "issue", "--licensee", licensee, "--domains", domains,
    "--plan", arg("plan") ?? "standard", ...(arg("expires") ? ["--expires", arg("expires")] : [])], { encoding: "utf8" });
  if (r.status !== 0) fail(`licence: ${r.stderr.trim()}`);
  key = r.stdout.match(/^LICENSE_KEY=(\S+)$/m)?.[1] ?? fail("licence: no key in output");
  console.log(`✓ licence issued for ${licensee} (${domains})`);
}

const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const remote = ["shopctl", "new", name, "--domains", domains, "--admin", admin, ...(key ? ["--licence", key] : []), ...(arg("version") ? ["--version", arg("version")] : [])].map(q).join(" ");
const r = spawnSync("ssh", [host, remote], { stdio: "inherit" });
process.exit(r.status ?? 1);
