import type { Settings } from "~/lib/settings";
import type { BasketLine, BasketRequest, BasketResult, CustomerPayload, ErpClient, OrderPayload, ProductInfo, Raw } from "./client";

type Cfg = Settings["vinx"];

/**
 * vinX REST3 client — implemented against the official OpenAPI spec "I-AG Standard Shop API v2.0"
 * (<host>/swagger → /swagger/Shopv20/swagger.json; contract-tested in tests/vinx-contract.test.ts):
 *  - Auth: POST /api/Identity/Realm/RequestToken {client_id, grant_type:"password", scope:"VinX.Shop", username, password} → access_token
 *  - Paths: /api/v2.0/Core/VinX/Shop/{BaseData|Calculated|Online}/…  (OData $filter/$top/$skip/$select/$orderby)
 *  - Delta: BaseData/Article?$filter=changedOn gt <ISO>
 *  - Errors: RFC 7807 application/problem+json
 * Password: env VINX_PASSWORD. Server-to-server only.
 */
export class Rest3Client implements ErpClient {
  readonly name = "vinX REST3";
  readonly mapping = "rest" as const;
  private token: { value: string; exp: number } | null = null;

  constructor(private cfg: Cfg, private locale = "de") {}

  private get root() {
    if (!this.cfg.baseUrl) throw new Error("vinX base URL not configured");
    return this.cfg.baseUrl.replace(/\/$/, "");
  }
  private shop(path: string) {
    return `${this.root}/api/${this.cfg.apiVersion}/Core/VinX/Shop/${path}`;
  }

