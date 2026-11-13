import { timingSafeEqual } from "node:crypto";
import type { Route } from "./+types/cron";
import { runScheduled } from "~/.server/vinx/sync";
import { defaultBudgetMs } from "~/.server/job-runtime";

/**
 * Scheduled jobs (vinX sync + outbox). Call every 5–15 min from any scheduler:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://shop.example.ch/api/cron[?jobs=outbox,stock]
 * (Platform crons: Vercel Cron, Cloudflare Cron Triggers, Render, Railway, systemd timer, cron-job.org …)
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (request.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const jobs = url.searchParams.get("jobs")?.split(",");
  // ?budget=<seconds>: shorter time budget (tests, or schedulers with a lower timeout); never above the default
  const budget = Number(url.searchParams.get("budget"));
  return Response.json(await runScheduled(jobs, budget > 0 ? Math.min(budget * 1000, defaultBudgetMs()) : undefined));
}
/** POST from any scheduler · GET from Vercel Cron (sends Authorization: Bearer $CRON_SECRET) */
export const action = ({ request }: Route.ActionArgs) => run(request);
export const loader = ({ request }: Route.LoaderArgs) => run(request);
