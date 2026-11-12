import type { Settings } from "~/lib/settings";
import type { BasketLine, BasketRequest, BasketResult, CustomerPayload, ErpClient, OrderPayload, ProductInfo, Raw } from "./client";

type Cfg = Settings["vinx"];

/**
 * vinX REST3 client (Shop API V1.0/V2.0) — implemented from the public I-AG spec:
 *  - Auth: POST /api/Identity/Realm/RequestToken {client_id:"Integrated", scope:"VinX.Shop", username, password} → Bearer token
 *  - Paths: /api/{v}/Core/VinX/Shop/{BaseData|Calculated|Online}/…
 *  - OData: $filter, $top, $skip, $select; deltas via `modifiedDate gt <ISO>`
 *  - Errors: RFC 7807 application/problem+json (title/detail/errorCode)
 * Password/secret: env VINX_PASSWORD. Server-to-server only (vinX REST adapter must sit behind TLS / IP allow-list).
 */
export class Rest3Client implements ErpClient {
  readonly name = "vinX REST3";
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
      body: JSON.stringify({ client_id: "Integrated", scope: "VinX.Shop", username: this.cfg.username, password: process.env.VINX_PASSWORD ?? "" }),
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
    const u = new URL(this.shop("BaseData/ShippingCode"));
    u.searchParams.set("$top", "1");
    await this.request("GET", u.toString());
    return `Connected to ${this.root} (${this.cfg.apiVersion})`;
  }

  articles(since?: Date | null) {
    return this.collection("BaseData/Article", since ? `${this.cfg.modifiedField} gt ${since.toISOString()}` : undefined);
  }

  stock() {
    return this.collection("Calculated/StockInfo");
  }

  /** Price-group prices: one ProductInfo batch per mapped price group. */
  async *prices(): AsyncIterable<Raw> {
    for (const groupId of Object.keys(this.cfg.groupMap).map(Number).filter(Number.isFinite)) {
      const rows = await this.request<Raw[]>("POST", this.shop("Calculated/ProductInfo"), { priceGroupId: groupId });
      for (const r of rows ?? []) yield { ...r, priceGroupId: groupId };
    }
  }

  async productInfo(req: { customerId?: number | null; priceGroupId?: number | null; articles: { erpId: string; qty: number }[] }) {
    const rows = await this.request<Raw[]>("POST", this.shop("Calculated/ProductInfo"), {
      customerId: req.customerId ?? undefined,
      priceGroupId: req.customerId ? undefined : (req.priceGroupId ?? undefined),
      articleParameters: req.articles.map((a) => ({ articleId: Number(a.erpId), quantity: a.qty })),
    });
    const out = new Map<string, ProductInfo>();
    for (const r of rows ?? []) {
      out.set(String(r.articleId), {
        unitNet: cents(r.price),
        promoNet: r.pricePromotion != null ? cents(r.pricePromotion) : null,
        promoText: (r.promotionText as string) || null,
      });
    }
    return out;
  }

  private basketBody(b: BasketRequest) {
    const positions: Raw[] = b.positions.map((p, i) => ({
      posNumber: String(i + 1),
      articleId: Number(p.erpId),
      orderedQuantity: p.qty,
      ...(p.fromShop && p.unitNet != null ? { unitPrice: p.unitNet / 100, priceCalculationRule: "fromShop" } : {}),
    }));
    if (b.voucher && this.cfg.promoArticleId) {
      positions.push({ posNumber: String(positions.length + 1), articleId: this.cfg.promoArticleId, orderedQuantity: 1, unitPrice: -b.voucher.amountNet / 100, priceCalculationRule: "fromShop" });
    }
    const customerId = b.customerErpId ? Number(b.customerErpId) : undefined;
    const o = b.online;
    return {
      action: b.action,
      ...(customerId ? { orderingAddressId: customerId, conditionAddressId: customerId } : {}),
      ...(!customerId && o ? { orderingOnlineAddress: onlineAddress(o.billing, o.order.email, "new") } : {}),
      ...(o?.shipping && o.shipping !== o.billing ? { deliveryOnlineAddress: onlineAddress(o.shipping, o.order.email, "new") } : {}),
      ...(this.cfg.apiVersion === "v2.0" ? { shippingCodeId: this.cfg.shippingCodeMap[b.shippingCode] ?? 0 } : {}),
      ...(b.deliveryDate ? { deliveryDateRequested: new Date(b.deliveryDate).toISOString() } : {}),
      ...(o ? { externalOrderNumber: o.order.number, remarks: [o.order.poNumber && `Ref: ${o.order.poNumber}`, o.order.notes].filter(Boolean).join("\n") } : {}),
      positions,
    };
  }

  async calculateBasket(b: BasketRequest): Promise<BasketResult> {
    const r = await this.request<Raw>("POST", this.shop("Online/Basket"), this.basketBody({ ...b, action: "calculate" }));
    return mapBasket(r);
  }

  async pushOrder(p: OrderPayload) {
    const r = await this.request<Raw>("POST", this.shop("Online/Basket"), this.basketBody({
      action: p.order.kind === "request" ? (this.cfg.apiVersion === "v2.0" ? "quote" : "order") : "order",
      customerErpId: p.order.customerErpId,
      shippingCode: p.order.shippingMethod,
      deliveryDate: p.order.deliveryDate,
      positions: p.items.map((i) => ({ sku: i.sku, erpId: i.erpId ?? null, qty: i.qty })),
      online: p,
    }));
    return String(r?.onlineOrderId ?? r?.id ?? r?.orderId ?? "");
  }

  async pushCustomer(c: CustomerPayload) {
    const r = await this.request<Raw>("POST", this.shop("Online/OnlineAddress"), {
      ...(c.erpId ? { addressId: Number(c.erpId) } : {}),
      ...onlineAddress({ ...(c.billing ?? {}), company: c.company ?? undefined, name: c.name, phone: c.phone ?? undefined }, c.email, c.erpId ? "change" : "new"),
      language: c.locale.toUpperCase(),
      vatNumber: c.uidNumber ?? undefined,
    });
    return String(r?.addressId ?? r?.id ?? "");
  }
}

function onlineAddress(a: Record<string, string | undefined>, email: string, changeType: "new" | "change" | "nop") {
  const [firstName, ...rest] = (a.name ?? "").split(" ");
  return {
    changeType,
    company: a.company || undefined,
    firstName: rest.length ? firstName : undefined,
    lastName: rest.length ? rest.join(" ") : a.name,
    street: a.street,
    zipcode: a.zip,
    city: a.city,
    countryCode: a.country,
    phone: a.phone || undefined,
    email,
    loginName: email,
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
