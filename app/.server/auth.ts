import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { createCookieSessionStorage, redirect } from "react-router";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { resolveStorefront } from "./storefronts";
import { channelPath } from "~/lib/channel";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** scrypt (memory-hard, built into Node — no native deps). Format: scrypt$N$salt$hash */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, 32, PARAMS);
  return `scrypt$${PARAMS.N}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, { ...PARAMS, N: Number(n) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

type SessionData = { userId: number; cartId: string; locale: string };
type FlashData = { toast: { kind: "success" | "error"; text: string } };

const secret = process.env.SESSION_SECRET;
if (!secret && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production");

export const sessionStorage = createCookieSessionStorage<SessionData, FlashData>({
  cookie: {
    name: "__shop",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // Optional: share the login across shop + portal subdomains, e.g. ".example.ch"
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
    secure: process.env.NODE_ENV === "production",
    secrets: [secret ?? "dev-insecure-secret"],
    maxAge: 60 * 60 * 24 * 30,
  },
});

export const getSession = (request: Request) => sessionStorage.getSession(request.headers.get("Cookie"));
export const commit = sessionStorage.commitSession;

export type SessionUser = Awaited<ReturnType<typeof loadUser>>;

async function loadUser(id: number) {
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, id) });
  if (!user) return null;
  const group = user.groupId ? await db.query.customerGroups.findFirst({ where: eq(schema.customerGroups.id, user.groupId) }) : null;
  const { passwordHash: _p, resetToken: _r, loginToken: _l, ...safe } = user;
  return { ...safe, group: group ?? null };
}

export async function getUser(request: Request) {
  const session = await getSession(request);
  const id = session.get("userId");
  const user = id ? await loadUser(id) : null;
  // customers belong to one shop: a main-shop account is not signed in on a storefront and vice versa (staff: everywhere)
  if (user?.role === "customer") {
    const sf = await resolveStorefront(request);
    if ((user.storefrontId ?? null) !== (sf?.id ?? null)) return null;
  }
  return user;
}

export async function requireUser(request: Request) {
  const user = await getUser(request);
  if (!user) {
    const url = new URL(request.url);
    throw redirect(`${url.pathname.startsWith("/portal") ? "/portal/login" : "/login"}?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return user;
}

export async function requireStaff(request: Request) {
  const user = await requireUser(request);
  if (user.role !== "admin" && user.role !== "staff") throw new Response("Forbidden", { status: 403 });
  return user;
}

/** The account for this e-mail in this shop (storefrontId null = main shop); staff and admins sign in everywhere. */
export async function findUserByEmail(email: string, storefrontId: number | null = null) {
  const db = await getDb();
  const u = schema.users;
  const rows = await db.select().from(u).where(and(
    eq(sql`lower(${u.email})`, email.trim().toLowerCase()),
    or(storefrontId ? eq(u.storefrontId, storefrontId) : isNull(u.storefrontId), inArray(u.role, ["staff", "admin"])),
  ));
  return rows.find((r) => (r.storefrontId ?? null) === storefrontId) ?? rows[0];
}

/**
 * Rate limits for sign-in, links and forms (app/.server/rate-limit.ts — in the database, shared by all instances).
 * `requestLimited` checks a set of [key, max] pairs; `countAttempt` counts one attempt on all of them.
 */
export { clientIp } from "./rate-limit";
export async function requestLimited(limits: [key: string, max: number][]) {
  const { limited } = await import("./rate-limit");
  return (await Promise.all(limits.map(([k, max]) => limited(k, max)))).some(Boolean);
}
export async function countAttempt(limits: [key: string, max: number][], windowMs?: number) {
  const { hit } = await import("./rate-limit");
  await Promise.all(limits.map(([k]) => hit(k, windowMs)));
}
export async function clearAttempts(key: string) {
  const { clear } = await import("./rate-limit");
  await clear(key);
}

/** where a user lands after signing in: one login = one role (approved B2B customers go to the portal unless shop and portal are one channel) */
export function homeAfterLogin(user: { role: string; tradeStatus: string | null }, channel: { portal: boolean; portalEnabled: boolean; mode: string }) {
  if (user.role !== "customer") return "/admin";
  const b2b = user.tradeStatus === "approved" && channel.portalEnabled && channel.mode !== "combined";
  return channel.portal || b2b ? "/portal" : channelPath("/account", false);
}

export async function login(request: Request, userId: number, redirectTo: string) {
  const session = await getSession(request);
  session.set("userId", userId);
  // Keep the anonymous cart: it is merged in cart.ts on next access.
  return redirect(redirectTo, { headers: { "Set-Cookie": await commit(session) } });
}

export async function logout(request: Request) {
  const session = await getSession(request);
  session.unset("userId");
  session.unset("cartId");
  return redirect("/", { headers: { "Set-Cookie": await commit(session) } });
}

export function safeRedirect(to: FormDataEntryValue | string | null | undefined, fallback = "/") {
  if (typeof to !== "string" || !to.startsWith("/") || to.startsWith("//")) return fallback;
  return to;
}
