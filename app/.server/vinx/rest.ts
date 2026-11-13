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

  private async all(path: string, filter?: string, limit = Infinity) {
    const out: Raw[] = [];
    for await (const r of this.collection(path, filter)) {
      out.push(r);
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Authenticated GET returning the raw response (binary documents). */
  private async raw(method: string, url: string, retry = true): Promise<Response> {
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${await this.auth()}`, "Accept-Language": this.locale }, signal: AbortSignal.timeout(45_000) });
    if (res.status === 401 && retry) {
      this.token = null;
      return this.raw(method, url, false);
    }
    return res;
  }

  /** Lookup tables referenced by Article (ids → records), loaded once per sync run. */
  private async lookups() {
    const [producers, regions, countries, categories, fillings, units, compositions, grapes, wines, wineRatings, ratings, brands, classifications, cycles, ecGroups, ingredients, sets] = await Promise.all(
      ["BaseData/Producer", "BaseData/Region", "BaseData/Country", "BaseData/ArticleCategory", "BaseData/Filling", "BaseData/TradingUnit", "BaseData/WineComposition", "BaseData/Grape", "BaseData/Wine", "BaseData/WineRating", "BaseData/Rating", "BaseData/Brand",
        "BaseData/Classification", "BaseData/ProductCycle", "BaseData/ECommerceGroup", "BaseData/Ingredients", "BaseData/SellingSet"].map((p) => this.all(p).catch(() => [] as Raw[])),
    );
    const byId = (rows: Raw[]) => new Map(rows.map((r) => [Number(r.id), r]));
    const grapeName = byId(grapes);
    const wineGrapes = new Map<number, string[]>();
    for (const c of [...compositions].sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))) {
      const g = grapeName.get(Number(c.grapeId))?.designation;
      if (g) wineGrapes.set(Number(c.wineId), [...(wineGrapes.get(Number(c.wineId)) ?? []), String(g)]);
    }
    // Wine texts + ratings (WineRating → Rating gives the source, e.g. "Gambero Rosso", and the scale)
    const ratingById = byId(ratings);
    const ratingsByWine = new Map<number, Raw[]>();
    for (const r of wineRatings) {
      const src = ratingById.get(Number(r.ratingId));
      ratingsByWine.set(Number(r.wineId), [...(ratingsByWine.get(Number(r.wineId)) ?? []), { ...r, source: src?.designation, max: src?.maximalRating, unit: src?.unit }]);
    }
    // set articles (SellingSet: setArticleId → components) and food labelling (Ingredients by articleId)
    const setItems = new Map<number, Raw[]>();
    for (const s of [...sets].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))) setItems.set(Number(s.setArticleId), [...(setItems.get(Number(s.setArticleId)) ?? []), s]);
    return {
      producers: byId(producers), regions: byId(regions), countries: byId(countries), categories: byId(categories), fillings: byId(fillings), units: byId(units), wineGrapes, wines: byId(wines), ratingsByWine, brands: byId(brands),
      classifications: byId(classifications), cycles: byId(cycles), ecGroups: byId(ecGroups), ingredients: new Map(ingredients.map((i) => [Number(i.articleId), i])), setItems,
    };
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
        wine: a.wineId != null ? (() => { const w = L.wines.get(Number(a.wineId)) ?? {}; return { ...w, ratings: L.ratingsByWine.get(Number(a.wineId)) ?? [], classification: L.classifications.get(Number(w.classificationId)) }; })() : undefined,
        brand: a.brandId != null ? L.brands.get(Number(a.brandId)) : undefined,
        productCycle: a.productCycleId != null ? L.cycles.get(Number(a.productCycleId)) : undefined,
        eCommerceGroup: a.eCommerceGroupId != null ? L.ecGroups.get(Number(a.eCommerceGroupId)) : undefined,
        ingredients: L.ingredients.get(Number(a.id)),
        setItems: L.setItems.get(Number(a.id)),
      };
    }
  }

  stock() {
    return this.collection("Calculated/StockData");
  }

  async documents(addressId: string) {
    const rows = await this.all("BaseData/DocumentInfo", `addressId eq ${Number(addressId)}`).catch(() => [] as Raw[]);
    return rows.map((d) => ({ id: String(d.Id ?? d.id), receiptId: d.receiptId != null ? String(d.receiptId) : null, title: String(d.documentDescription ?? "Dokument") }));
  }

  async document(id: string) {
    const res = await this.raw("GET", this.shop(`BaseData/Document(${Number(id)})`));
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "application/pdf";
    const name = /filename="?([^";]+)/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `dokument-${id}.pdf`;
    return { body: await res.arrayBuffer(), type, name };
  }

  async orderProposal(addressId: string) {
    const rows = await this.all("Calculated/OrderProposal", `addressId eq ${Number(addressId)}`, 200).catch(() => [] as Raw[]);
    return rows
      .map((r) => ({ articleId: String(r.articleId), articleNumber: String(r.articleNumber ?? ""), quantity: Number(r.quantityOrdered ?? 0), orders: Number(r.numberOfOrders ?? 0) }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 24);
  }

  async assortment(selectionId: string) {
    const rows = await this.all("BaseData/ArticleSelectionCode", `selectionId eq ${Number(selectionId)}`);
    return new Set(rows.map((r) => String(r.articleId)));
  }

  async referenceData() {
    const [deliveryConditions, paymentConditions, priceGroups, paymentMeans, discountGroups, specialConditions, receiptTypes, warehouses, distributionChannels, selectionCodes] = await Promise.all(
      ["BaseData/DeliveryCondition", "BaseData/PaymentCondition", "BaseData/PriceGroup", "BaseData/PaymentMeans", "BaseData/DiscountGroupArticleCustomer", "BaseData/SpecialCondition", "BaseData/ReceiptType", "BaseData/Warehouse", "BaseData/DistributionChannel", "BaseData/SelectionCode"].map((p) => this.all(p).catch(() => [] as Raw[])),
    );
    return { deliveryConditions, paymentConditions, priceGroups, paymentMeans, discountGroups, specialConditions, receiptTypes, warehouses, distributionChannels, selectionCodes };
  }

  async openItems(addressId: string) {
    const [rows, types] = await Promise.all([
      this.all("BaseData/Receipt", `addressId eq ${Number(addressId)} and invoiceNumber ne null`, 200).catch(() => [] as Raw[]),
      this.all("BaseData/ReceiptType").catch(() => [] as Raw[]),
    ]);
    const typeName = new Map(types.map((t) => [Number(t.id), String(t.designation ?? "")]));
    return rows
      .map((r) => {
        const total = cents(Number(r.totalNet ?? 0) + Number(r.totalVat ?? 0));
        return { id: String(r.id), number: String(r.invoiceNumber ?? r.receiptNumber ?? r.id), type: typeName.get(Number(r.receiptTypeId)) || "Rechnung", date: (r.invoicingDate as string) ?? (r.receiptDate as string) ?? null, due: (r.dueDate as string) ?? null, totalCents: total, openCents: Math.max(0, total - cents(r.totalPayed ?? 0)) };
      })
      .filter((r) => r.openCents > 0)
      .sort((a, b) => String(a.due).localeCompare(String(b.due)));
  }

  async reservations(addressId: string) {
    const rows = await this.all("BaseData/Reservation", `addressId eq ${Number(addressId)}`, 200).catch(() => [] as Raw[]);
    return rows.filter((r) => Number(r.quantity) > 0).map((r) => ({ articleId: String(r.articleId), quantity: Number(r.quantity) }));
  }

  async shippingPackages(receiptId: string) {
    const rows = await this.all("BaseData/ShippingPackage", `receiptId eq ${Number(receiptId)}`, 50).catch(() => [] as Raw[]);
    return [...new Set(rows.filter((r) => !r.notUsed).map((r) => String(r.shipmentNumberComplete ?? r.shipmentNumber ?? "").trim()).filter(Boolean))];
  }

  async *contactPersons() {
    const departments = new Map((await this.all("BaseData/Department").catch(() => [] as Raw[])).map((d) => [Number(d.id), d]));
    for await (const c of this.collection("BaseData/ContactPerson")) {
      yield { ...c, department: c.departmentDesignation ?? departments.get(Number(c.departmentId))?.designation };
    }
  }

  async onlineAddress(id: string) {
    return this.request<Raw>("GET", this.shop(`Online/OnlineAddress(${Number(id)})`)).catch(() => null);
  }

  async conditions() {
    return this.all("BaseData/Condition").catch(() => [] as Raw[]);
  }

  async changeShopUsername(addressId: string, username: string) {
    await this.request("POST", this.shop(`BaseData/Address(${Number(addressId)})/ChangeShopUsername`), { shopUsername: username });
  }

  /** BaseData/Receipt with a shop order reference, incrementally by changedOn (positions not needed). */
  receipts(since?: Date | null) {
    return this.collection("BaseData/Receipt", [`shopId ne null`, since ? `changedOn gt ${since.toISOString()}` : ""].filter(Boolean).join(" and "));
  }

  /** BaseData/Address (customers), incrementally by changedOn, with the country resolved to its ISO code. */
  async *addresses(since?: Date | null) {
    const [countries, reps, tours, days, categories, chains, channels, salutations, selections, platform, marketing, customerMarketing] = await Promise.all(
      ["BaseData/Country", "BaseData/SalesRepresentative", "BaseData/Tour", "BaseData/DeliveryDay", "BaseData/CustomerCategory", "BaseData/Chain", "BaseData/DistributionChannel", "BaseData/Salutation",
        "BaseData/SelectionCode", "BaseData/PlatformAssortment", "BaseData/Marketing", "BaseData/CustomerMarketing"].map((p) => this.all(p).catch(() => [] as Raw[])),
    );
    const byId = (rows: Raw[]) => new Map(rows.map((r) => [Number(r.id ?? r.Id), r]));
    const [C, R, T, D, K, H, V, S, SEL, MK] = [countries, reps, tours, days, categories, chains, channels, salutations, selections, marketing].map(byId);
    // assortments assigned per address for a period (PlatformAssortment) and the address's marketing codes (CustomerMarketing → Marketing)
    const today = Date.now();
    const platformByAddress = new Map<number, number[]>();
    for (const pa of platform) {
      const from = pa.fromDate ? Date.parse(String(pa.fromDate)) : -Infinity, to = pa.toDate ? Date.parse(String(pa.toDate)) : Infinity;
      if (pa.addressId != null && pa.selectionCodeId != null && from <= today && today <= to) platformByAddress.set(Number(pa.addressId), [...(platformByAddress.get(Number(pa.addressId)) ?? []), Number(pa.selectionCodeId)]);
    }
    const marketingByAddress = new Map<number, string[]>();
    for (const cm of customerMarketing) {
      const m = MK.get(Number(cm.marketingId));
      if (cm.active === false || !m?.designation) continue;
      marketingByAddress.set(Number(cm.addressId), [...(marketingByAddress.get(Number(cm.addressId)) ?? []), String(m.designation)]);
    }
    for await (const a of this.collection("BaseData/Address", since ? `changedOn gt ${since.toISOString()}` : undefined)) {
      yield {
        ...a,
        country: C.get(Number(a.countryId)),
        salesRepresentative: R.get(Number(a.salesRepresentativeId)),
        tour: T.get(Number(a.tourId)),
        deliveryDay: D.get(Number(a.deliveryDayId)),
        customerCategory: K.get(Number(a.customerCategoryId)),
        chain: H.get(Number(a.chainId)),
        distributionChannel: V.get(Number(a.distributionChannelId)),
        salutation: S.get(Number(a.salutationId)),
        selectionCode: SEL.get(Number(a.selectionCodeId)),
        platformSelectionIds: platformByAddress.get(Number(a.id)),
        marketing: marketingByAddress.get(Number(a.id)),
      };
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

  async productInfo(req: { customerId?: number | null; priceGroupId?: number | null; articles: { erpId: string; qty: number; conditionId?: number | null }[] }) {
    const who = req.customerId ? { customerId: req.customerId } : { priceGroupId: req.priceGroupId ?? undefined };
    const plain = req.articles.filter((a) => a.conditionId == null);
    const rare = req.articles.filter((a) => a.conditionId != null);
    // rarities: price per bottle condition (Calculated/ProductInfoCondition)
    const [a, b] = await Promise.all([
      plain.length ? this.request<Raw[]>("POST", this.shop("Calculated/ProductInfo"), { validDate: new Date().toISOString(), ...who, articleParameters: plain.map((x) => ({ articleId: Number(x.erpId), quantity: x.qty })) }) : [],
      rare.length ? this.request<Raw[]>("POST", this.shop("Calculated/ProductInfoCondition"), { validDate: new Date().toISOString(), ...who, articleParameters: rare.map((x) => ({ articleId: Number(x.erpId), quantity: x.qty, conditionId: x.conditionId })) }) : [],
    ]);
    const rows = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])];
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
    const payment = b.online?.order.paymentConditionId ?? (b.paymentMethod && this.cfg.paymentConditionMap[b.paymentMethod]) ?? this.cfg.defaultPaymentConditionId;
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
    if (r?.addressId != null) return String(r.addressId);
    // vinX may only acknowledge the online address; read it back to get the address id once it is processed
    if (r?.id != null) {
      const back = await this.onlineAddress(String(r.id));
      if (back?.addressId != null) return String(back.addressId);
    }
    return c.erpId ?? "";
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
