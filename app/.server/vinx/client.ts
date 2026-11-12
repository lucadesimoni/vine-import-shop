/**
 * ERP contract. Modelled on — and verified against — the vinX REST3 "I-AG Standard Shop API v2.0"
 * OpenAPI spec (<vinx-host>/swagger → Shopv20/swagger.json):
 *
 *   BaseData/Article (+ Producer, Region, Country, ArticleCategory, Filling, TradingUnit, WineComposition)  → articles()
 *   Calculated/StockData (quantityAvailableForShop)                                                       → stock()
 *   BaseData/SellingPrices  (price group · fromQuantity · promotionPrice · validity)                      → prices()
 *   BaseData/SpecialPrices  (customer address · article · percent|value · validity · isNetto)            → specialPrices()
 *   BaseData/PriceGroup     (pricesWithVat)                                                              → priceGroups()
 *   Calculated/ProductInfo  (customerId | priceGroupId → price, pricePromotion, discounts[])              → productInfo()
 *   Online/Basket  action = calculate | order  (deliveryConditionId + paymentConditionId required)        → calculateBasket(), pushOrder()
 *   Online/OnlineAddress  changeType = new | change                                                      → pushCustomer()
 *
 * Customer discounts (Kundenrabatt matrix) are not exposed as rules by vinX; they are applied by vinX in
 * ProductInfo/Basket. Implementations return RAW records; the mapper converts them via admin-editable mapping.
 */
export type Raw = Record<string, unknown>;

export interface ErpClient {
  readonly name: string;
  /** which field mapping applies to this driver's raw records */
  readonly mapping: "rest" | "csv";
  ping(): Promise<string>;
  articles(since?: Date | null): AsyncIterable<Raw>;
  stock(): AsyncIterable<Raw>;
  /** Price-group prices (one row per article / group / from-quantity, optional promotion price + validity). */
  prices(): AsyncIterable<Raw>;
  /** Price groups incl. whether their prices include VAT. */
  priceGroups?(): Promise<{ id: string; name: string; pricesWithVat: boolean }[]>;
  /** Customer special prices (vinX SpecialPrices). */
  specialPrices?(): AsyncIterable<Raw>;
  /** Live, customer-specific prices (B2B). Returns map erpArticleId → unit price excl. VAT in cents. */
  productInfo?(req: { customerId?: number | null; priceGroupId?: number | null; articles: { erpId: string; qty: number }[] }): Promise<Map<string, ProductInfo>>;
  /** Authoritative basket calculation (conditions, promotions, deposits, surcharges, freight). */
  calculateBasket?(basket: BasketRequest): Promise<BasketResult>;
  /** Customer addresses changed since (vinX BaseData/Address) — pulled into linked shop customers. */
  addresses?(since?: Date | null): AsyncIterable<Raw>;
  pushOrder(payload: OrderPayload): Promise<string>;
  pushCustomer(payload: CustomerPayload): Promise<string>;
}

export type ProductInfo = {
  /** effective unit price excl. VAT in cents (promotion price if any, minus vinX discounts) */
  unitNet: number;
  listNet: number;
  promoNet: number | null;
  promoText: string | null;
  discounts: { text: string; amount: number; articleDiscountGroupId: number | null }[];
};

export type BasketRequest = {
  action: "calculate" | "order";
  paymentMethod?: string;
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
