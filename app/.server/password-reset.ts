import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getT } from "~/lib/i18n";
import { isLocale } from "~/lib/localized";
import { getDb, schema } from "./db";
import { esc, layout, sendMail } from "./mail";
import { getScopedSettings } from "./settings";
import { storefrontById } from "./storefronts";

/**
 * Password reset & invitations. Only a SHA-256 hash of the token is stored; links expire
 * (reset: 2 hours, invitation: 14 days) and are single-use.
 */
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

export async function issueToken(userId: number, kind: "reset" | "invite") {
  const token = randomBytes(32).toString("base64url");
  const db = await getDb();
  await db.update(schema.users).set({ resetToken: sha(token), resetExpires: new Date(Date.now() + (kind === "invite" ? 14 * 864e5 : 2 * 3600e3)) }).where(eq(schema.users.id, userId));
  return token;
}

export async function userForToken(token: string) {
  if (!/^[\w-]{20,100}$/.test(token)) return null;
  const db = await getDb();
  return (await db.query.users.findFirst({ where: and(eq(schema.users.resetToken, sha(token)), gt(schema.users.resetExpires, new Date())) })) ?? null;
}

export async function consumeToken(userId: number, passwordHash: string) {
  const db = await getDb();
  await db.update(schema.users).set({ passwordHash, resetToken: null, resetExpires: null, updatedAt: new Date() }).where(eq(schema.users.id, userId));
}

/** Send a reset link or an invitation ("set your password") to a user. `origin` = https://shop.example.ch */
export async function sendTokenMail(userId: number, kind: "reset" | "invite", origin: string) {
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) return false;
  const token = await issueToken(user.id, kind);
  const { brand } = await getScopedSettings((await storefrontById(user.storefrontId))?.slug, "brand");
  const t = getT(isLocale(user.locale) ? user.locale : "de");
  const url = `${origin.replace(/\/$/, "")}/login/reset/${token}`;
  const staff = user.role !== "customer";
  const title = kind === "invite" ? t(staff ? "auth.staffInviteTitle" : "auth.inviteTitle", { brand: brand.name }) : t("auth.resetTitle");
  const text = kind === "invite" ? t(staff ? "auth.staffInviteText" : "auth.inviteMailText", { brand: brand.name }) : t("auth.resetMailText");
  const html = layout(brand, title, `<p>${esc(text)}</p><p style="margin:28px 0"><a href="${esc(url)}" style="background:${brand.colors.primary};color:${brand.colors.primaryForeground};padding:12px 22px;text-decoration:none;display:inline-block">${esc(t("auth.setPassword"))}</a></p><p style="color:#888;font-size:12px">${esc(url)}</p>`);
  await sendMail(user.email, `${brand.name} · ${title}`, html);
  return true;
}
