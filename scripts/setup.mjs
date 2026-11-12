#!/usr/bin/env node
// One-time setup: writes .env with strong secrets (never overwrites an existing .env).
//   npm run setup                      → embedded database (PGlite), demo data on
//   npm run setup -- --production      → DEMO_DATA=false, asks you to set ADMIN_EMAIL/PASSWORD and DATABASE_URL
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const prod = process.argv.includes("--production");
if (existsSync(".env")) {
  console.log("✓ .env exists — nothing changed. Delete it to regenerate.");
  process.exit(0);
}
const secret = (n = 32) => randomBytes(n).toString("base64url");
let env = existsSync(".env.example") ? readFileSync(".env.example", "utf8") : "";
const set = (k, v) => {
  const re = new RegExp(`^#?\\s*${k}=.*$`, "m");
  env = re.test(env) ? env.replace(re, `${k}=${v}`) : `${env}\n${k}=${v}`;
};
set("NODE_ENV", "production");
set("SESSION_SECRET", secret(48));
set("CRON_SECRET", secret());
set("VINX_WEBHOOK_SECRET", secret());
if (prod) {
  set("DEMO_DATA", "false");
  set("ADMIN_PASSWORD", secret(12));
}
writeFileSync(".env", env.trimStart(), { mode: 0o600 });
console.log(`✓ .env written (${prod ? "production" : "demo"} profile). Next: npm run build && npm start`);
if (prod) console.log("  Set ADMIN_EMAIL, DATABASE_URL (or keep the embedded DB on one server), MAIL_* and payment keys in .env.");
