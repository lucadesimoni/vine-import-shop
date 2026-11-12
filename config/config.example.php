<?php
/*
 * Copy to config/config.php (or set environment variables / a .env file).
 * Every value can be overridden by env() so the same code runs on shared
 * hosting (edit this file) and in containers (set env vars).
 */

use App\Modules;
use App\Shop\Payment;

return [
    'app' => [
        'name' => env('APP_NAME', 'De Simoni'),
        'tagline' => env('APP_TAGLINE', 'Weine & Spezialitäten aus Italien'),
        'url' => env('APP_URL', ''),              // e.g. https://shop.example.ch (auto-detected if empty)
        'debug' => env('APP_DEBUG', false),
        'timezone' => 'Europe/Zurich',
        'locales' => ['de', 'fr', 'it', 'en'],
        'default_locale' => env('APP_LOCALE', 'de'),
        'currency' => 'CHF',
        'secure_cookies' => env('SECURE_COOKIES', null), // null = auto (HTTPS)
        'cron_key' => env('CRON_KEY', ''),        // enables /cron.php?key=... for web-cron on shared hosting
    ],

    'shop' => [
        'order_prefix' => env('ORDER_PREFIX', 'WS'),
        'email' => env('SHOP_EMAIL', 'info@example.ch'),
        'phone' => '+41 00 000 00 00',
        'address' => ['street' => 'Musterstrasse 1', 'zip' => '8000', 'city' => 'Zürich', 'country' => 'Schweiz'],
        'uid' => 'CHE-000.000.000 MWST',
        'age_gate' => true,            // legal: no alcohol to under-16 (wine/beer) / under-18 (spirits) in CH
        'min_age' => 18,
        'social' => ['instagram' => '', 'facebook' => '', 'linkedin' => ''],
    ],

    // Enable/disable features by adding/removing modules. Order matters for routes.
    'modules' => [
        Modules\Content\ContentModule::class,
        Modules\Catalog\CatalogModule::class,
        Modules\Cart\CartModule::class,
        Modules\Checkout\CheckoutModule::class,
        Modules\Account\AccountModule::class,
        Modules\B2B\B2BModule::class,
        Modules\Vinx\VinxModule::class,
        Modules\Api\ApiModule::class,
        Modules\Admin\AdminModule::class,
    ],

    'db' => [
        'driver' => env('DB_DRIVER', 'sqlite'),   // sqlite | mysql | pgsql
        'path' => env('DB_PATH', BASE_PATH . '/storage/database.sqlite'),
        'host' => env('DB_HOST', 'localhost'),
        'port' => env('DB_PORT', null),
        'name' => env('DB_NAME', 'shop'),
        'user' => env('DB_USER', 'root'),
        'pass' => env('DB_PASS', ''),
    ],

    'install' => [
        'auto' => env('AUTO_INSTALL', true),        // create schema on first request
        'demo_data' => env('DEMO_DATA', true),      // seed fictional demo catalog
        'admin_email' => env('ADMIN_EMAIL', 'admin@example.com'),
        'admin_password' => env('ADMIN_PASSWORD', ''), // empty → random, written to storage/ADMIN_PASSWORD.txt
    ],

    // Swiss VAT rates in percent.
    'tax' => ['standard' => 8.1, 'reduced' => 2.6],

    // Amounts in Rappen (cents). rates: [min units, price]
    'shipping' => [
        'methods' => [
            'post' => [
                'label' => 'shipping.post',
                'description' => 'shipping.post_desc',
                'rates' => [[1, 1200], [4, 1500], [7, 1800], [13, 2600], [25, 3900]],
                'free_from_gross' => 25000,
                'b2b_free_from_net' => 50000,
            ],
            'pickup' => [
                'label' => 'shipping.pickup',
                'description' => 'shipping.pickup_desc',
                'price' => 0,
            ],
            'delivery' => [
                'label' => 'shipping.delivery',
                'description' => 'shipping.delivery_desc',
                'price' => 4500,
                'b2b_free_from_net' => 40000,
                'b2b_only' => true,
                'min_units' => 12,
            ],
        ],
    ],

    'b2b' => [
        'default_group' => 'b2b',          // group assigned on approval (admin can change to gastro)
        'require_uid' => true,
        'notify_email' => env('B2B_NOTIFY_EMAIL', 'b2b@example.ch'),
    ],

    'payment' => [
        'providers' => [
            Payment\InvoiceProvider::class => ['terms_days' => 30, 'allow_b2c_logged_in' => false],
            Payment\PrepaymentProvider::class => [
                'holder' => 'Muster Weinimport AG',
                'iban' => 'CH00 0000 0000 0000 0000 0',
                'bank' => 'Musterbank',
            ],
            Payment\StripeProvider::class => [
                'enabled' => true,                                  // only shown if secret_key set
                'secret_key' => env('STRIPE_SECRET_KEY', ''),
                'webhook_secret' => env('STRIPE_WEBHOOK_SECRET', ''),
                'payment_method_types' => [],                       // [] = use Stripe dashboard settings (incl. TWINT)
            ],
        ],
    ],

    'mail' => [
        'driver' => env('MAIL_DRIVER', 'log'),  // log | mail | smtp
        'from' => env('MAIL_FROM', 'shop@example.ch'),
        'from_name' => env('MAIL_FROM_NAME', 'Weinshop'),
        'admin' => env('MAIL_ADMIN', 'orders@example.ch'),
        'smtp' => [
            'host' => env('SMTP_HOST', ''),
            'port' => env('SMTP_PORT', 587),
            'encryption' => env('SMTP_ENCRYPTION', 'tls'),
            'user' => env('SMTP_USER', ''),
            'pass' => env('SMTP_PASS', ''),
        ],
    ],

    // ---- vinX ERP ---------------------------------------------------------
    // driver: mock (demo) | rest (vinX web interface/API) | file (CSV/XML exchange folder, e.g. via SFTP)
    'vinx' => [
        'enabled' => env('VINX_ENABLED', true),
        'driver' => env('VINX_DRIVER', 'mock'),
        'webhook_secret' => env('VINX_WEBHOOK_SECRET', ''),
        'push_orders' => true,
        'push_customers' => true,
        'max_attempts' => 8,
        // Which product fields vinX owns. Rich content (descriptions, tasting notes, images)
        // stays in the shop unless listed here.
        'owned_fields' => ['name_json', 'price_gross', 'stock', 'vintage', 'volume_ml', 'alcohol', 'grapes', 'region', 'country', 'appellation', 'color', 'active', 'tax_class', 'case_size'],
        // vinX customer-category / price-list code → shop customer group code
        'group_map' => ['PRIV' => 'retail', 'HAND' => 'b2b', 'GASTRO' => 'gastro'],

        'rest' => [
            'base_url' => env('VINX_BASE_URL', ''),
            'auth' => env('VINX_AUTH', 'bearer'),     // bearer | basic | header:X-Api-Key
            'token' => env('VINX_TOKEN', ''),
            'user' => env('VINX_USER', ''),
            'pass' => env('VINX_PASS', ''),
            'mandant' => env('VINX_MANDANT', ''),      // client / company number if your vinX setup has several
            'timeout' => 30,
            // !! Confirm paths with your vinX partner — these are configurable placeholders.
            'endpoints' => [
                'ping' => 'GET /ping',
                'articles' => 'GET /articles',
                'stock' => 'GET /stock',
                'prices' => 'GET /pricelists',
                'customers' => 'GET /customers',
                'order_create' => 'POST /orders',
                'customer_create' => 'POST /customers',
            ],
            'page_param' => 'page',
            'page_size_param' => 'pageSize',
            'page_size' => 200,
            'since_param' => 'modifiedSince',
            'data_key' => 'data',                       // array key holding records; '' = response is the array
        ],

        'file' => [
            'inbox' => env('VINX_INBOX', BASE_PATH . '/storage/vinx/inbox'),
            'outbox' => env('VINX_OUTBOX', BASE_PATH . '/storage/vinx/outbox'),
            'delimiter' => ';',
            'encoding' => 'Windows-1252',              // typical for Swiss ERP CSV exports; 'UTF-8' otherwise
            'order_format' => 'xml',                   // xml | csv | json
            'files' => ['articles' => 'artikel.csv', 'stock' => 'lager.csv', 'prices' => 'preise.csv'],
        ],

        // ERP field → shop field. Dot-notation for nested JSON. Adjust to your vinX export.
        'mapping' => [
            'article' => [
                'sku' => 'ArtikelNr',
                'erp_id' => 'ArtikelId',
                'name' => 'Bezeichnung',
                'name_fr' => 'BezeichnungFR',
                'name_it' => 'BezeichnungIT',
                'name_en' => 'BezeichnungEN',
                'producer' => 'Produzent',
                'country' => 'Land',
                'region' => 'Region',
                'appellation' => 'Appellation',
                'grapes' => 'Traubensorten',
                'vintage' => 'Jahrgang',
                'volume_ml' => 'InhaltCl',             // converted: cl × 10
                'alcohol' => 'Alkohol',
                'color' => 'Weinfarbe',
                'category' => 'Warengruppe',
                'price_gross' => 'VerkaufspreisInkl',  // CHF incl. VAT
                'tax_class' => 'MwstCode',
                'case_size' => 'Kartoninhalt',
                'stock' => 'LagerVerfuegbar',
                'active' => 'Webshop',
            ],
            'stock' => ['sku' => 'ArtikelNr', 'stock' => 'Verfuegbar'],
            'price' => ['sku' => 'ArtikelNr', 'group' => 'Preisliste', 'min_qty' => 'AbMenge', 'price_net' => 'PreisExkl'],
            'color_map' => ['Rot' => 'red', 'Weiss' => 'white', 'Rosé' => 'rose', 'Schaumwein' => 'sparkling', 'Süsswein' => 'sweet'],
            'tax_map' => ['1' => 'standard', '2' => 'reduced', 'N' => 'standard', 'R' => 'reduced'],
        ],
    ],

    'api' => [
        'enabled' => true,
        'cors_origins' => array_filter(explode(',', (string) env('API_CORS', ''))), // headless front-ends
    ],
];
