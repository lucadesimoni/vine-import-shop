import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hostMatches, parseLicence } from "~/.server/licence";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const pub = publicKey.export({ type: "spki", format: "pem" }).toString();
const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const issue = (payload: object) => { const p = b64u(JSON.stringify(payload)); return `${p}.${b64u(sign(null, Buffer.from(p), privateKey))}`; };
const lic = { id: "x", licensee: "Weinhandel Muster AG", domains: ["shop.muster.ch", "*.muster-b2b.ch"], plan: "business", expires: "2099-12-31", issued: "2026-11-13" };

describe("licence keys", () => {
  it("accepts a key signed with the owner's private key", () => {
    expect(parseLicence(issue(lic), pub)).toEqual(lic);
  });
  it("rejects tampered payloads and foreign keys", () => {
    const [p, s] = issue(lic).split(".");
    const forged = b64u(JSON.stringify({ ...lic, expires: null }));
    expect(parseLicence(`${forged}.${s}`, pub)).toEqual({ error: "Signatur ungültig" });
    const other = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(parseLicence(`${p}.${s}`, other)).toEqual({ error: "Signatur ungültig" });
    expect(parseLicence("nonsense", pub)).toEqual({ error: "Format ungültig" });
    expect(parseLicence(issue(lic), "")).toHaveProperty("error");
  });
  it("matches licensed host names", () => {
    expect(hostMatches("shop.muster.ch", lic.domains)).toBe(true);
    expect(hostMatches("www.shop.muster.ch", lic.domains)).toBe(true);
    expect(hostMatches("portal.muster-b2b.ch:443", lic.domains)).toBe(true);
    expect(hostMatches("other.ch", lic.domains)).toBe(false);
    expect(hostMatches("localhost:3000", lic.domains)).toBe(true);
    expect(hostMatches("anything.ch", [])).toBe(true);
  });
});
