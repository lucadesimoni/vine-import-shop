# vinX ERP integration

vinX (wine-trade ERP, Switzerland) is the **master** for articles, stock, prices and customer numbers. The shop is the master for rich content: texts in four languages, tasting notes, images and SEO. Orders and new customers flow from the shop to vinX.

```
          ┌──────────── pull (cron / web-cron / webhook) ────────────┐
 vinX ───►│ articles (delta|full) · stock · price lists               │──► shop DB
          └──────────────────────────────────────────────────────────┘
 vinX ◄── outbox (orders, customers) ◄── events: order.placed, customer.registered, b2b.approved
          retries with exponential backoff, status per order (pending → transferred | failed)
```

## 1. Choose a driver (`VINX_DRIVER`)

| Driver | When | Setup |
|---|---|---|
| `rest` | vinX web interface / API is licensed and reachable over HTTPS | `VINX_BASE_URL`, `VINX_AUTH` (`bearer`, `basic`, `header:X-Api-Key`), `VINX_TOKEN` or `VINX_USER`/`VINX_PASS`, optional `VINX_MANDANT` |
| `file` | Classic import/export: vinX writes CSV, reads XML/CSV (via SFTP, a shared folder or a sync tool) | `vinx.file.inbox` / `outbox` paths, delimiter, encoding (Windows-1252 is typical) |
| `mock` | Demo, development, testing before the real interface exists | nothing |
| *custom class* | Any other ERP (Abacus, bexio, SAP B1 …) | implement `App\Modules\Vinx\ErpClient` and set `vinx.driver` to the class name |

> **Before go-live, check with your vinX partner:** the exact endpoint paths, auth scheme, pagination and field names depend on your vinX version and licensed modules. Everything you need to change is **configuration** in `config['vinx']['rest']` and `config['vinx']['mapping']`; the code stays as it is.

## 2. Field mapping

`config['vinx']['mapping']['article']` maps vinX field names to shop fields. Dot notation works for nested JSON (`"Preise.Verkauf"`). The values parse Swiss number formats (`1'234.50`, `1234,50`). Volume in cl is converted to ml. Colour and VAT codes are translated through `color_map` and `tax_map`.

`owned_fields` lists the fields that vinX overwrites. Everything else (descriptions, images, featured flag) is never touched by the sync.

Price lists: each row is (SKU, price list code, minimum quantity, net price). `group_map` connects vinX price-list codes to shop customer groups (`PRIV → retail`, `HAND → b2b`, `GASTRO → gastro`). Each sync replaces all tiers for a product and group pair.

## 3. Scheduling

```bash
# every 10 minutes: push queued orders, then stock, prices, article delta
*/10 * * * * php /path/to/shop/bin/console vinx:sync
# nightly full article import
15 3 * * *   php /path/to/shop/bin/console vinx:sync articles:full
```

If your host has no CLI cron, set `CRON_KEY` and call `https://shop.ch/cron.php?key=…` from the host's control panel or from cron-job.org.

Orders are also pushed **right after checkout**, once the response has been sent (`fastcgi_finish_request`), so the customer never waits on the ERP.

## 4. Webhook (optional, real-time)

`POST /api/vinx/webhook`, header `X-Vinx-Signature: hex(hmac_sha256(body, VINX_WEBHOOK_SECRET))`

```json
{ "event": "stock.updated", "items": [{ "sku": "W-1001", "stock": 42 }] }
{ "event": "article.updated" }
{ "event": "order.status", "number": "WS-2026-000123", "status": "shipped", "paid": true }
```

If vinX cannot sign requests, put a small relay (for example a Cloudflare Worker) in front of it, or rely on the cron sync.

## 5. Order payload (shop → vinX)

```json
{
  "order":   { "number": "WS-2026-000123", "created_at": "…", "customer_erp_id": "K-10023", "price_list": "GASTRO",
               "payment_method": "invoice", "shipping_method": "delivery", "po_number": "PO-4711", "delivery_date": "2026-11-20",
               "subtotal_net": 134796, "total_gross": 145730, "tax_total": 10934, "is_b2b": 1, "locale": "de" },
  "billing":  { "company": "…", "name": "…", "street": "…", "zip": "8001", "city": "Zürich", "country": "CH" },
  "shipping": { … },
  "items":    [{ "sku": "W-1001", "name": "Chianti Classico Riserva DOCG 2020", "qty": 36, "unit_net": 2361, "unit_gross": 2552, "tax_rate": 8.1 }]
}
```

Amounts are in Rappen (integers). The `file` driver writes the same data as `order-<number>.xml` (or `.csv` / `.json`).

## 6. Monitoring

Admin → **vinX ERP** shows the last successful run per job, the outbox (pending / failed with the error text and a retry button) and a job log. The dashboard flags failed transfers.
