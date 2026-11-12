<?php
declare(strict_types=1);

namespace App\Modules\Checkout;

use App\Core\App;
use App\Core\DB;
use App\Core\HttpException;
use App\Core\Mailer;
use App\Core\Module;
use App\Core\Request;
use App\Core\Response;
use App\Core\Session;
use App\Shop\Cart;
use App\Shop\OrderService;
use App\Shop\Payment\PaymentRegistry;
use App\Shop\Payment\PrepaymentProvider;

final class CheckoutModule implements Module
{
    public function name(): string
    {
        return 'checkout';
    }

    public function register(App $app): void
    {
        $r = $app->router;

        $r->get('/checkout', function (Request $req) use ($app) {
            $cart = $app->get(Cart::class);
            $group = auth()->group();
            $summary = $cart->summary($group, Session::get('shipping_method'));
            if ($summary['empty']) {
                return redirect('/cart');
            }
            $user = auth()->user();
            return view('checkout/index', [
                'summary' => $summary,
                'payments' => $app->get(PaymentRegistry::class)->available($group, $user, $summary),
                'billing' => json_field($user['billing_json'] ?? null) + ['email' => $user['email'] ?? '', 'name' => $user['name'] ?? '', 'company' => $user['company'] ?? ''],
                'shippingAddr' => json_field($user['shipping_json'] ?? null),
                'errors' => Session::pull('_errors', []),
                'old' => Session::pull('_old', []),
                'cancelled' => $req->str('cancelled') !== '',
            ]);
        });

        // Live totals when the shipping method changes.
        $r->get('/checkout/totals', function (Request $req) use ($app) {
            $method = $req->str('shipping_method');
            Session::set('shipping_method', $method);
            $summary = $app->get(Cart::class)->summary(auth()->group(), $method);
            return Response::html($app->view->render('partials/totals', ['summary' => $summary], ''));
        });

        $r->post('/checkout', function (Request $req) use ($app) {
            $cart = $app->get(Cart::class);
            $group = auth()->group();
            $user = auth()->user();
            $summary = $cart->summary($group, $req->str('shipping_method'));
            if ($summary['empty']) {
                return redirect('/cart');
            }

            $b = (array) ($req->post['billing'] ?? []);
            $billing = [];
            foreach (['company', 'name', 'street', 'zip', 'city', 'country', 'phone'] as $k) {
                $billing[$k] = trim((string) ($b[$k] ?? ''));
            }
            $email = $user['email'] ?? filter_var($req->str('email'), FILTER_VALIDATE_EMAIL);
            $errors = [];
            if (!$email) {
                $errors['email'] = t('form.required');
            }
            foreach (['name', 'street', 'zip', 'city'] as $k) {
                if ($billing[$k] === '') {
                    $errors["billing.$k"] = t('form.required');
                }
            }
            $shipping = null;
            if ($req->str('ship_different') === '1') {
                $s = (array) ($req->post['shipping'] ?? []);
                $shipping = [];
                foreach (['company', 'name', 'street', 'zip', 'city', 'country'] as $k) {
                    $shipping[$k] = trim((string) ($s[$k] ?? ''));
                }
                foreach (['name', 'street', 'zip', 'city'] as $k) {
                    if ($shipping[$k] === '') {
                        $errors["shipping.$k"] = t('form.required');
                    }
                }
            }
            $registry = $app->get(PaymentRegistry::class);
            $methods = $registry->available($group, $user, $summary);
            $payCode = $req->str('payment_method');
            if (!isset($methods[$payCode])) {
                $errors['payment_method'] = t('checkout.choose_payment');
            }
            if ($req->str('terms') !== '1') {
                $errors['terms'] = t('checkout.accept_terms');
            }
            if ($summary['age_restricted'] && (bool) config('shop.age_gate', true) && $req->str('age') !== '1') {
                $errors['age'] = t('checkout.confirm_age', ['age' => (string) config('shop.min_age', 18)]);
            }
            if ($summary['below_minimum']) {
                $errors['minimum'] = t('b2b.min_order', ['amount' => money($summary['min_order_net'])]);
            }
            $password = (string) ($req->post['password'] ?? '');
            $createAccount = !$user && $req->str('create_account') === '1';
            if ($createAccount) {
                if (strlen($password) < 8) {
                    $errors['password'] = t('auth.password_min');
                } elseif ($app->db()->value('SELECT id FROM users WHERE email = ?', [mb_strtolower((string) $email)])) {
                    $errors['email'] = t('auth.email_taken');
                }
            }

            if ($errors) {
                Session::set('_errors', $errors);
                $old = $req->post;
                unset($old['password'], $old['_token']);
                Session::set('_old', $old);
                return redirect('/checkout');
            }

            if ($createAccount) {
                $uid = $app->db()->insert('users', [
                    'email' => mb_strtolower((string) $email),
                    'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                    'name' => $billing['name'],
                    'company' => $billing['company'] ?: null,
                    'phone' => $billing['phone'] ?: null,
                    'role' => 'customer',
                    'customer_group_id' => $group['id'] ?: null,
                    'locale' => locale(),
                    'billing_json' => json_encode($billing, JSON_UNESCAPED_UNICODE),
                    'newsletter' => $req->str('newsletter') === '1' ? 1 : 0,
                    'created_at' => DB::now(),
                ]);
                auth()->login($uid);
                $user = auth()->user();
                $app->events->emit('customer.registered', ['user' => $user]);
            } elseif ($user && $req->str('save_address') === '1') {
                $app->db()->update('users', ['billing_json' => json_encode($billing, JSON_UNESCAPED_UNICODE), 'updated_at' => DB::now()], 'id = ?', [$user['id']]);
            }

            $order = $app->get(OrderService::class)->place($summary, [
                'email' => (string) $email,
                'billing' => $billing,
                'shipping' => $shipping,
                'payment_method' => $payCode,
                'notes' => mb_substr($req->str('notes'), 0, 2000) ?: null,
                'po_number' => mb_substr($req->str('po_number'), 0, 80) ?: null,
                'delivery_date' => preg_match('/^\d{4}-\d{2}-\d{2}$/', $req->str('delivery_date')) ? $req->str('delivery_date') : null,
            ], $user, $group);

            $cart->clear();
            Session::forget('shipping_method');

            $redirect = $methods[$payCode]->start($order);
            return $redirect ?? redirect('/checkout/done/' . $order['number'], ['t' => $order['access_token']]);
        });

        $r->get('/checkout/done/{number}', function (Request $req, array $p) use ($app) {
            $order = $app->get(OrderService::class)->findByNumber($p['number']);
            $ownsIt = $order && auth()->check() && (int) $order['user_id'] === auth()->id();
            if (!$order || (!$ownsIt && !hash_equals($order['access_token'], $req->str('t')))) {
                throw new HttpException(404);
            }
            $prepay = $app->get(PaymentRegistry::class)->get('prepayment');
            return view('checkout/done', [
                'order' => $order,
                'bank' => $prepay instanceof PrepaymentProvider ? $prepay->bankDetails() : [],
            ]);
        });

        $r->post('/api/payment/{code}/webhook', function (Request $req, array $p) use ($app) {
            $provider = $app->get(PaymentRegistry::class)->get($p['code']);
            if (!$provider) {
                return Response::json(['error' => 'unknown provider'], 404);
            }
            return $provider->webhook($req);
        }, ['nocsrf']);

        // Notifications
        $app->events->on('order.placed', function (array $e) use ($app) {
            $order = $e['order'];
            $mailer = $app->get(Mailer::class);
            $prepay = $app->get(PaymentRegistry::class)->get('prepayment');
            $data = ['order' => $order, 'bank' => $prepay instanceof PrepaymentProvider ? $prepay->bankDetails() : []];
            $mailer->sendTemplate($order['email'], t('mail.order_subject', ['number' => $order['number']]), 'order', $data);
            $mailer->sendTemplate((string) config('mail.admin'), '[Shop] ' . ($order['is_b2b'] ? 'B2B ' : '') . 'Bestellung ' . $order['number'], 'order', $data + ['internal' => true]);
        });
    }
}
