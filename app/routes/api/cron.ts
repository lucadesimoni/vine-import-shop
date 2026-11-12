import { timingSafeEqual } from "node:crypto";
import type { Route } from "./+types/cron";
import { runScheduled } from "~/.server/vinx/sync";

/**
 * Scheduled jobs (vinX sync + outbox). Call every 5–15 min from any scheduler:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://shop.example.ch/api/cron[?jobs=outbox,stock]
 * (Platform crons: Vercel Cron, Cloudflare Cron Triggers, Render, Railway, systemd timer, cron-job.org …)
 */
export async function action({ request }: Route.ActionArgs) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (request.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const jobs = new URL(request.url).searchParams.get("jobs")?.split(",");
  return Response.json(await runScheduled(jobs));
}
export const loader = () => Response.json({ error: "POST only" }, { status: 405 });
