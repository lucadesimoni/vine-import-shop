/**
 * ERP contract, modelled on the official vinX REST3 "Shop V2.0" API
 * (https://i-ag.atlassian.net/wiki → Technische Dokumentation → Spezifikation VinX-Api (REST3)).
 *
 *   BaseData   (read, cached in shop, delta via OData modifiedDate) → articles()
 *   Calculated/StockInfo                                            → stock()
 *   Calculated/ProductInfo (per price group / per customer, live)   → prices(), productInfo()
 *   Online/Basket  action=calculate | order | quote                  → calculateBasket(), pushOrder()
 *   Online/OnlineAddress  changeType=new | change                    → pushCustomer()
 *
 * Implementations return RAW records; the mapper converts article fields via admin-editable mapping.
 */
export type Raw = Record<string, unknown>;

export interface ErpClient {
  readonly name: string;
  ping(): Promise<string>;
  articles(since?: Date | null): AsyncIterable<Raw>;
  stock(): AsyncIterable<Raw>;
  /** Price-group prices (one row per article / group / min quantity). */
  prices(): AsyncIterable<Raw>;
  /** Live, customer-specific prices (B2B). Returns map erpArticleId → unit price excl. VAT in cents. */
  productInfo?(req: { customerId?: number | null; priceGroupId?: number | null; articles: { erpId: string; qty: number }[] }): Promise<Map<string, ProductInfo>>;
  /** Authoritative basket calculation (conditions, promotions, deposits, surcharges, freight). */
  calculateBasket?(basket: BasketRequest): Promise<BasketResult>;
  pushOrder(payload: OrderPayload): Promise<string>;
  pushCustomer(payload: CustomerPayload): Promise<string>;
}

export type ProductInfo = { unitNet: number; promoNet: number | null; promoText: string | null };

export type BasketRequest = {
  action: "calculate" | "order" | "quote";
  customerErpId: string | null;
  shippingCode: string;
  deliveryDate?: string | null;
  positions: { sku: string; erpId: string | null; qty: number; unitNet?: number; fromShop?: boolean }[];
  voucher?: { code: string; amountNet: number } | null;
  online?: OrderPayload | null;
};

export type BasketLine = { sku: string; description: string; qty: number; unitNet: number; unitGross: number; taxRate: number; lineGross: number; kind: "item" | "package" | "charge" | "discount" };
export type BasketResult = { lines: BasketLine[]; extras: BasketLine[]; vat: { rate: number; base: number; tax: number }[]; totalNet: number; totalTax: number; totalGross: number; rounding: number; erpRef?: string };

export type OrderPayload = {
  order: {
    number: string; createdAt: string; kind: "order" | "request"; email: string; customerErpId: string | null; priceList: string | null;
    paymentMethod: string; shippingMethod: string; poNumber: string | null; deliveryDate: string | null; notes: string | null;
    currency: string; subtotalNet: number; shippingGross: number; discountGross: number; taxTotal: number; totalGross: number; locale: string; couponCode?: string | null;
  };
  billing: Record<string, string | undefined>;
  shipping: Record<string, string | undefined>;
  items: { sku: string; erpId?: string | null; name: string; qty: number; unitNet: number; unitGross: number; taxRate: number }[];
};

export type CustomerPayload = {
  id: number; erpId: string | null; email: string; name: string; company: string | null; uidNumber: string | null; phone: string | null;
  priceList: string | null; locale: string; billing: Record<string, string | undefined> | null;
};
