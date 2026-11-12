<?php
declare(strict_types=1);

namespace App\Modules\Catalog;

use App\Core\App;
use App\Core\HttpException;
use App\Core\Module;
use App\Core\Request;
use App\Shop\Catalog;
use App\Shop\Pricing;

final class CatalogModule implements Module
{
    public function name(): string
    {
        return 'catalog';
    }

    public function register(App $app): void
    {
        $r = $app->router;

        $listing = function (Request $req, array $params) use ($app) {
            $catalog = $app->get(Catalog::class);
            $category = null;
            $filters = [
                'q' => $req->str('q'),
                'type' => $req->str('type'),
                'color' => $req->query['color'] ?? [],
                'region' => $req->query['region'] ?? [],
                'producer' => $req->query['producer'] ?? [],
                'vintage' => $req->query['vintage'] ?? [],
                'grape' => $req->str('grape'),
                'organic' => $req->str('organic'),
                'instock' => $req->str('instock'),
                'min' => $req->str('min'),
                'max' => $req->str('max'),
                'sort' => $req->str('sort'),
            ];
            if (!empty($params['category'])) {
                $category = $catalog->category($params['category']);
                if (!$category) {
                    throw new HttpException(404);
                }
                $filters['category'] = $category['slug'];
            }
            $isB2B = auth()->isB2B();
            $result = $catalog->search($filters, $isB2B, max(1, $req->int('page', 1)), 24);
            $app->get(Pricing::class)->preload(array_column($result['items'], 'id'), (int) (auth()->group()['id'] ?? 0));

            return view('shop/index', [
                'category' => $category,
                'filters' => $filters,
                'result' => $result,
                'facets' => $catalog->facets($category['type'] ?? ($filters['type'] ?: null)),
                'categories' => $catalog->categories(),
            ]);
        };

        $r->get('/shop', $listing);
        $r->get('/shop/{category}', $listing);
        $r->get('/search', $listing);

        $r->get('/p/{slug}', function (Request $req, array $p) use ($app) {
            $catalog = $app->get(Catalog::class);
            $product = $catalog->bySlug($p['slug']);
            if (!$product || ((int) $product['b2b_only'] === 1 && !auth()->isB2B())) {
                throw new HttpException(404);
            }
            $producer = $product['producer_id'] ? $app->db()->one('SELECT * FROM producers WHERE id = ?', [$product['producer_id']]) : null;
            $related = $catalog->related($product);
            $pricing = $app->get(Pricing::class);
            $pricing->preload([...array_column($related, 'id'), $product['id']], (int) (auth()->group()['id'] ?? 0));
            $inWishlist = auth()->check() && $app->db()->value('SELECT id FROM wishlist WHERE user_id = ? AND product_id = ?', [auth()->id(), $product['id']]);
            return view('shop/product', [
                'product' => $product,
                'producer' => $producer,
                'related' => $related,
                'price' => $pricing->price($product, auth()->group()),
                'inWishlist' => (bool) $inWishlist,
            ]);
        });

        $r->get('/producers', fn () => view('shop/producers', ['producers' => $app->get(Catalog::class)->producers()]));

        $r->get('/producers/{slug}', function (Request $req, array $p) use ($app) {
            $catalog = $app->get(Catalog::class);
            $producer = $catalog->producer($p['slug']);
            if (!$producer) {
                throw new HttpException(404);
            }
            $products = $catalog->byProducer((int) $producer['id']);
            $app->get(Pricing::class)->preload(array_column($products, 'id'), (int) (auth()->group()['id'] ?? 0));
            return view('shop/producer', ['producer' => $producer, 'products' => $products]);
        });
    }
}
