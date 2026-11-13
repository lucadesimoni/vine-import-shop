#!/usr/bin/env node
// Refreshes tests/fixtures/vinx-shop-v2.json from a vinX installation's OpenAPI spec, then run `npm test`
// to verify the shop's mapping against that exact vinX version.
//   node scripts/vinx-spec.mjs https://vinx.example.ch
import { writeFile } from "node:fs/promises";

const base = (process.argv[2] ?? process.env.VINX_BASE_URL ?? "https://vinxapi.i-ag.ch").replace(/\/$/, "");
const res = await fetch(`${base}/swagger/Shopv20/swagger.json`);
if (!res.ok) throw new Error(`HTTP ${res.status} for ${base}/swagger/Shopv20/swagger.json`);
const d = await res.json();
const S = d.components.schemas;
const keep = ["Article", "Producer", "Region", "Country", "ArticleCategory", "Filling", "TradingUnit", "WineComposition", "Grape", "Wine", "WineRating", "Rating", "Brand", "DocumentInfo", "OrderProposal", "ArticleSelectionCode", "Address", "Receipt", "StockDataHead", "SellingPrice", "SpecialPrice", "PriceGroup", "ProductInfo", "ProductInfoDiscount", "PriceParameter", "ArticleParameter", "Basket", "BasketPosition", "OnlineAddress", "DeliveryCondition", "PaymentCondition", "BasketActionTypeV20", "AddressChangeTypeV20", "PriceCalculationKindV20", "OrderPositionTypeV20", "ArticleCategoryKindV20", "CustomerPriceCalculationModeV20"];
const out = {
  source: `${d.info.title} ${d.info.version} — ${base}/swagger/Shopv20/swagger.json (extract: field names & enums only)`,
  fetched: new Date().toISOString().slice(0, 10),
  paths: Object.keys(d.paths).sort(),
  schemas: Object.fromEntries(keep.filter((k) => S[k]).map((k) => [k, S[k].enum ? { enum: S[k].enum } : { fields: Object.keys(S[k].properties ?? {}).sort() }])),
};
await writeFile(new URL("../tests/fixtures/vinx-shop-v2.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(`✓ ${out.paths.length} paths, ${Object.keys(out.schemas).length} schemas from ${base}`);
