import { eq, isNotNull } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import { getDb, schema } from "../db";
import type { CustomerPayload, ErpClient, OrderPayload, ProductInfo, Raw } from "./client";

/**
 * Demo driver: behaves like vinX without a connection. It emits records in exactly the shape of the
 * Shop API v2.0 (BaseData/Article enriched like Rest3Client does, Calculated/StockData, BaseData/SellingPrices,
 * BaseData/SpecialPrices, BaseData/PriceGroup), generated from the current catalog — so the full pipeline
 * (mapping → sync → conditions → outbox) runs end-to-end without real API access.
 */
export class MockClient implements ErpClient {
  readonly name = "vinX Mock (Demo)";
  readonly mapping = "rest" as const;

  async ping() {
    return "Demo mode — no real ERP connected";
  }

  async *articles(): AsyncIterable<Raw> {
    const db = await getDb();
    const rows = await db
      .select({ v: schema.variants, p: schema.products, producer: schema.producers, category: schema.categories })
      .from(schema.variants)
      .innerJoin(schema.products, eq(schema.products.id, schema.variants.productId))
      .leftJoin(schema.producers, eq(schema.producers.id, schema.products.producerId))
      .leftJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId));
    for (const { v, p, producer, category } of rows) {
      const region = p.region ?? producer?.region;
      yield {
        id: Number(v.erpId ?? 0) || v.id, articleNumber: v.sku, designation: `${p.name.de} ${v.vintage ?? ""} ${v.size ?? ""}`.trim(), designationWeb: p.name.de,
        articleType: p.kind === "wine" ? "wine" : p.kind === "spirit" ? "spirits" : p.kind === "beverage" ? "mineral" : "food",
        vintage: v.vintage ? Number(v.vintage) : null, volume: p.alcohol, vatPercentage: p.taxClass === "reduced" ? 2.6 : 8.1, isActive: v.active,
        wineId: p.kind === "wine" ? p.id : null, changedOn: new Date().toISOString(),
        // enrichment (as Rest3Client resolves producerId / regionId / countryId / articleCategoryId / fillingUnitId / tradingUnitId)
        producer: producer ? { id: producer.id, designation: producer.name } : undefined,
        region: region ? { designation: region } : undefined,
        regionTop: region ? { designation: region } : undefined,
        country: { isoCode: "IT", designation: "Italien" },
        category: category ? { designation: category.erpCode ?? category.name.de } : undefined,
        filling: v.size ? { designation: v.size, contentInCl: v.volumeMl ? v.volumeMl / 10 : undefined } : undefined,
        tradingUnit: { unitsPerTradingUnit: v.packSize },
      };
    }
  }

  async *stock(): AsyncIterable<Raw> {
    const db = await getDb();
    for (const v of await db.select({ id: schema.variants.id, erpId: schema.variants.erpId, stock: schema.variants.stock }).from(schema.variants)) {
      yield { articleId: Number(v.erpId ?? v.id), quantityAvailableForShop: Math.max(0, v.stock + Math.floor(Math.random() * 19) - 6) };
    }
  }

  async priceGroups() {
    const db = await getDb();
    const groups = await db.select().from(schema.customerGroups);
    return groups.filter((g) => g.erpCode).map((g) => ({ id: g.erpCode!, name: g.name, pricesWithVat: !g.isTrade }));
  }

  /** BaseData/SellingPrices: consumer list price (incl. VAT) + trade tiers (excl. VAT) + a demo promotion. */
  async *prices(): AsyncIterable<Raw> {
    const db = await getDb();
    const groups = await db.select().from(schema.customerGroups);
    const consumer = groups.find((g) => !g.isTrade && g.erpCode);
    let id = 0;
    for (const v of await db.select().from(schema.variants)) {
      const articleId = Number(v.erpId ?? v.id);
      if (consumer) yield { id: ++id, articleId, priceGroupId: Number(consumer.erpCode), unitPrice: v.priceCents / 100, fromQuantity: 0, isPromotion: false };
    }
    const rows = await db
      .select({ erpId: schema.variants.erpId, vid: schema.variants.id, group: schema.customerGroups.erpCode, minQty: schema.prices.minQty, net: schema.prices.netCents })
      .from(schema.prices)
      .innerJoin(schema.variants, eq(schema.variants.id, schema.prices.variantId))
      .innerJoin(schema.customerGroups, eq(schema.customerGroups.id, schema.prices.groupId));
    for (const r of rows) {
      yield { id: ++id, articleId: Number(r.erpId ?? r.vid), priceGroupId: Number(r.group), unitPrice: r.net / 100, fromQuantity: r.minQty <= 1 ? 0 : r.minQty, isPromotion: false };
    }
  }

  /** BaseData/SpecialPrices for demo customers linked to a vinX address. */
  async *specialPrices(): AsyncIterable<Raw> {
    const db = await getDb();
    const linked = await db.select({ erpId: schema.users.erpId }).from(schema.users).where(isNotNull(schema.users.erpId));
    const v = await db.query.variants.findFirst({ where: eq(schema.variants.sku, "10658") });
    for (const u of linked) {
      if (v) yield { id: 900 + Number(u.erpId), articleId: Number(v.erpId ?? v.id), addressId: Number(u.erpId), unitPrice: 33.5, calculationMode: "value", isNetto: true, fromQuantity: 0, priceValidFrom: null, priceValidUntil: null };
    }
  }

  async productInfo(req: { customerId?: number | null; articles: { erpId: string; qty: number }[] }) {
    // Demo: vinX would apply the customer's discount matrix here — mock returns no live prices (platform conditions apply).
    void req;
    return new Map<string, ProductInfo>();
  }

  async pushOrder(payload: OrderPayload) {
    const id = `VX-${Math.floor(100000 + Math.random() * 900000)}`;
    await mkdir("data/erp-outbox", { recursive: true });
    await writeFile(`data/erp-outbox/order-${payload.order.number}.json`, JSON.stringify({ ...payload, erpId: id }, null, 2));
    return id;
  }

  async pushCustomer(payload: CustomerPayload) {
    // "change" keeps the address number, "new" gets one assigned (like vinX)
    return payload.erpId ?? `${Math.floor(40000 + Math.random() * 9000)}`;
  }

  /** BaseData/Address shape for every linked customer (unchanged data → the pull is a no-op, but runs end-to-end). */
  async *addresses(): AsyncIterable<Raw> {
    const db = await getDb();
    for (const u of await db.select().from(schema.users).where(isNotNull(schema.users.erpId))) {
      const [firstName, ...rest] = (u.billing?.name ?? u.name).split(" ");
      yield {
        id: Number(u.erpId), addressNumber: Number(u.erpId), firstName: rest.length ? firstName : null, name: rest.length ? rest.join(" ") : firstName,
        companyName: u.company, street: u.billing?.street, zipCode: u.billing?.zip, city: u.billing?.city, country: { isoCode: u.billing?.country ?? "CH" },
        eMail: u.email, phoneBusiness: u.phone, language: u.locale.toUpperCase(), changedOn: u.updatedAt.toISOString(), isActive: true,
      };
    }
  }
}
