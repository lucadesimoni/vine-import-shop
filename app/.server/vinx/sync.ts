import { and, desc, eq, inArray, lte, or, sql } from "drizzle-orm";
import type { Settings } from "~/lib/settings";
import { slugify } from "~/lib/slug";
import { getDb, schema } from "../db";
import { getSetting } from "../settings";
import type { CustomerPayload, ErpClient, OrderPayload } from "./client";
import { CsvClient } from "./csv";
import { mapArticle, mapPrice, mapStock } from "./mapper";
import { MockClient } from "./mock";
import { Rest3Client } from "./rest";

export async function erpClient(cfg?: Settings["vinx"], files?: ConstructorParameters<typeof CsvClient>[0]): Promise<ErpClient> {
  cfg ??= await getSetting("vinx");
  if (files || cfg.driver === "csv") return new CsvClient(files);
  if (cfg.driver === "rest3") return new Rest3Client(cfg);
  return new MockClient();
}

async function job<T extends { items: number; message: string }>(name: string, fn: () => Promise<T>) {
  const db = await getDb();
  const [log] = await db.insert(schema.syncLog).values({ job: name, status: "running" }).returning();
  try {
    const r = await fn();
    await db.update(schema.syncLog).set({ status: "ok", items: r.items, message: r.message, finishedAt: new Date() }).where(eq(schema.syncLog.id, log.id));
    return { ok: true, ...r };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.update(schema.syncLog).set({ status: "error", message: message.slice(0, 2000), finishedAt: new Date() }).where(eq(schema.syncLog.id, log.id));
    return { ok: false, items: 0, message };
  }
}

/** erpId (vinX articleId) and SKU (article number) → variant id */
async function variantRefs() {
  const db = await getDb();
  const map = new Map<string, number>();
  for (const v of await db.select({ id: schema.variants.id, sku: schema.variants.sku, erpId: schema.variants.erpId }).from(schema.variants)) {
    map.set(v.sku, v.id);
    if (v.erpId) map.set(v.erpId, v.id);
  }
  return map;
}

export async function lastSuccess(name: string) {
  const db = await getDb();
  const r = await db.select({ at: schema.syncLog.startedAt }).from(schema.syncLog).where(and(eq(schema.syncLog.job, name), eq(schema.syncLog.status, "ok"))).orderBy(desc(schema.syncLog.startedAt)).limit(1);
  return r[0]?.at ?? null;
}

async function uniqueSlug(table: "products" | "producers" | "categories", base: string) {
  const db = await getDb();
  const t = schema[table];
  let slug = base || "item";
  for (let i = 2; await db.select({ id: t.id }).from(t).where(eq(t.slug, slug)).limit(1).then((r) => r.length); i++) slug = `${base}-${i}`;
  return slug;
}

/** Articles: ERP owns commercial fields; shop owns texts/images/flags. */
export async function syncArticles(client: ErpClient, full = false) {
  return job("articles", async () => {
    const cfg = await getSetting("vinx");
    const owned = new Set(cfg.ownedFields);
    const db = await getDb();
    const since = full ? null : await lastSuccess("articles");
    let created = 0, updated = 0, skipped = 0;
    const producerCache = new Map<string, number>();
    const categoryCache = new Map<string, number | null>();

    for await (const raw of client.articles(since)) {
      const a = mapArticle(raw, cfg.mapping);
      if (!a.sku) { skipped++; continue; }

      let producerId: number | undefined;
      if (a.producer) {
        producerId = producerCache.get(a.producer);
        if (!producerId) {
          const found = await db.query.producers.findFirst({ where: eq(schema.producers.name, a.producer) });
          producerId = found?.id ?? (await db.insert(schema.producers).values({ name: a.producer, slug: await uniqueSlug("producers", slugify(a.producer)), country: a.product.country, region: a.product.region }).returning())[0].id;
          producerCache.set(a.producer, producerId);
        }
      }
      let categoryId: number | null | undefined;
      if (a.category) {
        if (!categoryCache.has(a.category)) {
          const cat = await db.query.categories.findFirst({ where: or(eq(schema.categories.erpCode, a.category), eq(schema.categories.slug, slugify(a.category))) });
          categoryCache.set(a.category, cat?.id ?? null);
        }
        categoryId = categoryCache.get(a.category);
      }

      const vPatch: Partial<typeof schema.variants.$inferInsert> = { syncedAt: new Date(), erpId: a.variant.erpId };
      if (owned.has("price") && a.variant.priceCents != null) vPatch.priceCents = a.variant.priceCents;
      if (owned.has("stock") && a.variant.stock != null) vPatch.stock = a.variant.stock;
      if (owned.has("vintage") && a.variant.vintage) vPatch.vintage = a.variant.vintage;
      if (owned.has("size") && a.variant.size) { vPatch.size = a.variant.size; vPatch.volumeMl = a.variant.volumeMl; }
      if (owned.has("packSize") && a.variant.packSize) vPatch.packSize = a.variant.packSize;
      if (owned.has("active") && a.variant.active != null) vPatch.active = a.variant.active;

      const existing = await db.query.variants.findFirst({ where: eq(schema.variants.sku, a.sku) });
      if (existing) {
        await db.update(schema.variants).set(vPatch).where(eq(schema.variants.id, existing.id));
        const pPatch: Partial<typeof schema.products.$inferInsert> = { updatedAt: new Date() };
        if (owned.has("taxClass") && a.product.taxClass) pPatch.taxClass = a.product.taxClass;
        if (owned.has("name") && Object.keys(a.names).length) pPatch.name = a.names;
        await db.update(schema.products).set(pPatch).where(eq(schema.products.id, existing.productId));
        updated++;
        continue;
      }

      // New variant → attach to product with same product code (slug) or create product.
      const code = slugify(a.productCode);
      let product = await db.query.products.findFirst({ where: eq(schema.products.slug, code) });
      if (!product) {
        const kind = a.kind ?? (a.product.color ? "wine" : "food");
        [product] = await db
          .insert(schema.products)
          .values({
            slug: await uniqueSlug("products", code || slugify(`${a.names.de ?? a.sku}`)),
            name: Object.keys(a.names).length ? a.names : { de: a.sku },
            kind,
            producerId,
            categoryId: categoryId ?? null,
            country: a.product.country,
            region: a.product.region,
            appellation: a.product.appellation,
            grapes: a.product.grapes,
            alcohol: a.product.alcohol,
            color: a.product.color as "red" | undefined,
            taxClass: a.product.taxClass ?? (kind === "food" ? "reduced" : "standard"),
            ageRestricted: kind !== "food",
          })
          .returning();
      }
      await db.insert(schema.variants).values({ ...vPatch, productId: product.id, sku: a.sku, priceCents: vPatch.priceCents ?? 0, stock: vPatch.stock ?? 0 });
      created++;
    }
    return { items: created + updated, message: `${created} created, ${updated} updated, ${skipped} skipped${since ? ` (delta since ${since.toISOString()})` : " (full)"}` };
  });
}

