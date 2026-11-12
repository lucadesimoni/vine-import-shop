import { eq } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import { getDb, schema } from "../db";
import type { CustomerPayload, ErpClient, OrderPayload, Raw } from "./client";

/**
 * Demo driver: behaves like vinX without a connection — generates ERP-shaped
 * records from the current catalog (with small stock movements) and accepts
 * pushed orders (written to ./data/erp-outbox/). Lets the full pipeline run
 * end-to-end before real API access exists.
 */
export class MockClient implements ErpClient {
  readonly name = "vinX Mock (Demo)";

  async ping() {
    return "Demo mode — no real ERP connected";
  }

  async *articles(): AsyncIterable<Raw> {
    const db = await getDb();
    const rows = await db
      .select({ v: schema.variants, p: schema.products, producer: schema.producers.name })
      .from(schema.variants)
      .innerJoin(schema.products, eq(schema.products.id, schema.variants.productId))
      .leftJoin(schema.producers, eq(schema.producers.id, schema.products.producerId));
    for (const { v, p, producer } of rows) {
      yield {
        // Shaped like vinX REST3 BaseData/Article (field names per default mapping).
        id: v.erpId ?? v.sku, number: v.sku, wineInfoId: p.slug, designation: p.name.de, designationIt: p.name.it, producer: { name: producer },
        vintage: v.vintage, contentDesignation: v.size, salesPrice: (v.priceCents / 100).toFixed(2), vatCode: p.taxClass === "reduced" ? "R" : "N",
        packagingUnit: v.packSize, isShopArticle: v.active, modifiedDate: new Date().toISOString(),
      };
    }
  }

  async *stock(): AsyncIterable<Raw> {
    const db = await getDb();
    for (const v of await db.select({ sku: schema.variants.sku, erpId: schema.variants.erpId, stock: schema.variants.stock }).from(schema.variants)) {
      yield { articleId: v.erpId ?? v.sku, availableQuantity: Math.max(0, v.stock + Math.floor(Math.random() * 19) - 6) };
    }
  }

  async *prices(): AsyncIterable<Raw> {
    const db = await getDb();
    const rows = await db
      .select({ sku: schema.variants.sku, erpId: schema.variants.erpId, list: schema.customerGroups.erpCode, minQty: schema.prices.minQty, net: schema.prices.netCents })
      .from(schema.prices)
      .innerJoin(schema.variants, eq(schema.variants.id, schema.prices.variantId))
      .innerJoin(schema.customerGroups, eq(schema.customerGroups.id, schema.prices.groupId));
    for (const r of rows) yield { articleId: r.erpId ?? r.sku, priceGroupId: r.list, quantity: r.minQty, price: (r.net / 100).toFixed(2) };
  }

  async pushOrder(payload: OrderPayload) {
    const id = `VX-${Math.floor(100000 + Math.random() * 900000)}`;
    await mkdir("data/erp-outbox", { recursive: true });
    await writeFile(`data/erp-outbox/order-${payload.order.number}.json`, JSON.stringify({ ...payload, erpId: id }, null, 2));
    return id;
  }

  async pushCustomer(_payload: CustomerPayload) {
    return `K-${Math.floor(10000 + Math.random() * 90000)}`;
  }
}
