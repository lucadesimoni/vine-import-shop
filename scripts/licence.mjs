#!/usr/bin/env node
// Licence keys for the commercial distribution (owner only — see docs/LICENSING.md).
//
//   npm run licence -- keygen
//       → licence-private.pem (keep it safe, never commit) + prints the public key for app/.server/licence-key.ts
//   npm run licence -- issue --licensee "Weinhandel Muster AG" --domains shop.muster.ch,b2b.muster.ch --plan business --expires 2027-12-31
//       → prints LICENSE_KEY=… for the customer's environment (private key from LICENCE_PRIVATE_KEY_FILE or ./licence-private.pem)
//   npm run licence -- verify <key>
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [cmd, ...rest] = process.argv.slice(2);
const arg = (name, def) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : def; };
const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const keyFile = process.env.LICENCE_PRIVATE_KEY_FILE ?? "licence-private.pem";

if (cmd === "keygen") {
  if (existsSync(keyFile)) { console.error(`✗ ${keyFile} exists — refusing to overwrite (keys already issued would stop verifying)`); process.exit(1); }
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  writeFileSync(keyFile, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  console.log(`✓ private key → ${keyFile} (store it in your password manager; never commit it)\n`);
  console.log("Paste into app/.server/licence-key.ts:\n");
  console.log(`export const LICENCE_PUBLIC_KEY = \`${publicKey.export({ type: "spki", format: "pem" }).trim()}\`;`);
} else if (cmd === "issue") {
  const licensee = arg("licensee");
  if (!licensee) { console.error('usage: npm run licence -- issue --licensee "Name AG" [--domains a.ch,b.ch] [--plan business] [--expires 2027-12-31]'); process.exit(1); }
  if (!existsSync(keyFile)) { console.error(`✗ ${keyFile} not found — run keygen first or set LICENCE_PRIVATE_KEY_FILE`); process.exit(1); }
  const expires = arg("expires", null);
  if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) { console.error("✗ --expires must be YYYY-MM-DD"); process.exit(1); }
  const payload = {
    id: randomUUID(), licensee, domains: (arg("domains", "") || "").split(",").map((d) => d.trim()).filter(Boolean),
    plan: arg("plan", "standard"), expires, issued: new Date().toISOString().slice(0, 10),
  };
  const p = b64u(JSON.stringify(payload));
  const sig = b64u(sign(null, Buffer.from(p), createPrivateKey(readFileSync(keyFile))));
  console.log(JSON.stringify(payload, null, 2));
  console.log(`\nLICENSE_KEY=${p}.${sig}`);
} else if (cmd === "verify") {
  const [p, sig] = (rest[0] ?? "").split(".");
  const pub = readFileSync("app/.server/licence-key.ts", "utf8").match(/`(-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----)`/)?.[1];
  if (!pub) { console.error("✗ no public key in app/.server/licence-key.ts"); process.exit(1); }
  const { verify } = await import("node:crypto");
  const ok = verify(null, Buffer.from(p ?? ""), createPublicKey(pub), Buffer.from((sig ?? "").replace(/-/g, "+").replace(/_/g, "/"), "base64"));
  console.log(ok ? `✓ valid\n${Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()}` : "✗ invalid signature");
  process.exit(ok ? 0 : 1);
} else {
  console.error("usage: npm run licence -- keygen | issue … | verify <key>");
  process.exit(1);
}