export async function syncStock(client: ErpClient) {
  return job("stock", async () => {
    const cfg = await getSetting("vinx");
    const db = await getDb();
    let n = 0;
    const ids = await variantRefs();
    for await (const raw of client.stock()) {
      const s = mapStock(raw, cfg.mapping);
      const id = ids.get(s.ref);
      if (!id) continue;
      await db.update(schema.variants).set({ stock: s.stock, syncedAt: new Date() }).where(eq(schema.variants.id, id));
      n++;
    }
    return { items: n, message: `${n} variants updated` };
  });
}

export async function syncPrices(client: ErpClient) {
  return job("prices", async () => {
    const cfg = await getSetting("vinx");
    const db = await getDb();
    const groups = await db.select().from(schema.customerGroups);
    const groupFor = (list: string) => groups.find((g) => g.code === cfg.groupMap[list]) ?? groups.find((g) => g.erpCode === list);
    const variantIds = await variantRefs();
    const tiers = new Map<string, { minQty: number; netCents: number }[]>();
    for await (const raw of client.prices()) {
      const pr = mapPrice(raw, cfg.mapping);
      const g = groupFor(pr.list);
      const vid = variantIds.get(pr.ref);
      if (!g || !vid || pr.netCents <= 0) continue;
      const k = `${vid}:${g.id}`;
      tiers.set(k, [...(tiers.get(k) ?? []), { minQty: pr.minQty, netCents: pr.netCents }]);
    }
    let rows = 0;
    await db.transaction(async (tx) => {
      for (const [k, list] of tiers) {
        const [variantId, groupId] = k.split(":").map(Number);
        await tx.delete(schema.prices).where(and(eq(schema.prices.variantId, variantId), eq(schema.prices.groupId, groupId)));
        await tx.insert(schema.prices).values(list.map((t) => ({ variantId, groupId, ...t })));
        rows += list.length;
      }
    });
    return { items: rows, message: `${rows} price rows for ${tiers.size} variant/list pairs` };
  });
}

// ── Outbound ────────────────────────────────────────────────────────────

export async function enqueue(type: "order" | "customer", refId: number, payload: OrderPayload | CustomerPayload) {
  const db = await getDb();
  await db.insert(schema.erpOutbox).values({ type, refId, payload });
}