  private async auth(): Promise<string> {
    if (this.token && this.token.exp > Date.now() + 30_000) return this.token.value;
    const res = await fetch(`${this.root}/api/Identity/Realm/RequestToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: this.cfg.clientId, grant_type: "password", scope: "VinX.Shop", username: this.cfg.username, password: process.env.VINX_PASSWORD ?? "" }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`vinX auth failed: HTTP ${res.status} ${await problem(res)}`);
    const json = (await res.json()) as { access_token: string };
    this.token = { value: json.access_token, exp: jwtExp(json.access_token) ?? Date.now() + 20 * 60_000 };
    return json.access_token;
  }

  private async request<T>(method: string, url: string, body?: unknown, retry = true): Promise<T> {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${await this.auth()}`,
        Accept: "application/json",
        "Accept-Language": this.locale,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(45_000),
    });
    if (res.status === 401 && retry) {
      this.token = null;
      return this.request(method, url, body, false);
    }
    if (!res.ok) throw new Error(`vinX ${method} ${url.replace(this.root, "")}: HTTP ${res.status} ${await problem(res)}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  /** OData paging over a GET collection. */
  private async *collection(path: string, filter?: string): AsyncIterable<Raw> {
    // vinX OData endpoints return the array (minimal metadata) — tolerate the { value: [] } envelope too.
    const top = this.cfg.pageSize;
    for (let skip = 0; skip < 1_000_000; skip += top) {
      const u = new URL(this.shop(path));
      u.searchParams.set("$top", String(top));
      u.searchParams.set("$skip", String(skip));
      if (filter) u.searchParams.set("$filter", filter);
      const json = await this.request<Raw[] | { value?: Raw[] }>("GET", u.toString());
      const rows = Array.isArray(json) ? json : (json?.value ?? []);
      yield* rows;
      if (rows.length < top) return;
    }
  }

  async ping() {
    await this.auth();
    const u = new URL(this.shop("BaseData/DeliveryCondition"));
    u.searchParams.set("$top", "1");
    await this.request("GET", u.toString());
    return `Connected to ${this.root} (${this.cfg.apiVersion})`;
  }

  private async all(path: string) {
    const out: Raw[] = [];
    for await (const r of this.collection(path)) out.push(r);
    return out;
  }

  /** Lookup tables referenced by Article (ids → records), loaded once per sync run. */
  private async lookups() {
    const [producers, regions, countries, categories, fillings, units, compositions, grapes] = await Promise.all(
      ["BaseData/Producer", "BaseData/Region", "BaseData/Country", "BaseData/ArticleCategory", "BaseData/Filling", "BaseData/TradingUnit", "BaseData/WineComposition", "BaseData/Grape"].map((p) => this.all(p).catch(() => [] as Raw[])),
    );
    const byId = (rows: Raw[]) => new Map(rows.map((r) => [Number(r.id), r]));
    const grapeName = byId(grapes);
    const wineGrapes = new Map<number, string[]>();
    for (const c of [...compositions].sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))) {
      const g = grapeName.get(Number(c.grapeId))?.designation;
      if (g) wineGrapes.set(Number(c.wineId), [...(wineGrapes.get(Number(c.wineId)) ?? []), String(g)]);
    }
    return { producers: byId(producers), regions: byId(regions), countries: byId(countries), categories: byId(categories), fillings: byId(fillings), units: byId(units), wineGrapes };
  }

  /** Articles enriched with their referenced master data so the generic mapper can use nested paths. */
  async *articles(since?: Date | null) {
    const L = await this.lookups();
    const top = (id: unknown): Raw | undefined => {
      let r = L.regions.get(Number(id));
      for (let i = 0; r && r.parentId != null && i < 6; i++) r = L.regions.get(Number(r.parentId)) ?? r;
      return r;
    };
    for await (const a of this.collection("BaseData/Article", since ? `${this.cfg.modifiedField} gt ${since.toISOString()}` : undefined)) {
      yield {
        ...a,
        producer: L.producers.get(Number(a.producerId)),
        region: L.regions.get(Number(a.regionId)),
        regionTop: top(a.regionId),
        country: L.countries.get(Number(a.countryId)),
        category: L.categories.get(Number(a.articleCategoryId)),
        filling: L.fillings.get(Number(a.fillingUnitId)),
        tradingUnit: L.units.get(Number(a.tradingUnitId)),
        grapes: a.wineId != null ? (L.wineGrapes.get(Number(a.wineId)) ?? []).join(", ") || undefined : undefined,
      };
    }
  }

  stock() {
    return this.collection("Calculated/StockData");
  }

  /** BaseData/Receipt with a shop order reference, incrementally by changedOn (positions not needed). */
  receipts(since?: Date | null) {
    return this.collection("BaseData/Receipt", [`shopId ne null`, since ? `changedOn gt ${since.toISOString()}` : ""].filter(Boolean).join(" and "));
  }

  /** BaseData/Address (customers), incrementally by changedOn, with the country resolved to its ISO code. */
  async *addresses(since?: Date | null) {
    const countries = new Map((await this.all("BaseData/Country")).map((c) => [Number(c.id), c]));
    for await (const a of this.collection("BaseData/Address", since ? `changedOn gt ${since.toISOString()}` : undefined)) {
      yield { ...a, country: countries.get(Number(a.countryId)) };
    }
  }

  /** BaseData/SellingPrices: per price group, from-quantity tiers, optional promotion price with validity. */
  prices() {
    return this.collection("BaseData/SellingPrices");
  }

  async priceGroups() {
    return (await this.all("BaseData/PriceGroup")).map((g) => ({ id: String(g.id), name: String(g.designation ?? g.id), pricesWithVat: !!g.pricesWithVat }));
  }

  specialPrices() {
    return this.collection("BaseData/SpecialPrices");
  }

  async productInfo(req: { customerId?: number | null; priceGroupId?: number | null; articles: { erpId: string; qty: number }[] }) {
    const rows = await this.request<Raw[]>("POST", this.shop("Calculated/ProductInfo"), {
      validDate: new Date().toISOString(),
      ...(req.customerId ? { customerId: req.customerId } : { priceGroupId: req.priceGroupId ?? undefined }),
      articleParameters: req.articles.map((a) => ({ articleId: Number(a.erpId), quantity: a.qty })),
    });
    const out = new Map<string, ProductInfo>();
    for (const r of Array.isArray(rows) ? rows : []) {
      const qty = Math.max(1, Number(r.quantity ?? 1));
      const list = cents(r.price);
      const promo = r.pricePromotion != null ? cents(r.pricePromotion) : null;
      const discounts = ((r.discounts as Raw[]) ?? []).map((d) => ({ text: String(d.discountText ?? ""), amount: cents(d.discount), articleDiscountGroupId: d.articleDiscountGroupId != null ? Number(d.articleDiscountGroupId) : null }));
      // discount amounts are for the queried quantity → per unit
      const perUnit = discounts.reduce((a, d) => a + d.amount, 0) / qty;
      out.set(String(r.articleId), { listNet: list, promoNet: promo, promoText: (r.promotionText as string) || null, discounts, unitNet: Math.max(0, Math.round((promo ?? list) - perUnit)) });
    }
    return out;
  }

  private basketBody(b: BasketRequest) {
    const positions: Raw[] = b.positions.map((p, i) => ({
      posType: "orderPos",
      posNumber: String(i + 1),
      articleId: Number(p.erpId),
      orderedQuantity: p.qty,
      ...(p.fromShop && p.unitNet != null ? { unitPrice: p.unitNet / 100, priceCalculationRule: "fromShop" } : {}),
    }));
    if (b.voucher && this.cfg.promoArticleId) {
      positions.push({ posType: "orderPos", posNumber: String(positions.length + 1), articleId: this.cfg.promoArticleId, orderedQuantity: 1, unitPrice: -b.voucher.amountNet / 100, priceCalculationRule: "fromShop" });
    }
    const customerId = b.customerErpId ? Number(b.customerErpId) : undefined;
    const o = b.online;
    const delivery = this.cfg.deliveryConditionMap[b.shippingCode] ?? this.cfg.defaultDeliveryConditionId;
    const payment = (b.paymentMethod && this.cfg.paymentConditionMap[b.paymentMethod]) ?? this.cfg.defaultPaymentConditionId;
    const notes = o ? [o.order.kind === "request" ? "OFFERTANFRAGE / RICHIESTA D'OFFERTA" : "", o.order.poNumber && `Ref: ${o.order.poNumber}`, o.order.notes].filter(Boolean).join("\n") : undefined;
    return {
      action: b.action,
      ...(customerId ? { orderingAddressId: customerId, conditionAddressId: customerId } : {}),
      ...(!customerId && o ? { orderingOnlineAddress: onlineAddress(o.billing, o.order.email, "new", o.order.locale) } : {}),
      ...(o?.shipping && o.shipping !== o.billing ? { deliveryOnlineAddress: onlineAddress(o.shipping, o.order.email, "new", o.order.locale) } : {}),
      ...(delivery != null ? { deliveryConditionId: delivery } : {}),
      ...(payment != null ? { paymentConditionId: payment } : {}),
      validDate: new Date().toISOString(),
      ...(b.deliveryDate ? { deliveryDateRequested: new Date(b.deliveryDate).toISOString() } : {}),
      ...(o ? { shopId: o.order.number, orderNumber: o.order.number, orderText: notes || undefined } : {}),
      positions,
    };
  }

  async calculateBasket(b: BasketRequest): Promise<BasketResult> {
    const r = await this.request<Raw>("POST", this.shop("Online/Basket"), this.basketBody({ ...b, action: "calculate" }));
    return mapBasket(r);
  }

  async pushOrder(p: OrderPayload) {
    const r = await this.request<Raw>("POST", this.shop("Online/Basket"), this.basketBody({
      action: "order",
      paymentMethod: p.order.paymentMethod,
      customerErpId: p.order.customerErpId,
      shippingCode: p.order.shippingMethod,
      deliveryDate: p.order.deliveryDate,
      positions: p.items.map((i) => ({ sku: i.sku, erpId: i.erpId ?? null, qty: i.qty })),
      online: p,
    }));
    return String(r?.Id ?? r?.id ?? "");
  }

  async pushCustomer(c: CustomerPayload) {
    const r = await this.request<Raw>("POST", this.shop("Online/OnlineAddress"), {
      ...onlineAddress({ ...(c.billing ?? {}), company: c.company ?? undefined, name: c.name, phone: c.phone ?? undefined }, c.email, c.erpId ? "change" : "new", c.locale),
      ...(c.erpId ? { addressId: Number(c.erpId) } : {}),
    });
    return String(r?.addressId ?? r?.id ?? "");
  }
}

/** OnlineAddress per spec (no company field → company goes to additionalAddressLine1). */
function onlineAddress(a: Record<string, string | undefined>, email: string, changeType: "new" | "change" | "nop", locale = "de") {
  const [firstName, ...rest] = (a.name ?? "").split(" ");
  return {
    changeType,
    firstName: rest.length ? firstName : undefined,
    lastName: rest.length ? rest.join(" ") : a.name,
    additionalAddressLine1: a.company || undefined,
    street: a.street,
    zipcode: a.zip,
    city: a.city,
    country: a.country,
    phoneBusiness: a.phone || undefined,
    email,
    language: locale.toUpperCase(),
    loginName: email,
    onlineActive: true,
  };
}

const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);

function mapBasket(r: Raw): BasketResult {
  const line = (p: Raw, kind: BasketLine["kind"]): BasketLine => ({
    sku: String(p.articleNumber ?? p.articleId ?? ""),
    description: String(p.description ?? ""),
    qty: Number(p.billedQuantity ?? p.orderedQuantity ?? 0),
    unitNet: cents(p.unitPrice),
    unitGross: cents(p.unitPriceWithTax),
    taxRate: Number(p.applicableTaxRate ?? 0),
    lineGross: cents(p.grandTotalAmount),
    kind,
  });
  const positions = (r.positions as Raw[]) ?? [];
  const extras: BasketLine[] = [];
  for (const p of positions) {
    for (const x of (p.packages as Raw[]) ?? []) extras.push(line(x, "package"));
    for (const x of (p.charges as Raw[]) ?? []) extras.push(line(x, "charge"));
    for (const x of (p.discounts as Raw[]) ?? []) extras.push(line(x, "discount"));
  }
  for (const x of (r.packages as Raw[]) ?? []) extras.push(line(x, "package"));
  for (const x of (r.charges as Raw[]) ?? []) extras.push(line(x, "charge"));
  for (const x of (r.discounts as Raw[]) ?? []) extras.push(line(x, "discount"));
  return {
    lines: positions.map((p) => line(p, "item")),
    extras,
    vat: ((r.vatSummations as Raw[]) ?? []).map((v) => ({ rate: Number(v.applicableTaxRate), base: cents(v.taxBaseTotalAmount), tax: cents(v.taxTotalAmount) })),
    totalNet: cents(r.taxBaseTotalAmount),
    totalTax: cents(r.taxTotalAmount),
    totalGross: cents(r.grandTotalAmount),
    rounding: cents(r.roundingAmount),
  };
}

async function problem(res: Response) {
  try {
    const p = (await res.json()) as { title?: string; detail?: string; errorCode?: string };
    return [p.errorCode, p.title, p.detail].filter(Boolean).join(" · ");
  } catch {
    return "";
  }
}

function jwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
