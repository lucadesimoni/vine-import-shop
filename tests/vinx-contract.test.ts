import { describe, expect, it } from "vitest";
import spec from "./fixtures/vinx-shop-v2.json";
import { parseSettings } from "~/lib/settings";

/**
 * Contract test: every field/endpoint the shop uses must exist in the official vinX
 * "I-AG Standard Shop API v2.0" OpenAPI spec (extract in fixtures/, refresh with scripts/vinx-spec.mjs).
 */
const S = spec.schemas as Record<string, { fields?: string[]; enum?: string[] }>;
const has = (schema: string, field: string) => !!S[schema]?.fields?.includes(field);
const SHOP = "/api/v2.0/Core/VinX/Shop/";
const ENRICHED: Record<string, string> = { eCommerceGroup: "ECommerceGroup", producer: "Producer", region: "Region", regionTop: "Region", country: "Country", category: "ArticleCategory", filling: "Filling", tradingUnit: "TradingUnit" };

describe("vinX Shop API v2.0 contract", () => {
  it("uses only endpoints that exist", () => {
    for (const p of ["BaseData/Article", "BaseData/Producer", "BaseData/Region", "BaseData/Country", "BaseData/ArticleCategory", "BaseData/Filling", "BaseData/TradingUnit", "BaseData/WineComposition", "BaseData/Grape",
      "BaseData/SellingPrices", "BaseData/SpecialPrices", "BaseData/PriceGroup", "BaseData/DeliveryCondition", "Calculated/StockData", "Calculated/ProductInfo", "Online/Basket", "Online/OnlineAddress"]) {
      expect(spec.paths, p).toContain(SHOP + p);
    }
  });

  it("default article mapping resolves to real Article / lookup fields", () => {
    const { article } = parseSettings("vinx", {}).mapping;
    for (const [key, expr] of Object.entries(article)) {
      for (const path of expr.split("|").filter(Boolean)) {
        if (path === "grapes") continue; // computed from WineComposition + Grape
        const [head, sub] = path.split(".");
        if (sub) expect(has(ENRICHED[head], sub), `${key} → ${path}`).toBe(true);
        else expect(has("Article", head), `${key} → ${path}`).toBe(true);
      }
    }
  });

  it("stock / price mappings match StockData and SellingPrices", () => {
    const { stock, price } = parseSettings("vinx", {}).mapping;
    for (const f of Object.values(stock)) expect(has("StockDataHead", f), f).toBe(true);
    for (const f of Object.values(price)) expect(has("SellingPrice", f), f).toBe(true);
    for (const f of ["articleId", "addressId", "unitPrice", "calculationMode", "isNetto", "fromQuantity", "priceValidFrom", "priceValidUntil"]) expect(has("SpecialPrice", f), f).toBe(true);
    expect(has("PriceGroup", "pricesWithVat")).toBe(true);
    expect(S.CustomerPriceCalculationModeV20.enum).toEqual(["percent", "value"]);
  });

  it("ProductInfo request/response and Basket payloads use spec fields & enums", () => {
    for (const f of ["validDate", "customerId", "priceGroupId", "articleParameters"]) expect(has("PriceParameter", f), f).toBe(true);
    for (const f of ["articleId", "quantity"]) expect(has("ArticleParameter", f), f).toBe(true);
    for (const f of ["articleId", "price", "pricePromotion", "promotionText", "discounts", "quantity"]) expect(has("ProductInfo", f), f).toBe(true);
    for (const f of ["discount", "discountText", "articleDiscountGroupId"]) expect(has("ProductInfoDiscount", f), f).toBe(true);
    for (const f of ["action", "orderingAddressId", "conditionAddressId", "orderingOnlineAddress", "deliveryOnlineAddress", "deliveryConditionId", "paymentConditionId", "validDate", "deliveryDateRequested", "shopId", "orderNumber", "orderText", "positions", "vatSummations", "taxBaseTotalAmount", "taxTotalAmount", "grandTotalAmount", "roundingAmount", "Id"]) expect(has("Basket", f), f).toBe(true);
    for (const f of ["posType", "posNumber", "articleId", "orderedQuantity", "unitPrice", "priceCalculationRule", "unitPriceWithTax", "applicableTaxRate", "grandTotalAmount", "articleNumber", "billedQuantity", "packages", "charges", "discounts"]) expect(has("BasketPosition", f), f).toBe(true);
    expect(S.BasketActionTypeV20.enum).toEqual(["calculate", "order"]);
    expect(S.PriceCalculationKindV20.enum).toContain("fromShop");
    expect(S.OrderPositionTypeV20.enum).toContain("orderPos");
  });

  it("OnlineAddress payload uses spec fields", () => {
    for (const f of ["changeType", "addressId", "firstName", "lastName", "additionalAddressLine1", "street", "zipcode", "city", "country", "phoneBusiness", "email", "language", "loginName", "onlineActive"]) expect(has("OnlineAddress", f), f).toBe(true);
    expect(S.AddressChangeTypeV20.enum).toEqual(expect.arrayContaining(["new", "change"]));
  });

  it("articleType values in the default kind map are real ArticleCategoryKindV20 values", () => {
    const { articleTypes } = parseSettings("vinx", {}).mapping;
    for (const k of Object.keys(articleTypes)) expect(S.ArticleCategoryKindV20.enum, k).toContain(k);
  });
});

