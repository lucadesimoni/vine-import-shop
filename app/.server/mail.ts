import { mkdir, appendFile } from "node:fs/promises";
import type { Brand } from "~/lib/settings";

/**
 * Mail drivers: `log` (dev — writes ./data/mail.log) or `smtp` (SMTP_URL, any provider/hoster).
 * Templates are plain branded HTML so they render in every client.
 */
export async function sendMail(to: string, subject: string, html: string, replyTo?: string) {
  const driver = process.env.MAIL_DRIVER ?? "log";
  try {
    if (driver === "smtp" && process.env.SMTP_URL) {
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport(process.env.SMTP_URL);
      // plain-text part next to the HTML: better delivery (spam filters) and readable in text-only clients
      await transport.sendMail({ from: process.env.MAIL_FROM, to, subject, html, text: htmlToText(html), replyTo });
      return true;
    }
    await mkdir("data", { recursive: true });
    await appendFile("data/mail.log", `[${new Date().toISOString()}] To: ${to} | ${subject}\n${html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}\n\n`);
    return true;
  } catch (e) {
    console.error("[mail]", e);
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function layout(brand: Brand, title: string, body: string) {
  const c = brand.colors;
  return `<!doctype html><html><body style="margin:0;background:${c.background};font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${c.foreground}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${c.card};border:1px solid ${c.border};border-radius:${brand.radius}px">
<tr><td style="padding:28px 32px;border-bottom:1px solid ${c.border};font-family:Georgia,serif;font-size:22px">${esc(brand.name)}</td></tr>
<tr><td style="padding:32px;font-size:15px;line-height:1.6"><h1 style="font-family:Georgia,serif;font-weight:400;font-size:24px;margin:0 0 16px">${esc(title)}</h1>${body}</td></tr>
<tr><td style="padding:20px 32px;background:${c.muted};color:${c.mutedForeground};font-size:12px">${esc([brand.legalName || brand.name, brand.contact.street, `${brand.contact.zip} ${brand.contact.city}`, brand.contact.email].filter((x) => x.trim()).join(" · "))}</td></tr>
</table></td></tr></table></body></html>`;
}

export { esc };

/** readable plain text from a mail template: paragraphs and rows on their own lines, links as "text (url)" */
export function htmlToText(html: string) {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, text: string) => {
      const t = text.replace(/<[^>]+>/g, "").trim();
      return !t || t === href ? href : `${t} (${href})`;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "  ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
