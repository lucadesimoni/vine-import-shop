import { and, desc, eq, inArray, lte, or, sql } from "drizzle-orm";
import type { Settings } from "~/lib/settings";
import { slugify } from "~/lib/slug";
import { getDb, schema } from "../db";
import type { ErpCustomerInfo } from "../db/schema";
import { getSetting } from "../settings";
import type { CustomerPayload, ErpClient, OrderPayload, Raw } from "./client";
import { CsvClient } from "./csv";
import { mapArticle, mapPrice, mapStock } from "./mapper";

/** ERP client for the configured driver — drivers come from the extension registry (core: mock · rest3 · csv). */
export async function erpClient(cfg?: Settings["vinx"], files?: ConstructorParameters<typeof CsvClient>[0]): Promise<ErpClient> {
  cfg ??= await getSetting("vinx");
  const { bootExtensions, erpDrivers } = await import("../extensions");
  await bootExtensions();
  if (files) return erpDrivers.get("csv")!.create(cfg, files);
  return (erpDrivers.get(cfg.driver) ?? erpDrivers.get("mock")!).create(cfg);
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

const mappingFor = (cfg: Settings["vinx"], client: ErpClient) => (client.mapping === "csv" ? cfg.csvMapping : cfg.mapping);

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

    // optional e-commerce assortment (vinX ArticleSelectionCode): articles outside it are not offered online
    const assortment = cfg.selectionCodeId && client.assortment ? await client.assortment(cfg.selectionCodeId) : null;
    for await (const raw of client.articles(since)) {
      const a = mapArticle(raw, mappingFor(cfg, client));
      if (!a.sku) { skipped++; continue; }
      if (assortment && !assortment.has(String(a.variant.erpId ?? a.sku))) a.variant.active = false;

      let producerId: number | undefined;
      if (a.producer) {
        producerId = producerCache.get(a.producer);
        if (!producerId) {
          // match by ERP key first (survives renaming in the admin), then by name; logo, texts and website stay shop-owned
          const found = (await db.query.producers.findFirst({ where: eq(schema.producers.erpId, a.producer) })) ?? (await db.query.producers.findFirst({ where: eq(schema.producers.name, a.producer) }));
          producerId = found?.id ?? (await db.insert(schema.producers).values({ name: a.producer, erpId: a.producer, slug: await uniqueSlug("producers", slugify(a.producer)), country: a.product.country, region: a.product.region }).returning())[0].id;
          if (found && !found.erpId) await db.update(schema.producers).set({ erpId: a.producer }).where(eq(schema.producers.id, found.id));
          // producer portrait / website from vinX only while the shop has none (shop texts win)
          const info = a.producerInfo;
          const target = found ?? (await db.query.producers.findFirst({ where: eq(schema.producers.id, producerId) }));
          if (info && target) {
            const patch: Partial<typeof schema.producers.$inferInsert> = {};
            if (info.description && !Object.values(target.description ?? {}).some(Boolean)) patch.description = { de: info.description };
            if (info.website && !target.website && /^https?:\/\//.test(info.website)) patch.website = info.website;
            if (Object.keys(patch).length) await db.update(schema.producers).set(patch).where(eq(schema.producers.id, target.id));
          }
          // origin from supplier master data: fill producer region/country once known
          if (found && !found.region && a.product.region) await db.update(schema.producers).set({ region: a.product.region, country: found.country ?? a.product.country }).where(eq(schema.producers.id, found.id));
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

      const vPatch: Partial<typeof schema.variants.$inferInsert> = { syncedAt: new Date(), erpId: a.variant.erpId, ...(a.variant.weightG ? { weightG: a.variant.weightG } : {}) };
      if (owned.has("price") && a.variant.priceCents != null) vPatch.priceCents = a.variant.priceCents;
      if (owned.has("stock") && a.variant.stock != null) vPatch.stock = a.variant.stock;
      if (owned.has("vintage") && a.variant.vintage) vPatch.vintage = a.variant.vintage;
      if (owned.has("size") && a.variant.size) { vPatch.size = a.variant.size; vPatch.volumeMl = a.variant.volumeMl; }
      if (owned.has("packSize") && a.variant.packSize) vPatch.packSize = a.variant.packSize;
      if (owned.has("active") && a.variant.active != null) vPatch.active = a.variant.active;
      if (a.variant.discountGroup) vPatch.discountGroup = a.variant.discountGroup;

      const existing = await db.query.variants.findFirst({ where: eq(schema.variants.sku, a.sku) });
      if (existing) {
        await db.update(schema.variants).set(vPatch).where(eq(schema.variants.id, existing.id));
        const pPatch: Partial<typeof schema.products.$inferInsert> = { updatedAt: new Date() };
        if (owned.has("taxClass") && a.product.taxClass) pPatch.taxClass = a.product.taxClass;
        if (owned.has("name") && Object.keys(a.names).length) pPatch.name = a.names;
        if (a.details) pPatch.erpDetails = a.details;
        if (a.text) {
          const cur = await db.query.products.findFirst({ where: eq(schema.products.id, existing.productId), columns: { description: true } });
          if (!Object.values(cur?.description ?? {}).some(Boolean)) pPatch.description = { de: a.text };
        }
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
            erpDetails: a.details ?? null,
            ...(a.text ? { description: { de: a.text } } : {}),
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
    // Rarities add-in: stock per bottle condition (StockData.conditionId → BaseData/Condition)
    const conditions = client.conditions ? new Map((await client.conditions()).map((c) => [Number(c.id), c])) : new Map<number, Raw>();
    for await (const raw of client.stock()) {
      const s = mapStock(raw, mappingFor(cfg, client));
      const id = ids.get(s.ref);
      if (!id) continue;
      const conditionId = raw.conditionId != null ? Number(raw.conditionId) : null;
      await db.update(schema.variants).set({ stock: s.stock, syncedAt: new Date(), conditionId }).where(eq(schema.variants.id, id));
      const c = conditionId != null ? conditions.get(conditionId) : undefined;
      if (c) {
        const v = await db.query.variants.findFirst({ where: eq(schema.variants.id, id), columns: { productId: true } });
        const p = v && (await db.query.products.findFirst({ where: eq(schema.products.id, v.productId), columns: { erpDetails: true } }));
        const str = (x: unknown) => (x == null || x === "" ? undefined : String(x));
        if (v) await db.update(schema.products).set({ erpDetails: { ...(p?.erpDetails ?? {}), condition: { id: conditionId!, designation: String(c.designation ?? ""), quality: str(c.quality), level: str(c.levelInCm != null ? `${c.levelInCm} cm` : c.level), label: str(c.label), capsule: str(c.capsule) } } }).where(eq(schema.products.id, v.productId));
      }
      n++;
    }
    return { items: n, message: `${n} variants updated` };
  });
}

/**
 * Prices (vinX BaseData/SellingPrices or CSV): consumer price group → variant list price (incl. VAT);
 * trade price groups → group tier prices (excl. VAT); promotion prices → conditions (source "vinx").
 * Price groups flagged pricesWithVat are converted with the article's VAT rate.
 */
export async function syncPrices(client: ErpClient) {
  return job("prices", async () => {
    const cfg = await getSetting("vinx");
    const shop = await getSetting("shop");
    const db = await getDb();
    const groups = await db.select().from(schema.customerGroups);
    const erpGroups = new Map((await client.priceGroups?.().catch(() => [])) ?.map((g) => [g.id, g]) ?? []);
    const groupFor = (list: string) => groups.find((g) => g.code === cfg.groupMap[list]) ?? groups.find((g) => g.erpCode === list);
    const consumerList = cfg.consumerPriceGroupId != null ? String(cfg.consumerPriceGroupId) : Object.entries(cfg.groupMap).find(([, code]) => code === "consumer")?.[0];
    const variants = await db.select({ id: schema.variants.id, sku: schema.variants.sku, erpId: schema.variants.erpId, taxClass: schema.products.taxClass }).from(schema.variants).innerJoin(schema.products, eq(schema.products.id, schema.variants.productId));
    const byRef = new Map<string, (typeof variants)[number]>();
    for (const v of variants) { byRef.set(v.sku, v); if (v.erpId) byRef.set(v.erpId, v); }
    const rate = (taxClass: string) => (taxClass === "reduced" ? shop.tax.reduced : shop.tax.standard) / 100;

    const tiers = new Map<string, { minQty: number; netCents: number }[]>();
    const listPrices = new Map<number, number>();
    const promos: (typeof schema.conditions.$inferInsert)[] = [];
    for await (const raw of client.prices()) {
      const pr = mapPrice(raw, mappingFor(cfg, client));
      const v = byRef.get(pr.ref);
      if (!v || !pr.current || pr.netCents <= 0) continue;
      const withVat = erpGroups.get(pr.list)?.pricesWithVat ?? pr.list === consumerList;
      const toNet = (c: number) => (withVat ? Math.round(c / (1 + rate(v.taxClass))) : c);
      const toGross = (c: number) => (withVat ? c : Math.round(c * (1 + rate(v.taxClass))));
      const g = groupFor(pr.list);
      if (pr.list === consumerList && pr.minQty <= 1) listPrices.set(v.id, toGross(pr.netCents));
      else if (g) {
        const k = `${v.id}:${g.id}`;
        tiers.set(k, [...(tiers.get(k) ?? []), { minQty: pr.minQty, netCents: toNet(pr.netCents) }]);
      }
      if (cfg.syncConditions && pr.promoCents && pr.promoCents > 0 && (raw.isPromotion !== false || pr.promoValidTo)) {
        promos.push({
          source: "vinx", erpId: `promo:${pr.ref}:${pr.list}:${pr.minQty}`, type: "promotion_price",
          groupId: pr.list === consumerList ? null : (g?.id ?? null), targetType: "variant", target: String(v.id), calc: "fixed_price",
          value: String(toNet(pr.promoCents)), minQty: pr.minQty > 1 ? pr.minQty : 0, validFrom: pr.promoValidFrom, validTo: pr.promoValidTo,
          label: { de: String(raw.promotionText ?? "") || "Aktionspreis" },
        });
      }
    }
    let rows = 0;
    await db.transaction(async (tx) => {
      for (const [id, cents] of listPrices) await tx.update(schema.variants).set({ priceCents: cents, syncedAt: new Date() }).where(eq(schema.variants.id, id));
      for (const [k, list] of tiers) {
        const [variantId, groupId] = k.split(":").map(Number);
        await tx.delete(schema.prices).where(and(eq(schema.prices.variantId, variantId), eq(schema.prices.groupId, groupId)));
        await tx.insert(schema.prices).values(list.map((t) => ({ variantId, groupId, ...t })));
        rows += list.length;
      }
      if (cfg.syncConditions) {
        await tx.delete(schema.conditions).where(and(eq(schema.conditions.source, "vinx"), eq(schema.conditions.type, "promotion_price")));
        if (promos.length) await tx.insert(schema.conditions).values(promos);
      }
    });
    return { items: rows + listPrices.size, message: `${listPrices.size} list prices, ${rows} tier rows (${tiers.size} variant/group pairs), ${promos.length} promotions` };
  });
}

/** vinX BaseData/SpecialPrices → customer special-price conditions (source "vinx"). */
export async function syncSpecialPrices(client: ErpClient) {
  return job("conditions", async () => {
    const cfg = await getSetting("vinx");
    if (!client.specialPrices || !cfg.syncConditions) return { items: 0, message: "not supported by driver" };
    const db = await getDb();
    const users = new Map((await db.select({ id: schema.users.id, erpId: schema.users.erpId }).from(schema.users)).filter((u) => u.erpId).map((u) => [u.erpId!, u.id]));
    const refs = await variantRefs();
    const rowsOut: (typeof schema.conditions.$inferInsert)[] = [];
    let skipped = 0;
    for await (const r of client.specialPrices()) {
      const userId = users.get(String(r.addressId));
      const variantId = refs.get(String(r.articleId));
      if (!userId || !variantId) { skipped++; continue; }
      const percent = r.calculationMode === "percent";
      rowsOut.push({
        source: "vinx", erpId: `special:${r.id}`, type: "special_price", customerId: userId, targetType: "variant", target: String(variantId),
        calc: percent ? "percent" : "fixed_price", value: String(percent ? Number(r.unitPrice) : Math.round(Number(r.unitPrice) * 100)),
        minQty: Number(r.fromQuantity ?? 0), onNetPrices: !r.isNetto,
        validFrom: r.priceValidFrom ? new Date(String(r.priceValidFrom)) : null, validTo: r.priceValidUntil ? new Date(String(r.priceValidUntil)) : null,
        label: { de: "Spezialpreis", it: "Prezzo speciale" },
      });
    }
    await db.transaction(async (tx) => {
      await tx.delete(schema.conditions).where(and(eq(schema.conditions.source, "vinx"), eq(schema.conditions.type, "special_price")));
      if (rowsOut.length) await tx.insert(schema.conditions).values(rowsOut);
    });
    return { items: rowsOut.length, message: `${rowsOut.length} special prices${skipped ? `, ${skipped} skipped (customer/article not linked)` : ""}` };
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
      // invoice orders keep the customer's own vinX payment terms (e.g. 60 days) instead of the generic mapping
      paymentConditionId: o.paymentMethod === "invoice" && user?.erpPaymentConditionId != null ? user.erpPaymentConditionId : null,
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

/**
 * vinX → shop: address changes made in the ERP (BaseData/Address, incremental by changedOn) update the linked
 * shop customer (users.erpId = vinX address id). If the shop record was changed more recently, the shop wins —
 * its change is already queued for vinX (customer.updated → Online/OnlineAddress changeType "change").
 */
export async function syncCustomers(client: ErpClient) {
  return job("customers", async () => {
    const cfg = await getSetting("vinx");
    if (!client.addresses || !cfg.pullCustomers) return { items: 0, message: "customer pull off / not supported by driver" };
    const db = await getDb();
    const since = await lastSuccess("customers");
    const groups = await db.select().from(schema.customerGroups);
    let updated = 0, skipped = 0;
    for await (const a of client.addresses(since)) {
      const id = String(a.id ?? a.addressNumber ?? "");
      // the address's own login (contact-person logins share the address id and follow below)
      const linked = id ? await db.select().from(schema.users).where(eq(schema.users.erpId, id)) : [];
      const u = linked.find((x) => !x.erpInfo?.contactPersonId) ?? linked[0];
      if (!u) { skipped++; continue; }
      const changed = a.changedOn ? new Date(String(a.changedOn)) : null;
      if (changed && u.updatedAt > changed) { skipped++; continue; }
      const str = (v: unknown) => (v == null || v === "" ? undefined : String(v));
      const name = [str(a.firstName), str(a.name)].filter(Boolean).join(" ") || u.name;
      const country = str((a.country as Raw | undefined)?.isoCode) ?? u.billing?.country ?? "CH";
      const groupCode = a.priceGroupId != null ? cfg.groupMap[String(a.priceGroupId)] : undefined;
      const group = groupCode ? groups.find((g) => g.code === groupCode) : undefined;
      const language = str(a.language)?.toLowerCase();
      const patch = {
        name,
        company: str(a.companyName) ?? u.company,
        phone: str(a.phoneBusiness) ?? str(a.phoneDirect) ?? str(a.mobile) ?? u.phone,
        billing: { ...(u.billing ?? {}), name, company: str(a.companyName) ?? u.billing?.company, street: str(a.street) ?? u.billing?.street ?? "", zip: str(a.zipCode) ?? u.billing?.zip ?? "", city: str(a.city) ?? u.billing?.city ?? "", country },
        groupId: group?.id ?? u.groupId,
        // the customer's payment terms in vinX decide which payment methods the shop offers (see payments.ts)
        erpPaymentConditionId: a.paymentConditionId != null ? Number(a.paymentConditionId) : u.erpPaymentConditionId,
        erpInfo: { ...erpInfoOf(a), ...(u.erpInfo?.contactPersonId ? { contactPersonId: u.erpInfo.contactPersonId } : {}) },
        locale: language && ["de", "it", "fr", "en"].includes(language) ? language : u.locale,
        updatedAt: changed ?? new Date(),
      };
      const before = JSON.stringify([u.name, u.company, u.phone, u.billing, u.groupId, u.locale]);
      if (before === JSON.stringify([patch.name, patch.company, patch.phone, patch.billing, patch.groupId, patch.locale])) { skipped++; continue; }
      await db.update(schema.users).set(patch).where(eq(schema.users.id, u.id));
      // contact-person logins of the same address: company, address, group, payment terms, master data
      for (const cp of linked.filter((x) => x.id !== u.id)) {
        await db.update(schema.users).set({ company: patch.company, billing: { ...patch.billing, name: cp.billing?.name ?? cp.name }, groupId: patch.groupId, erpPaymentConditionId: patch.erpPaymentConditionId, erpInfo: { ...patch.erpInfo, contactPersonId: cp.erpInfo?.contactPersonId } }).where(eq(schema.users.id, cp.id));
      }
      updated++;
    }
    return { items: updated, message: `${updated} customers updated from vinX, ${skipped} unchanged/not linked` };
  });
}

/**
 * vinX → shop: order status from receipts (BaseData/Receipt.shopId = shop order number).
 * new → confirmed · inProgress → processing · done → shipped · payed / archived → completed (+ paid) · cancelled → cancelled.
 * A status only moves forward (or to cancelled); customers are notified by the normal status events.
 */
const RECEIPT_STATUS = { new: "confirmed", inProgress: "processing", done: "shipped", payed: "completed", archived: "completed", cancelled: "cancelled" } as const;
const RANK = ["new", "confirmed", "processing", "shipped", "completed"];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** vinX address (enriched by the driver) → customer master data shown in admin and portal. */
export function erpInfoOf(a: Raw): ErpCustomerInfo {
  const str = (x: unknown) => (x == null || x === "" ? undefined : String(x));
  const rep = a.salesRepresentative as Raw | undefined;
  const tourOrDay = (a.deliveryDay ?? a.tour) as Raw | undefined;
  const days = tourOrDay ? (["tourMonday", "tourTuesday", "tourWednesday", "tourThursday", "tourFriday", "tourSaturday"] as const).map((k, i) => (tourOrDay[k] ? i + 1 : 0)).filter(Boolean) : undefined;
  const info: ErpCustomerInfo = {
    salesRep: rep ? { name: [rep.firstName, rep.name].filter(Boolean).join(" "), reference: str(rep.reference), region: str(rep.region) } : undefined,
    deliveryDays: days?.length ? days : undefined,
    tour: str((a.tour as Raw | undefined)?.tourName ?? (a.tour as Raw | undefined)?.tourDescription ?? (a.deliveryDay as Raw | undefined)?.tourDescription),
    category: str((a.customerCategory as Raw | undefined)?.designation),
    chain: str((a.chain as Raw | undefined)?.designation),
    channel: str((a.distributionChannel as Raw | undefined)?.description),
    selectionCodeId: a.selectionCodeId != null ? Number(a.selectionCodeId) : (a.platformSelectionIds as number[] | undefined)?.[0],
    assortment: str((a.selectionCode as Raw | undefined)?.designation),
    marketing: Array.isArray(a.marketing) && a.marketing.length ? (a.marketing as string[]) : undefined,
    salutation: str((a.salutation as Raw | undefined)?.salutation ?? (a.salutation as Raw | undefined)?.designation),
  };
  return Object.fromEntries(Object.entries(info).filter(([, v]) => v !== undefined)) as ErpCustomerInfo;
}

export async function syncOrderStatus(client: ErpClient) {
  return job("orders:status", async () => {
    if (!client.receipts) return { items: 0, message: "driver has no receipts feed" };
    const db = await getDb();
    const { setOrderStatus, markPaid } = await import("../orders");
    let updated = 0, unknown = 0;
    for await (const r of client.receipts(await lastSuccess("orders:status"))) {
      const number = String(r.shopId ?? "");
      const order = number ? await db.query.orders.findFirst({ where: eq(schema.orders.number, number) }) : undefined;
      if (!order) { unknown++; continue; }
      const next = RECEIPT_STATUS[String(r.receiptStatus) as keyof typeof RECEIPT_STATUS];
      if (r.orderNumber && !order.erpId) await db.update(schema.orders).set({ erpId: String(r.orderNumber), erpStatus: "transferred" }).where(eq(schema.orders.id, order.id));
      if ((r.receiptStatus === "payed" || r.receiptStatus === "archived") && order.paymentStatus !== "paid") await markPaid(order.id, `vinx:${r.invoiceNumber ?? r.id}`);
      // tracking numbers of the delivery (BaseData/ShippingPackage) — they go into the shipping e-mail
      const tracking = next === "shipped" && !order.trackingNumber && client.shippingPackages && r.id != null ? (await client.shippingPackages(String(r.id))).join(", ") || null : null;
      if (!next || order.status === "cancelled" || order.status === next) continue;
      if (next !== "cancelled" && RANK.indexOf(next) <= RANK.indexOf(order.status)) continue;
      await setOrderStatus(order.id, next, tracking ? { carrier: order.carrier ?? "post", trackingNumber: tracking } : undefined);
      updated++;
    }
    return { items: updated, message: `${updated} orders updated from vinX receipts${unknown ? `, ${unknown} receipts without shop order` : ""}` };
  });
}

/**
 * vinX → shop: create shop accounts for vinX customers that have an e-mail (BaseData/Address, active).
 * Accounts have no usable password; send invitations from Admin › Kunden (bulk action) when ready.
 */
export async function importErpCustomers(client: ErpClient) {
  return job("customers:import", async () => {
    if (!client.addresses) return { items: 0, message: "driver has no address feed" };
    const cfg = await getSetting("vinx");
    const db = await getDb();
    const groups = await db.select().from(schema.customerGroups);
    const { randomBytes } = await import("node:crypto");
    let created = 0, existing = 0, skipped = 0;
    for await (const a of client.addresses(null)) {
      const email = String(a.eMail ?? "").trim().toLowerCase();
      const erpId = String(a.id ?? a.addressNumber ?? "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || a.isActive === false) { skipped++; continue; }
      const found = (await db.query.users.findFirst({ where: eq(schema.users.erpId, erpId) })) ?? (await db.query.users.findFirst({ where: sql`lower(${schema.users.email}) = ${email} and ${schema.users.storefrontId} is null` }));
      if (found) {
        if (!found.erpId) await db.update(schema.users).set({ erpId }).where(eq(schema.users.id, found.id));
        existing++;
        continue;
      }
      const str = (v: unknown) => (v == null || v === "" ? undefined : String(v));
      const name = [str(a.firstName), str(a.name)].filter(Boolean).join(" ") || str(a.companyName) || email;
      const groupCode = a.priceGroupId != null ? cfg.groupMap[String(a.priceGroupId)] : undefined;
      const company = str(a.companyName) ?? null;
      const lang = String(a.language ?? "").toLowerCase();
      await db.insert(schema.users).values({
        email, name, company, phone: str(a.phoneBusiness) ?? str(a.mobile) ?? null, erpId, role: "customer",
        passwordHash: `invite$${randomBytes(18).toString("base64url")}`,
        groupId: groups.find((g) => g.code === groupCode)?.id ?? groups.find((g) => g.code === (company ? "trade" : "consumer"))?.id ?? null,
        tradeStatus: company ? "approved" : null,
        erpPaymentConditionId: a.paymentConditionId != null ? Number(a.paymentConditionId) : null,
        erpInfo: erpInfoOf(a),
        locale: ["de", "it", "fr", "en"].includes(lang) ? lang : "de",
        billing: { name, company: company ?? undefined, street: str(a.street) ?? "", zip: str(a.zipCode) ?? "", city: str(a.city) ?? "", country: str((a.country as Raw | undefined)?.isoCode) ?? "CH" },
      });
      created++;
    }
    // BaseData/ContactPerson: one portal login per contact person with an e-mail (same address, prices and conditions)
    let contacts = 0;
    if (client.contactPersons) {
      for await (const c of client.contactPersons()) {
        const email = String(c.email ?? "").trim().toLowerCase();
        if (!EMAIL.test(email)) continue;
        const owner = await db.query.users.findFirst({ where: eq(schema.users.erpId, String(c.addressId)) });
        if (!owner || (await db.query.users.findFirst({ where: sql`lower(${schema.users.email}) = ${email} and ${schema.users.storefrontId} is null` }))) continue;
        const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || email;
        await db.insert(schema.users).values({
          email, name, company: owner.company, phone: (c.telephone as string) || (c.mobile as string) || null, erpId: owner.erpId, role: "customer",
          passwordHash: `invite$${randomBytes(18).toString("base64url")}`, groupId: owner.groupId, tradeStatus: owner.tradeStatus, locale: owner.locale,
          erpPaymentConditionId: owner.erpPaymentConditionId, erpInfo: { ...(owner.erpInfo ?? {}), contactPersonId: Number(c.id), ...(c.department ? { department: String(c.department) } : {}) },
          billing: { ...(owner.billing ?? { street: "", zip: "", city: "", country: "CH" }), name },
        });
        contacts++;
      }
    }
    return { items: created + contacts, message: `${created} customers created from vinX${contacts ? ` + ${contacts} contact-person logins` : ""}, ${existing} already present, ${skipped} without e-mail / inactive` };
  });
}

export async function customerPayload(userId: number): Promise<CustomerPayload | null> {
  const db = await getDb();
  const u = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!u || u.role !== "customer") return null;
  // contact-person logins are maintained in vinX (BaseData/ContactPerson) — never pushed as an address
  if (u.erpInfo?.contactPersonId) return null;
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
          const payload = row.payload as CustomerPayload;
          const erpId = await client.pushCustomer(payload);
          if (erpId) await db.update(schema.users).set({ erpId }).where(eq(schema.users.id, row.refId));
          // login e-mail changed → keep the vinX shop username in step (BaseData/Address/ChangeShopUsername)
          const addressId = erpId || payload.erpId;
          if (payload.previousEmail && addressId && client.changeShopUsername) await client.changeShopUsername(addressId, payload.email);
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
/** Runs registered jobs (core vinX jobs + extension jobs). Default: every job flagged `scheduled`. */
export async function runScheduled(only?: string[]) {
  const cfg = await getSetting("vinx");
  const { bootExtensions, jobs } = await import("../extensions");
  await bootExtensions();
  const ids = only ?? [...jobs.values()].filter((j) => j.scheduled).map((j) => j.id);
  const out: Record<string, unknown> = {};
  for (const id of ids) {
    const j = jobs.get(id);
    if (!j) { out[id] = { ok: false, message: "unknown job" }; continue; }
    if (!cfg.enabled && ["outbox", "stock", "prices", "conditions", "articles"].includes(id)) { out[id] = { ok: true, message: "vinx disabled" }; continue; }
    try { out[id] = await j.run(); } catch (e) { out[id] = { ok: false, message: (e as Error).message }; }
  }
  return out;
}

export async function outboxCounts() {
  const db = await getDb();
  const rows = await db.select({ status: schema.erpOutbox.status, n: sql<number>`count(*)::int` }).from(schema.erpOutbox).groupBy(schema.erpOutbox.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<"pending" | "retry" | "sent" | "failed", number>>;
}
