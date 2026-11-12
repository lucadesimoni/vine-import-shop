<?php
declare(strict_types=1);

namespace App\Modules\Cart;

use App\Core\App;
use App\Core\Module;
use App\Core\Request;
use App\Core\Response;
use App\Core\Session;
use App\Shop\Cart;

final class CartModule implements Module
{
    public function name(): string
    {
        return 'cart';
    }

    public function register(App $app): void
    {
        $r = $app->router;
        $cart = fn (): Cart => $app->get(Cart::class);

        $respond = function (Request $req, string $message = '') use ($cart, $app) {
            if ($req->isAjax()) {
                $s = $cart()->summary(auth()->group());
                return Response::json([
                    'ok' => true,
                    'message' => $message,
                    'count' => $cart()->count(),
                    'total' => money($s['display_mode'] === 'net' ? $s['subtotal_net'] : $s['subtotal_gross']),
                    'drawer' => $app->view->render('partials/cart-drawer', ['summary' => $s], ''),
                ]);
            }
            if ($message) {
                flash('success', $message);
            }
            return redirect('/cart');
        };

        $r->get('/cart', function () use ($cart) {
            return view('shop/cart', ['summary' => $cart()->summary(auth()->group(), Session::get('shipping_method'))]);
        });

        $r->get('/cart/drawer', function () use ($cart, $app) {
            return Response::html($app->view->render('partials/cart-drawer', ['summary' => $cart()->summary(auth()->group())], ''));
        });

        $r->post('/cart/add', function (Request $req) use ($cart, $app, $respond) {
            $id = $req->int('product_id');
            $qty = max(1, min(999, $req->int('qty', 1)));
            $p = $app->db()->one('SELECT id, stock, b2b_only, name_json FROM products WHERE id = ? AND active = 1', [$id]);
            if (!$p || ((int) $p['b2b_only'] === 1 && !auth()->isB2B())) {
                return Response::json(['ok' => false, 'message' => t('cart.unavailable')], 404);
            }
            $cart()->add($id, $qty);
            return $respond($req, t('cart.added', ['name' => tf($p['name_json'])]));
        });

        $r->post('/cart/update', function (Request $req) use ($cart, $respond) {
            foreach ((array) ($req->post['qty'] ?? []) as $id => $qty) {
                $cart()->set((int) $id, max(0, min(999, (int) $qty)));
            }
            if ($req->str('shipping_method') !== '') {
                Session::set('shipping_method', $req->str('shipping_method'));
            }
            return $respond($req, t('cart.updated'));
        });

        $r->post('/cart/remove', function (Request $req) use ($cart, $respond) {
            $cart()->remove($req->int('product_id'));
            return $respond($req, t('cart.removed'));
        });

        $r->post('/cart/coupon', function (Request $req) use ($cart, $app) {
            $code = strtoupper($req->str('code'));
            if ($code === '') {
                Session::forget('coupon');
                return redirect('/cart');
            }
            $c = $app->db()->one('SELECT * FROM coupons WHERE code = ? AND active = 1', [$code]);
            if (!$c || ($c['expires_at'] && $c['expires_at'] < date('Y-m-d'))) {
                flash('error', t('coupon.invalid'));
            } else {
                Session::set('coupon', $code);
                flash('success', t('coupon.applied'));
            }
            return redirect('/cart');
        });
    }
}
