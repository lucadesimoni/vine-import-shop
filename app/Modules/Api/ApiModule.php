<?php
declare(strict_types=1);

namespace App\Modules\Api;

use App\Core\App;
use App\Core\HttpException;
use App\Core\Module;
use App\Core\Request;
use App\Core\Response;
use App\Shop\Catalog;
use App\Shop\Pricing;

/**
 * Read-only JSON API — lets you run a headless front-end (e.g. on Cloudflare
 * Workers/Pages, Vercel, Netlify) against this backend, or feed marketplaces.
 * Prices are retail (B2C). B2B prices are only served in the authenticated shop.
 */
final class ApiModule implements Module
{
    public function name(): string
    {
        return 'api';
    }

    public function register(App $app): void
    {
        if (!$app->config->get('api.enabled', true)) {
            return;
        }
        $r = $app->router;
        $origins = (array) $app->config->get('api.cors_origins', []);

        $cors = function (Request $req, Response $res) use ($origins): Response {
            $origin = (string) $req->header('Origin');
            if ($origin !== '' && (in_array('*', $origins, true) || in_array($origin, $origins, true))) {
                $res->header('Access-Control-Allow-Origin', $origin)->header('Vary', 'Origin');
            }
            return $res->header('Cache-Control', 'public, max-age=60');
        };

        $serialize = function (array $p) use ($app): array {
            $price = $app->get(Pricing::class)->price($p, ['id' => 0, 'price_display' => 'gross']);
            return [
                'sku' => $p['sku'],
                'slug' => $p['slug'],
                'url' => absolute_url('/p/' . $p['slug']),
                'type' => $p['type'],
                'name' => json_field($p['name_json']),
                'short' => json_field($p['short_json']),
                'category' => $p['category_slug'] ?? null,
                'producer' => $p['producer_name'] ?? null,
                'color' => $p['color'],
                'country' => $p['country'],
                'region' => $p['region'],
                'appellation' => $p['appellation'],
                'grapes' => $p['grapes'],
                'vintage' => $p['vintage'],
                'volume_ml' => $p['volume_ml'] ? (int) $p['volume_ml'] : null,
                'alcohol' => $p['alcohol'] !== null ? (float) $p['alcohol'] : null,
                'organic' => (bool) $p['organic'],
                'price' => ['amount' => $price['gross'] / 100, 'currency' => config('app.currency', 'CHF'), 'vat_rate' => $price['tax_rate'], 'incl_vat' => true],
                'in_stock' => (int) $p['stock'] > 0,
                'image' => $p['image'] ? absolute_url('/' . ltrim($p['image'], '/')) : null,
            ];
        };

        $r->get('/api/v1/health', fn (Request $req) => $cors($req, Response::json(['ok' => true, 'time' => date('c')])));

        $r->get('/api/v1/products', function (Request $req) use ($app, $cors, $serialize) {
            $res = $app->get(Catalog::class)->search([
                'q' => $req->str('q'), 'category' => $req->str('category'), 'type' => $req->str('type'),
                'color' => $req->str('color') ? [$req->str('color')] : [], 'sort' => $req->str('sort'),
            ], false, max(1, $req->int('page', 1)), min(100, max(1, $req->int('per_page', 24))));
            return $cors($req, Response::json([
                'data' => array_map($serialize, $res['items']),
                'meta' => ['total' => $res['total'], 'page' => $res['page'], 'pages' => $res['pages']],
            ]));
        });

        $r->get('/api/v1/products/{sku}', function (Request $req, array $p) use ($app, $cors, $serialize) {
            $prod = $app->get(Catalog::class)->bySku($p['sku']);
            if (!$prod || !(int) $prod['active'] || (int) $prod['b2b_only']) {
                throw new HttpException(404, 'not_found');
            }
            return $cors($req, Response::json(['data' => $serialize($prod) + [
                'description' => json_field($prod['description_json']),
                'pairing' => json_field($prod['pairing_json']),
                'serving_temp' => $prod['serving_temp'],
                'aging' => $prod['aging'],
            ]]));
        });

        $r->get('/api/v1/categories', fn (Request $req) => $cors($req, Response::json(['data' => array_map(
            fn ($c) => ['slug' => $c['slug'], 'type' => $c['type'], 'name' => json_field($c['name_json'])],
            $app->get(Catalog::class)->categories()
        )])));
    }
}
