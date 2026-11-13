import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getT } from "~/lib/i18n";
import { isLocale } from "~/lib/localized";
import { getDb, schema } from "./db";
import { esc, layout, sendMail } from "./mail";
import { getScopedSettings } from "./settings";
import { storefrontById } from "./storefronts";

/**
 * Sign-in by e-mail link ("magic link") for registered customers (B2C and B2B), no password needed.
 *
 * - Only customers: staff and admins always sign in with their password.
 * - Only a SHA-256 hash of the token is stored, in its own columns (a pending password-reset link stays valid).
 * - Valid 15 minutes, single use; a new link replaces the previous one.
 * - Opening the link shows a confirm button; the token is used on POST only, so mail scanners that prefetch
 *   links cannot spend it.
 */
export const MAGIC_LINK_MINUTES = 15;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const valid = (t: string) => /^[\w-]{20,100}$/.test(t);

type Customer = typeof schema.users.$inferSelect;

export async function sendLoginLink(user: Customer, origin: string, next?: string | null) {
  if (user.role !== "customer") return false;
  const token = randomBytes(32).toString("base64url");
  const db = await getDb();
  await db.update(schema.users).set({ loginToken: sha(token), loginExpires: new Date(Date.now() + MAGIC_LINK_MINUTES * 60_000) }).where(eq(schema.users.id, user.id));
  const { brand } = await getScopedSettings((await storefrontById(user.storefrontId))?.slug, "brand");
  const t = getT(isLocale(user.locale) ? user.locale : "de");
  const q = next && next.startsWith("/") && !next.startsWith("//") ? `?next=${encodeURIComponent(next)}` : "";
  const url = `${origin.replace(/\/$/, "")}/login/link/${token}${q}`;
  const html = layout(brand, t("auth.magicTitle"), `<p>${esc(t("auth.magicMailText"))}</p><p style="margin:28px 0"><a href="${esc(url)}" style="background:${brand.colors.primary};color:${brand.colors.primaryForeground};padding:12px 22px;text-decoration:none;display:inline-block">${esc(t("auth.magicButton"))}</a></p><p style="color:#888;font-size:12px">${esc(url)}</p>`);
  return sendMail(user.email, `${brand.name} · ${t("auth.magicTitle")}`, html);
}

/** the customer a link belongs to, without using it (confirm page) */
export async function peekLoginToken(token: string) {
  if (!valid(token)) return null;
  const db = await getDb();
  const u = schema.users;
  return (await db.query.users.findFirst({ where: and(eq(u.loginToken, sha(token)), gt(u.loginExpires, new Date()), eq(u.role, "customer")) })) ?? null;
}

/** uses the link: atomically clears the token, so a link signs in exactly once */
export async function consumeLoginToken(token: string) {
  if (!valid(token)) return null;
  const db = await getDb();
  const u = schema.users;
  const [user] = await db.update(u).set({ loginToken: null, loginExpires: null })
    .where(and(eq(u.loginToken, sha(token)), gt(u.loginExpires, new Date()), eq(u.role, "customer")))
    .returning();
  return user ?? null;
}
