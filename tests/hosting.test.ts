import { afterEach, describe, expect, it, vi } from "vitest";
import { pgOptions } from "~/.server/db";

describe("database URL (Vercel ↔ Supabase / Neon integrations)", () => {
  it("drops integration-only parameters and requires SSL for remote hosts", () => {
    const o = pgOptions("postgres://postgres.abc:pw@aws-0-eu-central-2.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x");
    expect(o.url).toBe("postgres://postgres.abc:pw@aws-0-eu-central-2.pooler.supabase.com:6543/postgres");
    expect(o.ssl).toBe("require");
    expect(pgOptions("postgres://u:p@db.example.ch/shop?pgbouncer=true").ssl).toBe("require"); // remote: SSL by default
  });
  it("keeps local and Docker databases without SSL unless asked", () => {
    expect(pgOptions("postgres://postgres:pw@127.0.0.1:5432/x").ssl).toBe(false);
    expect(pgOptions("postgres://shop:pw@postgres:5432/shop").ssl).toBe(false); // compose service name
    expect(pgOptions("postgres://a:b@db.example.ch/x?sslmode=disable").ssl).toBe(false);
    expect(pgOptions("postgres://a:b@localhost/x?sslmode=verify-full").ssl).toBe("verify-full");
  });
});

describe("storage drivers", () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); vi.resetModules(); });

  it("picks Supabase automatically when the integration's URL and service key are present", async () => {
    delete process.env.STORAGE_DRIVER;
    const { storageDriver, persistentStorage } = await import("~/.server/storage");
    delete process.env.SUPABASE_URL;
    expect(storageDriver()).toBe("local");
    process.env.SUPABASE_URL = "https://ref.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_x";
    expect(storageDriver()).toBe("supabase");
    process.env.STORAGE_DRIVER = "s3";
    expect(storageDriver()).toBe("s3"); // explicit choice wins
    process.env.VERCEL = "1"; process.env.STORAGE_DRIVER = "local";
    expect(persistentStorage()).toBe(false); // /tmp on serverless
  });

  it("uploads to Supabase Storage: creates the public bucket once, then upserts objects", async () => {
    process.env.SUPABASE_URL = "https://ref.supabase.co/";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiJ9.legacy";
    delete process.env.STORAGE_DRIVER;
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return url.endsWith("/bucket") && calls.length > 1 ? new Response('{"message":"already exists"}', { status: 400 }) : new Response("{}");
    }));
    const { saveBuffer } = await import("~/.server/storage");
    const a = await saveBuffer("img/a.webp", new Uint8Array([1]), "image/webp");
    await saveBuffer("img/b.webp", new Uint8Array([2]), "image/webp");
    expect(a).toBe("https://ref.supabase.co/storage/v1/object/public/media/img/a.webp");
    expect(calls.map((c) => c.url)).toEqual([
      "https://ref.supabase.co/storage/v1/bucket",
      "https://ref.supabase.co/storage/v1/object/media/img/a.webp",
      "https://ref.supabase.co/storage/v1/object/media/img/b.webp",
    ]);
    const h = calls[1].init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer eyJhbGciOiJIUzI1NiJ9.legacy"); // legacy JWT key: Bearer + apikey
    expect(h["x-upsert"]).toBe("true");
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ id: "media", public: true });
  });

  it("sends new secret keys only in the apikey header and reports upload errors", async () => {
    process.env.SUPABASE_URL = "https://ref.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_new";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.STORAGE_DRIVER;
    const seen: Record<string, string>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      seen.push(init.headers as Record<string, string>);
      return url.endsWith("/bucket") ? new Response("{}") : new Response("denied", { status: 403 });
    }));
    const { saveBuffer } = await import("~/.server/storage");
    await expect(saveBuffer("img/x.webp", new Uint8Array([1]), "image/webp")).rejects.toThrow(/403/);
    expect(seen[1].apikey).toBe("sb_secret_new");
    expect(seen[1].Authorization).toBeUndefined();
  });
});
