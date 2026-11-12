import { defineExtension } from "./index";
import { CsvClient } from "../vinx/csv";
import { MockClient } from "../vinx/mock";
import { Rest3Client } from "../vinx/rest";
import { erpClient, processOutbox, syncArticles, syncPrices, syncSpecialPrices, syncStock } from "../vinx/sync";

/** Built-in capabilities, registered through the same API extensions use. */
const vinx = defineExtension({
  id: "core:vinx",
  name: "vinX ERP (REST3 · CSV · Demo)",
  setup(api) {
    api.registerErpDriver({ id: "mock", label: "Demo (Mock)", create: () => new MockClient() });
    api.registerErpDriver({ id: "rest3", label: "vinX REST3 (Shop API v2.0)", create: (cfg) => new Rest3Client(cfg) });
    api.registerErpDriver({ id: "csv", label: "CSV-Dateiaustausch", create: (_cfg, files) => new CsvClient(files) });
    const withClient = <T>(fn: (c: Awaited<ReturnType<typeof erpClient>>) => Promise<T>) => async () => fn(await erpClient()) as Promise<{ ok: boolean; message: string }>;
    api.registerJob({ id: "outbox", label: "Bestellungen senden", scheduled: true, run: withClient((c) => processOutbox(c)) });
    api.registerJob({ id: "stock", label: "Lagerbestand", scheduled: true, run: withClient(syncStock) });
    api.registerJob({ id: "prices", label: "Preislisten & Aktionen", scheduled: true, run: withClient(syncPrices) });
    api.registerJob({ id: "conditions", label: "Spezialpreise", scheduled: true, run: withClient(syncSpecialPrices) });
    api.registerJob({ id: "articles", label: "Artikel (Delta)", scheduled: true, run: withClient((c) => syncArticles(c)) });
    api.registerJob({ id: "articles:full", label: "Artikel (Vollabgleich)", run: withClient((c) => syncArticles(c, true)) });
  },
});

const maintenance = defineExtension({
  id: "core:maintenance",
  name: "Backups & Wartung",
  setup(api) {
    api.registerJob({ id: "backup", label: "Backup (täglich)", scheduled: true, run: async () => (await import("../maintenance")).backupIfDue() });
  },
});

export const coreExtensions = [vinx, maintenance];
