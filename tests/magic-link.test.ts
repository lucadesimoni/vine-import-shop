import { beforeAll, describe, expect, it, vi } from "vitest";

// in-memory database, brand-neutral seed, mails captured instead of written to data/mail.log
process.env.DATABASE_URL = "pglite:memory";
process.env.DEMO_DATA = "false";
const sent: { to: string; html: string }[] = [];
vi.mock("~/.server/mail", async (orig) => ({ ...(await orig<typeof import("~/.server/mail")>()), sendMail: async (to: string, _s: string, html: string) => { sent.push({ to, html }); return true; } }));

const tokenOf = (html: string) => html.match(/\/login\/link\/([\w-]+)/)?.[1] ?? "";

describe("sign-in link (magic link)", () => {
  let customer: { id: number }, admin: { id: number };
  beforeAll(async () => {
    const { getDb, schema } = await import("~/.server/db");
    const db = await getDb();
    [customer] = await db.insert(schema.users).values({ email: "kundin@example.ch", passwordHash: "x", name: "Kundin", role: "customer" }).returning();
    admin = (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.role, "admin") }))!;
  }, 60_000);

  it("sends a link to customers, keeps the next path, and the link signs in exactly once", async () => {
    const { getDb, schema } = await import("~/.server/db");
    const { sendLoginLink, peekLoginToken, consumeLoginToken } = await import("~/.server/magic-link");
    const db = await getDb();
    const user = (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, customer.id) }))!;
    expect(await sendLoginLink(user, "https://shop.example.ch/", "/account/quick-order")).toBe(true);
    const mail = sent.at(-1)!;
    expect(mail.to).toBe("kundin@example.ch");
    expect(mail.html).toContain("https://shop.example.ch/login/link/");
    expect(mail.html).toContain("next=%2Faccount%2Fquick-order");
    const token = tokenOf(mail.html);
    // only a hash is stored
    const stored = (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, customer.id) }))!;
    expect(stored.loginToken).not.toContain(token);
    expect(stored.loginToken).toMatch(/^[0-9a-f]{64}$/);
    // opening (peek) does not use it up — mail scanners prefetch links
    expect((await peekLoginToken(token))?.id).toBe(customer.id);
    expect((await peekLoginToken(token))?.id).toBe(customer.id);
    expect((await consumeLoginToken(token))?.id).toBe(customer.id);
    expect(await consumeLoginToken(token)).toBeNull();
    void schema;
  });

  it("never sends links to staff or admins, rejects foreign next paths, expired and malformed tokens", async () => {
    const { getDb, schema } = await import("~/.server/db");
    const { sendLoginLink, consumeLoginToken } = await import("~/.server/magic-link");
    const db = await getDb();
    const a = (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, admin.id) }))!;
    const before = sent.length;
    expect(await sendLoginLink(a, "https://shop.example.ch")).toBe(false);
    expect(sent.length).toBe(before);

    const user = (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, customer.id) }))!;
    await sendLoginLink(user, "https://shop.example.ch", "//evil.example.com");
    const html = sent.at(-1)!.html;
    expect(html).not.toContain("evil");
    const token = tokenOf(html);
    await db.update(schema.users).set({ loginExpires: new Date(Date.now() - 1000) }).where((await import("drizzle-orm")).eq(schema.users.id, customer.id));
    expect(await consumeLoginToken(token)).toBeNull(); // expired
    expect(await consumeLoginToken("short")).toBeNull();
    expect(await consumeLoginToken("x".repeat(43))).toBeNull(); // well-formed but unknown
  });
});
