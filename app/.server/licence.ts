import { createPublicKey, verify } from "node:crypto";
import { LICENCE_PUBLIC_KEY } from "./licence-key";

/**
 * Licence keys for the commercial distribution (see docs/LICENSING.md).
 *
 * A key is `<payload>.<signature>` (both base64url): the payload is JSON signed with the owner's Ed25519 private key,
 * issued with `npm run licence -- issue …`. The installation verifies it offline against the public key in licence-key.ts —
 * no phone-home, no external service. The check is informative (admin banner + System page); it never stops a shop.
 *
 *   LICENSE_KEY=eyJ…  (environment variable of the installation)
 */
export type LicencePayload = {
  id: string;
  licensee: string;
  /** host names the licence covers; "*.example.ch" matches sub-domains; empty = any */
  domains: string[];
  plan: string;
  /** ISO date (inclusive) or null for perpetual */
  expires: string | null;
  issued: string;
};
export type LicenceStatus =
  | { state: "valid"; licence: LicencePayload; domainOk: boolean }
  | { state: "expired"; licence: LicencePayload; domainOk: boolean }
  | { state: "invalid"; reason: string }
  | { state: "missing" }
  | { state: "development" };

const b64 = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export function parseLicence(key: string, publicKey = LICENCE_PUBLIC_KEY): LicencePayload | { error: string } {
  const [p, sig, extra] = key.trim().split(".");
  if (!p || !sig || extra !== undefined) return { error: "Format ungültig" };
  if (!publicKey) return { error: "Kein öffentlicher Schlüssel in app/.server/licence-key.ts" };
  let ok = false;
  try {
    ok = verify(null, Buffer.from(p), createPublicKey(publicKey), b64(sig));
  } catch {
    return { error: "Signatur nicht lesbar" };
  }
  if (!ok) return { error: "Signatur ungültig" };
  try {
    return JSON.parse(b64(p).toString("utf8")) as LicencePayload;
  } catch {
    return { error: "Inhalt nicht lesbar" };
  }
}

export const hostMatches = (host: string, domains: string[]) => {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  if (!domains.length || h === "localhost" || h === "127.0.0.1") return true;
  return domains.some((d) => {
    const x = d.toLowerCase().trim();
    return x.startsWith("*.") ? h === x.slice(2) || h.endsWith(x.slice(1)) : h === x || h === `www.${x}`;
  });
};

export function licenceStatus(host: string, key = process.env.LICENSE_KEY, now = new Date()): LicenceStatus {
  // the demo / development build needs no key; the customer distribution (SHOP_DIST=customer) reports a missing one
  if (!key) return typeof __DEMO__ === "undefined" || __DEMO__ ? { state: "development" } : { state: "missing" };
  const l = parseLicence(key);
  if ("error" in l) return { state: "invalid", reason: l.error };
  const domainOk = hostMatches(host, l.domains);
  const expired = !!l.expires && now > new Date(`${l.expires}T23:59:59Z`);
  return { state: expired ? "expired" : "valid", licence: l, domainOk };
}
