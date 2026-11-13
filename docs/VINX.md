# vinX integration

Verified against the **official OpenAPI spec** of the vinX REST adapter:
`<vinx-host>/swagger` → **"I-AG Standard Shop API v2.0"** (`/swagger/Shopv20/swagger.json`, OpenAPI 3.0.4).
It was checked on the I-AG demo server `https://vinxapi.i-ag.ch` on 2026-11-12. The process descriptions come from the public I-AG docs
(<https://i-ag.atlassian.net/wiki> → *Spezifikation VinX-Api (REST3)*, *Rabatte/Vergütungen*, *Preissysteme*, *Spezialkondition*).

> **Contract test.** `tests/vinx-contract.test.ts` checks every endpoint, field and enum value the shop uses against an extract of the spec in
> `tests/fixtures/vinx-shop-v2.json`. To check a customer's installation, run `npm run vinx:spec -- https://vinx.customer.ch`, then
> `npm test`. Any custom difference in that installation then fails the test instead of failing in production.

## Endpoints used

All shop paths live under `/api/v2.0/Core/VinX/Shop/`. Collections support OData `$filter / $top / $skip / $select / $orderby`.

| Process | Endpoint (verified) | Shop implementation |
|---|---|---|
| Auth | `POST /api/Identity/Realm/RequestToken` `{client_id, grant_type:"password", scope:"VinX.Shop", username, password}` → `access_token` | Cached until the JWT `exp`; refreshed on 401. Password comes from the env var `VINX_PASSWORD` |
| Articles | `GET BaseData/Article` (delta: `$filter=changedOn gt <ISO>`) | `syncArticles()`. The client resolves `producerId`, `regionId` (leaf plus top region), `countryId` (ISO), `articleCategoryId`, `fillingUnitId`, `tradingUnitId` and `wineId`. The lookups use `BaseData/Producer · Region · Country · ArticleCategory · Filling · TradingUnit · WineComposition · Grape` |
| Stock | `GET Calculated/StockData` → `quantityAvailableForShop` | `syncStock()` |
| Price lists | `GET BaseData/SellingPrices` (`priceGroupId`, `unitPrice`, `fromQuantity`, `promotionPrice`, validity) and `GET BaseData/PriceGroup` (`pricesWithVat`) | `syncPrices()`. The consumer price group sets the list price (incl. VAT). Trade groups become tier prices (excl. VAT). Promotions become `promotion_price` conditions |
| Special prices | `GET BaseData/SpecialPrices` (`addressId`, `articleId`, `unitPrice`, `calculationMode` percent\|value, `isNetto`, `fromQuantity`, validity) | `syncSpecialPrices()` turns them into `special_price` conditions for the linked customer (`users.erp_id` = vinX address id) |
| Live customer price | `POST Calculated/ProductInfo` `{validDate, customerId \| priceGroupId, articleParameters:[{articleId, quantity}]}` → `price`, `pricePromotion`, `discounts[]` | Price source **vinX**: effective price = (promotion ?? price) − discounts. Covers the customer-discount matrix |
| Basket calculation | `POST Online/Basket {action:"calculate"}` | B2B customers with a vinX address. vinX returns positions, charges (LSVA, deposits), packages, discounts, VAT totals and rounding |
| Order | `POST Online/Basket {action:"order"}` → `Id` | Persistent outbox with retries. The shop order number is sent as `shopId` and `orderNumber`; PO and notes as `orderText` |
| New customer / change | `POST Online/OnlineAddress {changeType:"new"\|"change", addressId}` | On registration, trade approval and every customer edit in the admin. The spec has no company field, so the company goes into `additionalAddressLine1` |
| Customer changes from vinX | `GET BaseData/Address?$filter=changedOn gt …` | Job `customers`: updates linked shop customers (`users.erpId` = address id): name, company, phone, address, price group (via `groupMap`), language. A newer shop change wins; it is already queued for vinX |
| Vouchers | Basket position with negative `unitPrice` and `priceCalculationRule:"fromShop"` | Uses the `promoArticleId` mapping |
| Order status from vinX | `GET BaseData/Receipt?$filter=changedOn gt …` (`shopId`, `receiptStatus`, `invoiceNumber`) | Job `orders:status`: moves shop orders forward only (inProgress → processing, done → shipped, payed/archived → completed and paid) |
| Customer import from vinX | `GET BaseData/Address` | Job `customers:import`: creates shop accounts for vinX addresses with a shop login, each with a 14-day invitation link |
| Login e-mail change | `POST BaseData/Address({id})/ChangeShopUsername {shopUsername}` | After the address update when the customer's e-mail changes (admin or account) |
| Wine details & ratings | `GET BaseData/Wine · WineRating · Rating · Brand` | Stored in `products.erp_details`: character, vinification, terroir, recommendation, drinking temperature, ageing potential, ratings (source and scale from `Rating`), EAN, rarity, brand. Shown on the product page |
| Texts | `Article.description`, `Producer.history / description / website` | Fill **only empty** shop texts. Texts edited in the shop always win |
| Documents | `GET BaseData/DocumentInfo?$filter=addressId eq …` and `GET BaseData/Document({id})` | B2B portal › Downloads: invoices and delivery notes of the signed-in customer. The download route `/account/documents/:id` checks that the document belongs to the customer's address |
| Order proposal | `GET Calculated/OrderProposal?$filter=addressId eq …` | Portal "Häufig bestellt": includes orders taken by phone or e-mail. The local order history is the fallback |
| Online assortment | `GET BaseData/ArticleSelectionCode?$filter=selectionId eq …` | Optional (Admin › vinX › Online-Sortiment): articles outside the selection are set inactive in the shop |
| Reference data | `GET BaseData/DeliveryCondition · PaymentCondition · PriceGroup` | Admin › vinX shows the ids for the mappings |

### Coverage of the Shop API v2.0 (57 paths)

**Used: 32.** The paths above, plus the lookups for the article sync.
**Not used: 25**, each for one of the reasons below. All are read-only (`GET`). The API writes only `Online/Basket`, `Online/OnlineAddress` and `ChangeShopUsername`.

| Path | Why not (yet) | 
|---|---|
| `Online/OnlineAddress({id})` | Reads an online address back. The shop keeps its own copy, and `BaseData/Address` covers the pull |
| `Calculated/ProductInfoCondition` | Explains how a price came about (conditions behind `ProductInfo`). The shop shows the effective price; an extension could add a breakdown |
| `BaseData/Condition` | Bottle condition (Rarities add-in), not discounts. Relevant only for rarity shops → extension |
| `BaseData/Classification`, `ProductCycle`, `Ingredients` | Wine classification, product life cycle and ingredients (food labelling). Can be mapped via `mapping` once a customer uses them |
| `BaseData/SelectionCode`, `ECommerceGroup`, `PlatformAssortment`, `SellingSet` | Alternative ways to model assortments and sets. The shop uses `ArticleSelectionCode`; sets are bundles in the shop |
| `BaseData/ContactPerson`, `Salutation`, `Department`, `SalesRepresentative`, `CustomerCategory`, `CustomerMarketing`, `Marketing`, `Chain`, `DistributionChannel` | CRM and organisation data. Not needed for ordering; a sales-rep contact in the portal would be a small extension |
| `BaseData/DiscountGroupArticleCustomer`, `SpecialCondition` | vinX applies these in `ProductInfo` and `Basket`; the shop does not recalculate them |
| `BaseData/PaymentMeans`, `ReceiptType` | The payment means and receipt types behind `PaymentCondition` and `Receipt` |
| `BaseData/DeliveryDay`, `Tour`, `ShippingPackage`, `Warehouse`, `Reservation` | Logistics. Delivery dates per tour would be the next useful extension for B2B delivery |

Other I-AG APIs (Base, Shop v1, DigitalDrink, Logistics, Delivery, PoS, Portal, Reporting) are not needed for the shop. None of them writes article master data either.

### Confirmed by the spec (and differing from the earlier draft)

- `Online/Basket` only knows **`calculate | order`**. There is no quote action. Quote requests stay in the shop (`requestsToErp: "skip"`, the default), or can be sent as an order flagged in `orderText`.
- The basket requires **`deliveryConditionId`** and **`paymentConditionId`** (`BaseData/DeliveryCondition`, `BaseData/PaymentCondition`). Map them in Admin → vinX: shipping method → delivery condition, payment method → payment condition, plus defaults. There is no `ShippingCode` endpoint.
- Stock comes from `Calculated/StockData`, not `StockInfo`. The delta field is `changedOn`. The article number is `articleNumber`, the web title `designationWeb`, and alcohol `volume`.
- `BaseData/Condition` describes **bottle condition** (Rarities add-in: capsule, label, fill level). It is not a discount endpoint.
- **Customer discounts (Kundenrabatt matrix)** are not exposed as rules. vinX applies them in `ProductInfo` and `Basket`. `BaseData/DiscountGroupArticleCustomer` lists only the group names.

## Two-way sync: who owns which field

| Data | Master | Direction |
|---|---|---|
| Article number, price, stock, vintage, size, active, VAT class, pack size (`vinx.ownedFields`) | vinX | vinX → shop on every sync. Locked in the admin, rejected by bulk actions |
| Texts, images, categories, promo / featured / B2B-only flags | Shop | Shop only |
| Producers | vinX creates them, the shop enriches them | Matched by ERP key (`producers.erpId`), so renaming in the admin is safe. Logo, portrait and website stay in the shop |
| Customers | Both | Shop → vinX on every change (OnlineAddress), vinX → shop by the `customers` job (BaseData/Address) |
| Orders | Shop | Shop → vinX (Online/Basket, outbox with retries) |

The Shop API v2.0 accepts writes only for orders and addresses, so article master data is maintained in vinX by design.

## Pricing: who calculates what

Price finding follows vinX: **special price → promotion price → list or tier price → base price**. Discounts then apply in this order: **customer discount → quantity discount → promotion discount**, followed by **free goods ("12 for 11")**. See `app/lib/conditions.ts`, which is unit-tested.

| Rule type | From vinX | From the platform (the shop acts as the ERP) | From another ERP |
|---|---|---|---|
| List and tier prices per customer group | `SellingPrices` sync | Admin product prices or CSV/API import | Its own sync writes `prices` |
| Promotion prices | `SellingPrices.promotionPrice` → conditions (`source=vinx`) | Admin → Konditionen | Write `conditions` rows with its own `source` |
| Customer special prices | `SpecialPrices` → conditions | Admin → Konditionen | ” |
| Customer, quantity and promotion discounts | Applied **live** by `ProductInfo` and `Basket` | Admin → Konditionen (per customer, group, product, category, producer or discount group) | ” or a live price source |
| Free goods (n for m) | Live in the basket (`SpecialCondition`) | Admin → Konditionen | ” |

**Settings → Price source:**
- **Plattform** (default): the conditions table calculates all customer prices. Rules can be maintained in the admin, synced from vinX, or written by any connector.
- **vinX (live per customer)**: vinX calculates. Local rules only act as the fallback if vinX can't be reached.

Another ERP plugs in through `registerPriceSource()` (`app/.server/price-sources.ts`) and an `ErpClient` driver.

## Going live

1. **Licence:** the vinX REST API option (I-AG). The B2B basket calculation is a separate licence option.
2. **Access:** request a shop user from I-AG. Demo server: `https://vinxapi.i-ag.ch` (access via support@i-ag.ch).
3. **Admin → vinX:**
   - choose the REST3 driver and enter the base URL, user and client ID (`Integrated`);
   - set the env var `VINX_PASSWORD`;
   - map delivery and payment conditions, `groupMap` (vinX price group id → shop customer group) and `promoArticleId`.
4. Run `npm run vinx:spec -- <base URL>` and `npm test` to verify the mapping against that installation.
5. Run **Test connection**, then a **full article sync**, then stock, prices and special prices. Then set up the cron (`POST /api/cron`).
6. Link B2B customers to their vinX address ID (`users.erp_id`, Admin → Customers). This enables special prices, live prices and live basket calculation.

The vinX REST adapter is passive and server-to-server. The shop pulls on a schedule (`POST /api/cron` with `Authorization: Bearer $CRON_SECRET`, or `npm run jobs`). The optional `POST /api/vinx/webhook` (HMAC-signed) lets a relay push changes.
