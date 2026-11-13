import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Time budget for jobs, so they fit serverless limits (Vercel: maxDuration of the cron / admin function).
 *
 * Long jobs (article delta/full sync, stock, customer pull, receipts, images) check `outOfTime()` in their loop, stop
 * cleanly and report `partial`; the next run continues where they stopped (offset, see vinx/sync.ts job()).
 * Jobs that replace data as a whole (price lists, special prices) never write half: they abort before writing.
 *
 *   JOB_BUDGET_SECONDS   default: 50 on Vercel (fits every plan's function limit; with Fluid Compute up to ~270),
 *                        900 elsewhere (VPS / Docker cron)
 */
const als = new AsyncLocalStorage<{ deadline: number }>();

export const defaultBudgetMs = () => (Number(process.env.JOB_BUDGET_SECONDS) || (process.env.VERCEL ? 50 : 900)) * 1000;

export function withBudget<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  const outer = als.getStore()?.deadline ?? Infinity;
  return als.run({ deadline: Math.min(outer, Date.now() + ms) }, fn);
}

/** milliseconds left in the current budget (Infinity without one) */
export const timeLeft = () => (als.getStore()?.deadline ?? Infinity) - Date.now();

/** true when less than `reserveMs` is left — stop the loop and report a partial run */
export const outOfTime = (reserveMs = 8000) => timeLeft() < reserveMs;

/** per-request timeout that never runs past the budget (min 3 s) */
export const requestTimeout = (maxMs: number) => Math.max(3000, Math.min(maxMs, timeLeft() - 2000));

export class BudgetExhausted extends Error {
  constructor(job: string) {
    super(`${job}: Zeitbudget erschöpft — nichts geschrieben; Job auf einem Server ohne Zeitlimit ausführen oder JOB_BUDGET_SECONDS erhöhen`);
  }
}
