<?php
declare(strict_types=1);

namespace App\Modules\Account;

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
use App\Shop\Pricing;

final class AccountModule implements Module
{
    public function name(): string
    {
        return 'account';
    }

    public function register(App $app): void
    {
        $r = $app->router;
        $db = fn (): DB => $app->db();

        $r->get('/login', fn () => view('account/login'), ['guest']);
        $r->post('/login', function (Request $req) {
            // Basic brute-force throttle per session.
            $tries = (int) Session::get('login_tries', 0);
            if ($tries >= 8 && time() - (int) Session::get('login_last', 0) < 300) {
                flash('error', t('auth.throttled'));
                return redirect('/login');
            }
            if (!auth()->attempt($req->str('email'), (string) ($req->post['password'] ?? ''))) {
                Session::set('login_tries', $tries + 1);
                Session::set('login_last', time());
                flash('error', t('auth.failed'));
                return redirect('/login');
            }
            Session::forget('login_tries');
            $intended = Session::pull('intended');
            return is_string($intended) && str_starts_with($intended, '/') && !str_starts_with($intended, '//')
                ? Response::redirect($intended)
                : redirect(auth()->isAdmin() ? '/admin' : '/account');
        }, ['guest']);

        $r->get('/register', fn () => view('account/register'), ['guest']);
        $r->post('/register', function (Request $req) use ($db, $app) {
            $email = filter_var($req->str('email'), FILTER_VALIDATE_EMAIL);
            $password = (string) ($req->post['password'] ?? '');
            Session::set('_old', ['email' => $req->str('email'), 'name' => $req->str('name')]);
            if (!$email || $req->str('name') === '') {
                flash('error', t('form.invalid'));
                return redirect('/register');
            }
            if (strlen($password) < 8) {
                flash('error', t('auth.password_min'));
                return redirect('/register');
            }
            if ($db()->value('SELECT id FROM users WHERE email = ?', [mb_strtolower($email)])) {
                flash('error', t('auth.email_taken'));
                return redirect('/register');
            }
            $id = $db()->insert('users', [
                'email' => mb_strtolower($email),
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                'name' => $req->str('name'),
                'role' => 'customer',
                'customer_group_id' => $db()->value("SELECT id FROM customer_groups WHERE code = 'retail'"),
                'locale' => locale(),
                'newsletter' => $req->str('newsletter') === '1' ? 1 : 0,
                'created_at' => DB::now(),
            ]);
            Session::forget('_old');
            auth()->login($id);
            $app->events->emit('customer.registered', ['user' => auth()->user()]);
            flash('success', t('auth.welcome'));
            return redirect('/account');
        }, ['guest']);

        $r->post('/logout', function () {
            auth()->logout();
            return redirect('/');
        });

        $r->get('/password/forgot', fn () => view('account/forgot'));
        $r->post('/password/forgot', function (Request $req) use ($db, $app) {
            $u = $db()->one('SELECT * FROM users WHERE email = ?', [mb_strtolower($req->str('email'))]);
            if ($u) {
                $token = bin2hex(random_bytes(24));
                $db()->update('users', ['reset_token' => hash('sha256', $token), 'reset_expires' => date('Y-m-d H:i:s', time() + 3600)], 'id = ?', [$u['id']]);
                $link = absolute_url('/password/reset') . '?token=' . $token . '&email=' . rawurlencode($u['email']);
                $app->get(Mailer::class)->sendTemplate($u['email'], t('mail.reset_subject'), 'reset', ['link' => $link]);
            }
            flash('success', t('auth.reset_sent')); // same message either way (no account enumeration)
            return redirect('/login');
        });
        $r->get('/password/reset', fn (Request $req) => view('account/reset', ['token' => $req->str('token'), 'email' => $req->str('email')]));
        $r->post('/password/reset', function (Request $req) use ($db) {
            $u = $db()->one('SELECT * FROM users WHERE email = ?', [mb_strtolower($req->str('email'))]);
            $ok = $u && $u['reset_token'] && hash_equals($u['reset_token'], hash('sha256', $req->str('token'))) && $u['reset_expires'] >= DB::now();
            $password = (string) ($req->post['password'] ?? '');
            if (!$ok || strlen($password) < 8) {
                flash('error', $ok ? t('auth.password_min') : t('auth.reset_invalid'));
                return back($req, '/password/forgot');
            }
            $db()->update('users', ['password_hash' => password_hash($password, PASSWORD_DEFAULT), 'reset_token' => null, 'reset_expires' => null], 'id = ?', [$u['id']]);
            flash('success', t('auth.reset_done'));
            return redirect('/login');
        });

        // ---- account area ----
        $r->get('/account', function () use ($db) {
            $orders = $db()->all('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 50', [auth()->id()]);
            return view('account/dashboard', ['orders' => $orders, 'user' => auth()->user(), 'group' => auth()->group()]);
        }, ['auth']);

        $r->get('/account/orders/{number}', function (Request $req, array $p) use ($app) {
            $order = $app->get(OrderService::class)->findByNumber($p['number']);
            if (!$order || (int) $order['user_id'] !== auth()->id()) {
                throw new HttpException(404);
            }
            return view('account/order', ['order' => $order]);
        }, ['auth']);

        $r->post('/account/orders/{number}/reorder', function (Request $req, array $p) use ($app) {
            $order = $app->get(OrderService::class)->findByNumber($p['number']);
            if (!$order || (int) $order['user_id'] !== auth()->id()) {
                throw new HttpException(404);
            }
            $cart = $app->get(Cart::class);
            $added = 0;
            foreach ($order['items'] as $item) {
                if ($item['product_id'] && $app->db()->value('SELECT id FROM products WHERE id = ? AND active = 1', [$item['product_id']])) {
                    $cart->add((int) $item['product_id'], (int) $item['qty']);
                    $added++;
                }
            }
            flash('success', t('account.reordered', ['count' => (string) $added]));
            return redirect('/cart');
        }, ['auth']);

        $r->post('/account/profile', function (Request $req) use ($db) {
            $b = (array) ($req->post['billing'] ?? []);
            $billing = array_map(fn ($v) => trim((string) $v), array_intersect_key($b, array_flip(['company', 'name', 'street', 'zip', 'city', 'country', 'phone'])));
            $data = [
                'name' => $req->str('name') ?: auth()->user()['name'],
                'phone' => $req->str('phone') ?: null,
                'billing_json' => json_encode($billing, JSON_UNESCAPED_UNICODE),
                'newsletter' => $req->str('newsletter') === '1' ? 1 : 0,
                'updated_at' => DB::now(),
            ];
            $newPw = (string) ($req->post['new_password'] ?? '');
            if ($newPw !== '') {
                if (strlen($newPw) < 8 || !password_verify((string) ($req->post['current_password'] ?? ''), (string) auth()->user()['password_hash'])) {
                    flash('error', t('auth.password_change_failed'));
                    return redirect('/account');
                }
                $data['password_hash'] = password_hash($newPw, PASSWORD_DEFAULT);
            }
            $db()->update('users', $data, 'id = ?', [auth()->id()]);
            flash('success', t('account.saved'));
            return redirect('/account');
        }, ['auth']);

        $r->get('/account/wishlist', function () use ($db, $app) {
            $items = $db()->all(
                'SELECT p.*, c.slug AS category_slug, pr.name AS producer_name FROM wishlist w JOIN products p ON p.id = w.product_id
                 LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN producers pr ON pr.id = p.producer_id
                 WHERE w.user_id = ? AND p.active = 1 ORDER BY w.id DESC',
                [auth()->id()]
            );
            $app->get(Pricing::class)->preload(array_column($items, 'id'), (int) (auth()->group()['id'] ?? 0));
            return view('account/wishlist', ['items' => $items]);
        }, ['auth']);

        $r->post('/wishlist/toggle', function (Request $req) use ($db) {
            if (!auth()->check()) {
                return $req->isAjax() ? Response::json(['ok' => false, 'login' => url('/login')], 401) : redirect('/login');
            }
            $pid = $req->int('product_id');
            $exists = $db()->value('SELECT id FROM wishlist WHERE user_id = ? AND product_id = ?', [auth()->id(), $pid]);
            if ($exists) {
                $db()->run('DELETE FROM wishlist WHERE id = ?', [$exists]);
            } else {
                $db()->insert('wishlist', ['user_id' => auth()->id(), 'product_id' => $pid, 'created_at' => DB::now()]);
            }
            return $req->isAjax() ? Response::json(['ok' => true, 'active' => !$exists]) : back($req);
        });
    }
}
