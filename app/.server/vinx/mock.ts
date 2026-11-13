import { and, eq, inArray, isNotNull } from "drizzle-orm";
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

  /** BaseData/Receipt shape for orders handed to "vinX": status advances with the order's age (demo). */
  async *receipts(): AsyncIterable<Raw> {
    const db = await getDb();
    for (const o of await db.select().from(schema.orders).where(isNotNull(schema.orders.erpId))) {
      const hours = (Date.now() - o.createdAt.getTime()) / 3600e3;
      const receiptStatus = hours > 72 ? "payed" : hours > 24 ? "done" : "inProgress";
      yield { id: Number(o.erpId?.replace(/\D/g, "")) || o.id, shopId: o.number, orderNumber: o.erpId, receiptStatus, invoiceNumber: hours > 24 ? `R-${o.id}` : null, changedOn: new Date().toISOString() };
    }
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

  /** BaseData/DocumentInfo: one invoice per transferred order older than a day (demo). */
  async documents(addressId: string) {
    const db = await getDb();
    const user = await db.query.users.findFirst({ where: eq(schema.users.erpId, addressId) });
    if (!user) return [];
    const rows = await db.select().from(schema.orders).where(and(eq(schema.orders.userId, user.id), isNotNull(schema.orders.erpId)));
    return rows
      .filter((o) => Date.now() - o.createdAt.getTime() > 24 * 3600e3)
      .map((o) => ({ id: String(o.id), receiptId: o.erpId, title: `Rechnung R-${o.id} · ${o.number}` }));
  }

  /** BaseData/Document: a small generated PDF (demo — vinX returns the archived original). */
  async document(id: string) {
    const db = await getDb();
    const o = await db.query.orders.findFirst({ where: eq(schema.orders.id, Number(id)) });
    if (!o) return null;
    const chf = (c: number) => (c / 100).toFixed(2);
    const pdf = minimalPdf([`Rechnung R-${o.id}`, `Bestellung ${o.number} vom ${o.createdAt.toLocaleDateString("de-CH")}`, `${o.billing.name}`, `Total CHF ${chf(o.totalGross)}`, "", "Demo-Dokument (vinX Mock)"]);
    return { body: pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer, type: "application/pdf", name: `rechnung-R-${o.id}.pdf` };
  }

  /** Calculated/OrderProposal: articles the customer ordered, most frequent first. */
  async orderProposal(addressId: string) {
    const db = await getDb();
    const user = await db.query.users.findFirst({ where: eq(schema.users.erpId, addressId) });
    if (!user) return [];
    const ids = (await db.select({ id: schema.orders.id }).from(schema.orders).where(eq(schema.orders.userId, user.id))).map((r) => r.id);
    if (!ids.length) return [];
    const agg = new Map<string, { quantity: number; orders: Set<number> }>();
    for (const i of await db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, ids))) {
      const a = agg.get(i.sku) ?? { quantity: 0, orders: new Set<number>() };
      a.quantity += i.qty; a.orders.add(i.orderId); agg.set(i.sku, a);
    }
    return [...agg].map(([sku, a]) => ({ articleId: sku, articleNumber: sku, quantity: a.quantity, orders: a.orders.size })).sort((x, y) => y.orders - x.orders || y.quantity - x.quantity).slice(0, 24);
  }

  async referenceData() {
    return {
      deliveryConditions: [{ id: 1, designation: "Post / Paketversand" }, { id: 2, designation: "Eigene Auslieferung" }, { id: 4, designation: "Abholung Lager" }],
      paymentConditions: [{ id: 1, designation: "Vorauskasse" }, { id: 2, designation: "Rechnung 30 Tage netto" }, { id: 7, designation: "Online-Zahlung" }],
      priceGroups: (await this.priceGroups()).map((g) => ({ id: g.id, designation: g.name })),
    };
  }

  async changeShopUsername() {
    // demo: nothing to change remotely
  }
}

/** A one-page PDF with Helvetica text lines (valid xref, no dependencies). */
export function minimalPdf(lines: string[]): Uint8Array {
  const esc = (t: string) => t.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/([\\()])/g, "\\$1");
  const stream = `BT /F1 12 Tf 56 780 Td 16 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(" ")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
