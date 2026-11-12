import type { Settings } from "~/lib/settings";
import { on, type EventMap } from "../events";
import { registerProvider, type PaymentProvider } from "../payments";
import { registerPriceSource, type PriceSource } from "../price-sources";
import type { ErpClient } from "../vinx/client";

/**
 * Extension system — the single way to add capabilities without touching the core.
 *
 *   export default defineExtension({
 *     id: "acme-erp", name: "ACME ERP",
 *     setup(api) {
 *       api.registerErpDriver({ id: "acme", label: "ACME", create: (cfg) => new AcmeClient(cfg) });
 *       api.on("order.paid", async ({ orderId }) => { … });
 *       api.registerJob({ id: "acme:invoices", label: "Rechnungen abgleichen", run: async () => ({ ok: true, message: "…" }) });
 *     },
 *   });
 *
 * Enable it in app/extensions.config.ts. Server-only; UI routes can be added in app/routes.ts (see docs/EXTENDING.md).
 */
export type JobResult = { ok: boolean; message: string; items?: number };
export type ErpDriver = { id: string; label: string; create(cfg: Settings["vinx"], files?: { articles?: string; stock?: string; prices?: string }): ErpClient };
export type Job = { id: string; label: string; run(): Promise<JobResult>; /** part of the default cron run */ scheduled?: boolean };
export type AdminLink = { to: string; label: string; section?: "Shop" | "Integrationen" };

export type ExtensionApi = {
  on: <K extends keyof EventMap>(event: K, fn: (payload: EventMap[K]) => Promise<void> | void) => void;
  registerPaymentProvider(p: PaymentProvider): void;
  registerPriceSource(s: PriceSource): void;
  registerErpDriver(d: ErpDriver): void;
  registerJob(j: Job): void;
  registerAdminLink(l: AdminLink): void;
};
export type Extension = { id: string; name: string; version?: string; setup(api: ExtensionApi): void | Promise<void> };
export const defineExtension = (e: Extension) => e;

/* ── registries ─────────────────────────────────────────────────────── */
export const erpDrivers = new Map<string, ErpDriver>();
export const jobs = new Map<string, Job>();
export const adminLinks: AdminLink[] = [];
export const loaded: { id: string; name: string; version?: string }[] = [];

const api: ExtensionApi = {
  on,
  registerPaymentProvider: registerProvider,
  registerPriceSource,
  registerErpDriver: (d) => void erpDrivers.set(d.id, d),
  registerJob: (j) => void jobs.set(j.id, j),
  registerAdminLink: (l) => void adminLinks.push(l),
};

let booted: Promise<void> | null = null;
/** Idempotent; called by the root middleware and by CLI scripts (jobs). */
export function bootExtensions() {
  booted ??= (async () => {
    const [{ coreExtensions }, { default: enabled }] = await Promise.all([import("./core"), import("~/extensions.config")]);
    // Customer extensions: custom/extensions/<name>/index.ts — auto-discovered, never touched by core updates
    // lazy glob: loaded after this module is initialised, so extensions may import defineExtension from here
    const custom: Extension[] = import.meta.env
      ? await Promise.all(Object.values(import.meta.glob<Extension>("../../../custom/extensions/*/index.ts", { import: "default" })).map((load) => load()))
      : [];
    const disabled = new Set((process.env.EXTENSIONS_DISABLED ?? "").split(",").map((x) => x.trim()).filter(Boolean));
    for (const ext of [...coreExtensions, ...enabled, ...custom].filter((e) => e && !disabled.has(e.id))) {
      try {
        await ext.setup(api);
        loaded.push({ id: ext.id, name: ext.name, version: ext.version });
      } catch (e) {
        console.error(`[extensions] ${ext.id} failed to load`, e);
      }
    }
  })();
  return booted;
}
