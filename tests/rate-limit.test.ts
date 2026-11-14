import { describe, expect, it } from "vitest";

process.env.DATABASE_URL = "pglite:memory";
process.env.DEMO_DATA = "false";

const req = (h: Record<string, string>) => new Request("https://shop.ch/login", { headers: h });

describe("client IP", () => {
  it("cannot be forged through X-Forwarded-For behind a proxy", async () => {
    const { clientIp } = await import("~/.server/rate-limit");
    // the client sends a fake first entry, the proxy (Caddy/nginx) appends the real address
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(req({ "x-vercel-forwarded-for": "198.51.100.7", "x-forwarded-for": "1.2.3.4" }))).toBe("198.51.100.7");
    expect(clientIp(req({}))).toBe("local");
  });
});

describe("rate limits in the database (shared by all instances)", () => {
  it("counts within a window, limits, resets after the window and on clear", async () => {
    const { hit, limited, clear, attempts } = await import("~/.server/rate-limit");
    const k = "login|203.0.113.9|a@b.ch";
    for (let i = 0; i < 3; i++) await hit(k);
    expect(await attempts(k)).toBe(3);
    expect(await limited(k, 3)).toBe(true);
    expect(await limited(k, 4)).toBe(false);
    await clear(k);
    expect(await attempts(k)).toBe(0);
    await hit("short", 1); // 1 ms window
    await new Promise((r) => setTimeout(r, 15));
    expect(await attempts("short")).toBe(0); // expired
    expect(await hit("short")).toBe(1); // a new window starts at 1
  }, 60_000);
  it("stores only hashes of keys", async () => {
    const { hit } = await import("~/.server/rate-limit");
    const { getDb, schema } = await import("~/.server/db");
    await hit("contact|198.51.100.7");
    const rows = await (await getDb()).select().from(schema.rateLimits);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.key))).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("198.51.100.7");
  });
});