export async function orderPayload(orderId: number): Promise<OrderPayload> {
  const db = await getDb();
  const o = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
  if (!o) throw new Error(`order ${orderId} not found`);
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  const user = o.userId ? await db.query.users.findFirst({ where: eq(schema.users.id, o.userId) }) : null;
  const group = o.groupId ? await db.query.customerGroups.findFirst({ where: eq(schema.customerGroups.id, o.groupId) }) : null;
  return {
    order: {
      number: o.number, createdAt: o.createdAt.toISOString(), kind: o.kind, email: o.email, customerErpId: user?.erpId ?? null, priceList: group?.erpCode ?? null,
      couponCode: o.couponCode, paymentMethod: o.paymentMethod, shippingMethod: o.shippingMethod, poNumber: o.poNumber, deliveryDate: o.deliveryDate, notes: o.notes,
      currency: o.currency, subtotalNet: o.subtotalNet, shippingGross: o.shippingGross, discountGross: o.discountGross, taxTotal: o.taxTotal, totalGross: o.totalGross, locale: o.locale,
    },
    billing: o.billing,
    shipping: o.shipping ?? o.billing,
    items: await Promise.all(items.map(async (i) => ({
      sku: i.sku,
      erpId: i.variantId ? ((await db.query.variants.findFirst({ where: eq(schema.variants.id, i.variantId) }))?.erpId ?? null) : null,
      name: i.name, qty: i.qty, unitNet: i.unitNet, unitGross: i.unitGross, taxRate: i.taxRate,
    }))),
  };
}

export async function customerPayload(userId: number): Promise<CustomerPayload | null> {
  const db = await getDb();
  const u = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!u || u.role !== "customer") return null;
  const g = u.groupId ? await db.query.customerGroups.findFirst({ where: eq(schema.customerGroups.id, u.groupId) }) : null;
  return { id: u.id, erpId: u.erpId, email: u.email, name: u.name, company: u.company, uidNumber: u.uidNumber, phone: u.phone, priceList: g?.erpCode ?? null, locale: u.locale, billing: u.billing };
}

/** Deliver queued messages with exponential backoff. Safe to run concurrently-ish (row status guards). */
export async function processOutbox(client?: ErpClient, limit = 50) {
  return job("outbox", async () => {
    const cfg = await getSetting("vinx");
    client ??= await erpClient(cfg);
    const db = await getDb();
    const rows = await db.select().from(schema.erpOutbox)
      .where(and(inArray(schema.erpOutbox.status, ["pending", "retry"]), lte(schema.erpOutbox.nextAttemptAt, new Date())))
      .orderBy(schema.erpOutbox.id).limit(limit);
    let sent = 0, failed = 0;
    for (const row of rows) {
      try {
        if (row.type === "order") {
          const erpId = await client.pushOrder(row.payload as OrderPayload);
          await db.update(schema.orders).set({ erpId: erpId || null, erpStatus: "transferred" }).where(eq(schema.orders.id, row.refId));
        } else {
          const erpId = await client.pushCustomer(row.payload as CustomerPayload);
          if (erpId) await db.update(schema.users).set({ erpId }).where(eq(schema.users.id, row.refId));
        }
        await db.update(schema.erpOutbox).set({ status: "sent", sentAt: new Date(), attempts: row.attempts + 1, lastError: null }).where(eq(schema.erpOutbox.id, row.id));
        sent++;
      } catch (e) {
        const attempts = row.attempts + 1;
        const dead = attempts >= cfg.maxAttempts;
        await db.update(schema.erpOutbox).set({
          status: dead ? "failed" : "retry", attempts, lastError: (e instanceof Error ? e.message : String(e)).slice(0, 2000),
          nextAttemptAt: new Date(Date.now() + Math.min(6 * 3600_000, 60_000 * 2 ** attempts)),
        }).where(eq(schema.erpOutbox.id, row.id));
        if (dead && row.type === "order") await db.update(schema.orders).set({ erpStatus: "failed" }).where(eq(schema.orders.id, row.refId));
        failed++;
      }
    }
    return { items: sent, message: `${sent} sent, ${failed} failed` };
  });
}

export async function retryOutbox(id: number) {
  const db = await getDb();
  await db.update(schema.erpOutbox).set({ status: "retry", nextAttemptAt: new Date() }).where(eq(schema.erpOutbox.id, id));
}

/** Scheduled run: called by /api/cron, `npm run jobs`, or a platform cron. */
export async function runScheduled(jobs: string[] = ["outbox", "stock", "prices", "articles"]) {
  const cfg = await getSetting("vinx");
  if (!cfg.enabled) return { skipped: "vinx disabled" };
  const client = await erpClient(cfg);
  const out: Record<string, unknown> = {};
  for (const j of jobs) {
    out[j] =
      j === "outbox" ? await processOutbox(client)
      : j === "stock" ? await syncStock(client)
      : j === "prices" ? await syncPrices(client)
      : j === "articles" ? await syncArticles(client)
      : j === "articles:full" ? await syncArticles(client, true)
      : { ok: false, message: "unknown job" };
  }
  return out;
}

export async function outboxCounts() {
  const db = await getDb();
  const rows = await db.select({ status: schema.erpOutbox.status, n: sql<number>`count(*)::int` }).from(schema.erpOutbox).groupBy(schema.erpOutbox.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<"pending" | "retry" | "sent" | "failed", number>>;
}
