<?php
declare(strict_types=1);

namespace App\Modules\B2B;

use App\Core\App;
use App\Core\DB;
use App\Core\Mailer;
use App\Core\Module;
use App\Core\Request;
use App\Core\Response;
use App\Core\Session;
use App\Shop\Cart;
use App\Shop\Catalog;
use App\Shop\Pricing;

/**
 * Trade customers (retailers, restaurants, hotels):
 *  - application with company + UID, manual approval in admin
 *  - net prices, quantity breaks, group price lists from vinX
 *  - quick order by SKU / paste from spreadsheet, price list export, reorder
 *  - invoice payment, PO number, desired delivery date, minimum order value
 */
final class B2BModule implements Module
{
    public function name(): string
    {
        return 'b2b';
    }

    public function register(App $app): void
    {
        $r = $app->router;

        $r->get('/b2b', function () {
            if (auth()->isB2B()) {
                return redirect('/b2b/portal');
            }
            return view('b2b/landing', ['user' => auth()->user(), 'old' => Session::pull('_old', [])]);
        });

        $r->post('/b2b/apply', function (Request $req) use ($app) {
            $db = $app->db();
            $user = auth()->user();
            $fields = ['company', 'uid_number', 'name', 'phone', 'street', 'zip', 'city', 'business_type', 'message'];
            $in = [];
            foreach ($fields as $f) {
                $in[$f] = mb_substr($req->str($f), 0, 500);
            }
            $email = $user['email'] ?? filter_var($req->str('email'), FILTER_VALIDATE_EMAIL);
            $uidOk = !config('b2b.require_uid', true) || preg_match('/^CHE[-\s]?\d{3}\.?\d{3}\.?\d{3}/i', $in['uid_number']);
            if (!$email || $in['company'] === '' || $in['name'] === '' || !$uidOk) {
                Session::set('_old', $in + ['email' => (string) $req->str('email')]);
                flash('error', $uidOk ? t('form.invalid') : t('b2b.uid_invalid'));
                return redirect('/b2b');
            }
            $groupCode = $in['business_type'] === 'gastro' ? 'gastro' : (string) config('b2b.default_group', 'b2b');
            $groupId = $db->value('SELECT id FROM customer_groups WHERE code = ?', [$groupCode]);
            $billing = json_encode(['company' => $in['company'], 'name' => $in['name'], 'street' => $in['street'], 'zip' => $in['zip'], 'city' => $in['city'], 'country' => 'CH'], JSON_UNESCAPED_UNICODE);

            if ($user) {
                $db->update('users', [
                    'company' => $in['company'], 'uid_number' => strtoupper($in['uid_number']), 'phone' => $in['phone'] ?: null,
                    'customer_group_id' => $groupId, 'b2b_status' => 'pending', 'billing_json' => $billing, 'updated_at' => DB::now(),
                ], 'id = ?', [$user['id']]);
                $uid = (int) $user['id'];
            } else {
                $password = (string) ($req->post['password'] ?? '');
                if (strlen($password) < 8) {
                    Session::set('_old', $in + ['email' => (string) $email]);
                    flash('error', t('auth.password_min'));
                    return redirect('/b2b');
                }
                if ($db->value('SELECT id FROM users WHERE email = ?', [mb_strtolower((string) $email)])) {
                    flash('error', t('auth.email_taken_login'));
                    return redirect('/login');
                }
                $uid = $db->insert('users', [
                    'email' => mb_strtolower((string) $email), 'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                    'name' => $in['name'], 'company' => $in['company'], 'uid_number' => strtoupper($in['uid_number']),
                    'phone' => $in['phone'] ?: null, 'role' => 'customer', 'customer_group_id' => $groupId,
                    'b2b_status' => 'pending', 'locale' => locale(), 'billing_json' => $billing, 'created_at' => DB::now(),
                ]);
                auth()->login($uid);
            }
            $app->get(Mailer::class)->send(
                (string) config('b2b.notify_email'),
                '[B2B] Neue Händleranfrage: ' . $in['company'],
                '<p>' . e($in['company']) . ' (' . e($in['uid_number']) . ')<br>' . e($in['name']) . ' · ' . e((string) $email) . '<br>' . e($in['business_type']) . '</p><p>' . nl2br(e($in['message'])) . '</p><p><a href="' . e(absolute_url('/admin/customers?status=pending')) . '">Freigeben</a></p>'
            );
            $app->events->emit('b2b.applied', ['user_id' => $uid]);
            flash('success', t('b2b.applied'));
            return redirect('/account');
        });

        $r->get('/b2b/portal', function () use ($app) {
            $db = $app->db();
            $uid = auth()->id();
            $stats = [
                'orders' => (int) $db->value('SELECT COUNT(*) FROM orders WHERE user_id = ?', [$uid]),
                'revenue_net' => (int) $db->value("SELECT COALESCE(SUM(subtotal_net),0) FROM orders WHERE user_id = ? AND status <> 'cancelled'", [$uid]),
                'open' => (int) $db->value("SELECT COUNT(*) FROM orders WHERE user_id = ? AND status IN ('new','confirmed','processing')", [$uid]),
            ];
            $favourites = $db->all(
                "SELECT p.*, c.slug AS category_slug, pr.name AS producer_name, SUM(oi.qty) AS total_qty
                 FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id
                 LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN producers pr ON pr.id = p.producer_id
                 WHERE o.user_id = ? AND p.active = 1 GROUP BY p.id ORDER BY total_qty DESC LIMIT 12",
                [$uid]
            );
            $app->get(Pricing::class)->preload(array_column($favourites, 'id'), (int) auth()->group()['id']);
            $orders = $db->all('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 10', [$uid]);
            return view('b2b/portal', ['stats' => $stats, 'favourites' => $favourites, 'orders' => $orders, 'group' => auth()->group()]);
        }, ['auth', 'b2b']);

        $r->get('/b2b/quick-order', fn () => view('b2b/quick-order', ['result' => Session::pull('quick_result')]), ['auth', 'b2b']);

        $r->post('/b2b/quick-order', function (Request $req) use ($app) {
            $catalog = $app->get(Catalog::class);
            $cart = $app->get(Cart::class);
            $rows = [];
            foreach ((array) ($req->post['sku'] ?? []) as $i => $sku) {
                $rows[] = [trim((string) $sku), (int) ($req->post['qty'][$i] ?? 0)];
            }
            // Paste mode: "SKU;QTY" or "SKU<TAB>QTY" or "SKU QTY" per line (copy from Excel).
            foreach (preg_split('/\r?\n/', $req->str('paste')) ?: [] as $line) {
                if (preg_match('/^\s*([\w.\-\/]+)[\s;,\t]+(\d+)/u', $line, $m)) {
                    $rows[] = [$m[1], (int) $m[2]];
                }
            }
            $added = [];
            $missing = [];
            foreach ($rows as [$sku, $qty]) {
                if ($sku === '' || $qty <= 0) {
                    continue;
                }
                $p = $catalog->bySku($sku);
                if (!$p || !(int) $p['active']) {
                    $missing[] = $sku;
                    continue;
                }
                $cart->add((int) $p['id'], $qty);
                $added[] = ['sku' => $sku, 'qty' => $qty, 'name' => tf($p['name_json'])];
            }
            Session::set('quick_result', ['added' => $added, 'missing' => $missing]);
            if ($req->str('go') === 'cart' && $added && !$missing) {
                flash('success', t('b2b.quick_added', ['count' => (string) count($added)]));
                return redirect('/cart');
            }
            return redirect('/b2b/quick-order');
        }, ['auth', 'b2b']);

        $r->get('/b2b/sku-lookup', function (Request $req) use ($app) {
            $q = '%' . mb_strtolower($req->str('q')) . '%';
            $rows = $app->db()->all('SELECT id, sku, name_json, vintage, price_gross, tax_class, stock FROM products WHERE active = 1 AND (LOWER(sku) LIKE ? OR LOWER(name_json) LIKE ?) LIMIT 8', [$q, $q]);
            $pricing = $app->get(Pricing::class);
            return Response::json(array_map(fn ($p) => [
                'sku' => $p['sku'], 'name' => tf($p['name_json']) . ' ' . ($p['vintage'] ?? ''), 'stock' => (int) $p['stock'],
                'price' => money($pricing->price($p, auth()->group())['net']),
            ], $rows));
        }, ['auth', 'b2b']);

        $r->get('/b2b/pricelist.csv', function () use ($app) {
            $pricing = $app->get(Pricing::class);
            $group = auth()->group();
            $rows = $app->db()->all('SELECT p.*, pr.name AS producer_name FROM products p LEFT JOIN producers pr ON pr.id = p.producer_id WHERE p.active = 1 ORDER BY p.type, p.region, p.sku');
            $pricing->preload(array_column($rows, 'id'), (int) $group['id']);
            $out = fopen('php://temp', 'r+');
            fwrite($out, "\xEF\xBB\xBF"); // UTF-8 BOM for Excel
            fputcsv($out, ['SKU', 'Name', 'Produzent', 'Jahrgang', 'Region', 'Inhalt ml', 'Karton', 'Lager', 'Preis netto CHF', 'MWST %', 'Staffelpreise netto'], ';');
            foreach ($rows as $p) {
                $price = $pricing->price($p, $group);
                $tiers = implode(' | ', array_map(fn ($t) => 'ab ' . $t['min_qty'] . ': ' . money($t['price_net'], false), $price['tiers']));
                fputcsv($out, [$p['sku'], tf($p['name_json']), $p['producer_name'], $p['vintage'], $p['region'], $p['volume_ml'], $p['case_size'], $p['stock'], money($price['net'], false), $price['tax_rate'], $tiers], ';');
            }
            rewind($out);
            return (new Response((string) stream_get_contents($out), 200, [
                'Content-Type' => 'text/csv; charset=utf-8',
                'Content-Disposition' => 'attachment; filename="preisliste-' . date('Y-m-d') . '.csv"',
            ]));
        }, ['auth', 'b2b']);
    }
}
