# vinX integration

Implemented against the **official, public vinX API documentation by I-AG**:
<https://i-ag.atlassian.net/wiki> → *Technische Dokumentation* → **Spezifikation VinX-Api (REST3)** (Shop V 1.0 / **V 2.0**).

## How the shop uses vinX (as the I-AG docs recommend for B2B shops)

| Process | vinX REST3 endpoint | Shop implementation |
|---|---|---|
| Authentication | `POST /api/Identity/Realm/RequestToken` `{client_id:"Integrated", scope:"VinX.Shop", username, password}` → Bearer token | Token cached until expiry (JWT `exp`), automatic refresh on 401 |
| Article master (cached in shop) | `GET /api/v2.0/Core/VinX/Shop/BaseData/Article` with OData `$top/$skip`, delta via `$filter=modifiedDate gt <ISO>` | `syncArticles()`: delta by default, full on demand. vinX owns commercial fields; the shop owns texts, images and flags |
| Stock | `GET …/Calculated/StockInfo` | `syncStock()`, matched on the vinX `articleId` |
| Price lists | `POST …/Calculated/ProductInfo {priceGroupId}` | `syncPrices()`: net prices per mapped price group become customer-group tiers |
| Live customer prices | `POST …/Calculated/ProductInfo {customerId, articleParameters}` | `productInfo()` (incl. `pricePromotion`, `promotionType` in V2) |
| **Basket calculation** | `POST …/Online/Basket {action:"calculate"}` | Approved B2B customers with a vinX address: vinX calculates conditions, promotions, deposits (Gebinde), LSVA and freight (V2). Falls back to local calculation on error |
| Order | `POST …/Online/Basket {action:"order"}` | Every order goes through a persistent **outbox** with exponential-backoff retries |
| Quote request | `POST …/Online/Basket {action:"quote"}` (V2) | Used when prices are hidden ("price on request") |
| New customer / address change | `POST …/Online/OnlineAddress {changeType:"new"\|"change"}` | On registration and trade approval; vinX staff map it to the address master |
| Vouchers | Promo article with negative price, `priceCalculationRule:"fromShop"` | Exactly as described in the Basket spec |
| Pick-up vs delivery | `shippingCodeId` (`BaseData/ShippingCode`; 0 = delivery) | Mapping in Admin → vinX |
| Errors | RFC 7807 `application/problem+json` | `errorCode · title · detail` shown in the log and outbox |

The vinX REST adapter is **passive** and server-to-server. The shop pulls on a schedule (`POST /api/cron` with `Authorization: Bearer $CRON_SECRET`, or `npm run jobs`). The optional `POST /api/vinx/webhook` (HMAC-signed) lets a relay push stock or order-status changes.

## Going live

1. **Licence:** vinX REST API option (I-AG). The B2B basket calculation is a separate licence option.
2. **Access:** request a shop user from I-AG. Demo server: `https://vinxapi.i-ag.ch` (access via support@i-ag.ch; reset nightly).
3. **Admin → vinX:** driver **REST3**, base URL, API version V2.0, user. Set the password as the environment variable `VINX_PASSWORD`.
4. **Mapping:** open `<base URL>/swagger` and confirm the article field names; installations can have custom extensions. Adjust the JSON mapping in admin; no code changes are needed.
5. Set `groupMap` (vinX price group ID → shop customer group), `promoArticleId` and `shippingCodeMap`.
6. Run **Test connection**, then a **full article sync**, then stock and prices. After that, set up the cron.
7. Link B2B customers to their vinX address number (Admin → Customers) to enable live basket calculation.

### Still to confirm with the real system

- Exact `BaseData/Article` field names (the public docs show only diagrams; Swagger has the definitions).
- The response field holding the online order ID.
- Any customer-specific extensions in your installation.

## Alternatives

- **CSV exchange:** upload vinX exports in admin, or `POST /api/vinx/import` (multipart: `articles`, `stock`, `prices`; UTF-8 or Windows-1252).
- **Mock:** a demo driver that runs the complete pipeline without an ERP.
- **Other ERPs:** implement `ErpClient` (`app/.server/vinx/client.ts`).