describe("vinX Shop API v2.0 contract — details, documents, proposals", () => {
  it("uses real endpoints for wine details, documents, order proposals, assortment and username change", () => {
    for (const p of ["BaseData/Wine", "BaseData/WineRating", "BaseData/Rating", "BaseData/Brand", "BaseData/DocumentInfo", "BaseData/Document({id})", "Calculated/OrderProposal",
      "BaseData/ArticleSelectionCode", "BaseData/PaymentCondition", "BaseData/Address({id})/ChangeShopUsername", "BaseData/Receipt", "BaseData/Address"]) {
      expect(spec.paths, p).toContain(SHOP + p);
    }
  });
  it("reads only fields that exist", () => {
    for (const f of ["characteristic", "vinification", "terroir", "consumptionAdvice", "history", "drinkingTemperature", "minimalDrinkingTemperature", "maximalDrinkingTemperature", "storagePeriod", "maximalStoragePeriod"]) expect(has("Wine", f), `Wine.${f}`).toBe(true);
    for (const f of ["wineId", "ratingId", "points", "ratingText", "vintage"]) expect(has("WineRating", f), `WineRating.${f}`).toBe(true);
    for (const f of ["designation", "maximalRating", "unit"]) expect(has("Rating", f), `Rating.${f}`).toBe(true);
    for (const f of ["designation", "website", "history"]) expect(has("Brand", f), `Brand.${f}`).toBe(true);
    for (const f of ["history", "description", "website"]) expect(has("Producer", f), `Producer.${f}`).toBe(true);
    for (const f of ["Id", "receiptId", "addressId", "documentDescription"]) expect(has("DocumentInfo", f), `DocumentInfo.${f}`).toBe(true);
    for (const f of ["articleId", "articleNumber", "addressId", "quantityOrdered", "numberOfOrders"]) expect(has("OrderProposal", f), `OrderProposal.${f}`).toBe(true);
    for (const f of ["articleId", "selectionId"]) expect(has("ArticleSelectionCode", f), `ArticleSelectionCode.${f}`).toBe(true);
    for (const f of ["brandId", "description", "ean1", "isRarity", "wineId"]) expect(has("Article", f), `Article.${f}`).toBe(true);
  });
});

describe("vinX Shop API v2.0 contract — customer data, logistics, rarities", () => {
  it("uses real endpoints", () => {
    for (const p of ["BaseData/Classification", "BaseData/ProductCycle", "BaseData/ECommerceGroup", "BaseData/Ingredients", "BaseData/SellingSet", "BaseData/SalesRepresentative", "BaseData/Tour", "BaseData/DeliveryDay",
      "BaseData/CustomerCategory", "BaseData/Chain", "BaseData/DistributionChannel", "BaseData/Salutation", "BaseData/ContactPerson", "BaseData/Reservation", "BaseData/ReceiptType", "BaseData/ShippingPackage",
      "BaseData/Condition", "Calculated/ProductInfoCondition", "BaseData/PaymentMeans", "BaseData/SpecialCondition", "BaseData/DiscountGroupArticleCustomer", "BaseData/Warehouse", "Online/OnlineAddress({id})",
      "BaseData/SelectionCode", "BaseData/PlatformAssortment", "BaseData/Marketing", "BaseData/CustomerMarketing", "BaseData/Department"]) {
      expect(spec.paths, p).toContain(SHOP + p);
    }
  });
  it("reads only fields that exist", () => {
    const f = (schema: string, fields: string[]) => { for (const x of fields) expect(has(schema, x), `${schema}.${x}`).toBe(true); };
    f("Article", ["productCycleId", "eCommerceGroupId", "substituteArticleId", "substituteArticleText", "weight"]);
    f("Wine", ["classificationId", "acidity", "residualSugar"]);
    f("Ingredient", ["articleId", "contentInfo", "nutritionInfo", "allergenInfo"]);
    f("SellingSet", ["setArticleId", "articleId", "amount", "position"]);
    f("Address", ["salesRepresentativeId", "tourId", "deliveryDayId", "customerCategoryId", "chainId", "distributionChannelId", "selectionCodeId", "salutationId", "paymentConditionId"]);
    f("SalesRepresentative", ["name", "firstName", "reference", "region"]);
    f("Tour", ["tourName", "tourDescription", "tourMonday", "tourTuesday", "tourWednesday", "tourThursday", "tourFriday", "tourSaturday"]);
    f("DeliveryDay", ["tourDescription", "tourMonday", "tourSaturday"]);
    f("ContactPerson", ["addressId", "firstName", "lastName", "email", "telephone", "mobile"]);
    f("Reservation", ["articleId", "addressId", "quantity"]);
    f("Receipt", ["invoiceNumber", "dueDate", "totalNet", "totalVat", "totalPayed", "receiptTypeId", "invoicingDate", "addressId"]);
    f("ShippingPackage", ["receiptId", "shipmentNumber", "shipmentNumberComplete", "notUsed"]);
    f("Condition", ["designation", "quality", "level", "levelInCm", "label", "capsule"]);
    f("StockDataHead", ["conditionId"]);
    f("ArticleParameterCondition", ["conditionId", "articleId", "quantity"]);
    f("OnlineAddress", ["addressId", "id"]);
    f("PlatformAssortment", ["addressId", "selectionCodeId", "fromDate", "toDate"]);
    f("CustomerMarketing", ["addressId", "marketingId", "active"]);
    f("Marketing", ["designation"]);
    f("SelectionCode", ["designation"]);
    f("ContactPerson", ["departmentDesignation", "departmentId"]);
    f("Department", ["designation"]);
  });
});
