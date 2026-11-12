<?php
declare(strict_types=1);

namespace App\Modules\Admin;

use App\Core\App;
use App\Core\DB;
use App\Core\HttpException;
use App\Core\Mailer;
use App\Core\Module;
use App\Core\Request;
use App\Shop\OrderService;

final class AdminModule implements Module
{
    public function name(): string
    {
        return 'admin';
    }

    public function register(App $app): void
    {
        $r = $app->router;
        $mw = ['admin'];
        $db = fn (): DB => $app->db();
        $admin = fn (string $tpl, array $data = []) => view($tpl, $data, 'layouts/admin');

        array_unshift(
            $app->adminMenu,
            ['label' => 'Dashboard', 'url' => '/admin', 'icon' => 'box'],
            ['label' => 'Bestellungen', 'url' => '/admin/orders', 'icon' => 'cart'],
            ['label' => 'Produkte', 'url' => '/admin/products', 'icon' => 'glass'],
            ['label' => 'Kunden', 'url' => '/admin/customers', 'icon' => 'user'],
            ['label' => 'Gutscheine', 'url' => '/admin/coupons', 'icon' => 'file'],
        );

        $r->get('/admin', function () use ($db, $admin) {
            $d = $db();
            $since = date('Y-m-d', strtotime('-30 days'));
            return $admin('admin/dashboard', [
                'kpi' => [
                    'orders30' => (int) $d->value('SELECT COUNT(*) FROM orders WHERE created_at >= ?', [$since]),
                    'revenue30' => (int) $d->value("SELECT COALESCE(SUM(total_gross),0) FROM orders WHERE created_at >= ? AND status <> 'cancelled'", [$since]),
                    'b2b_share' => (int) $d->value("SELECT COALESCE(SUM(CASE WHEN is_b2b = 1 THEN total_gross ELSE 0 END),0) FROM orders WHERE created_at >= ? AND status <> 'cancelled'", [$since]),
                    'pending_b2b' => (int) $d->value("SELECT COUNT(*) FROM users WHERE b2b_status = 'pending'"),
                    'low_stock' => (int) $d->value('SELECT COUNT(*) FROM products WHERE active = 1 AND stock < 12'),
                    'erp_failed' => (int) $d->value("SELECT COUNT(*) FROM erp_outbox WHERE status = 'failed'"),
                ],
                'orders' => $d->all('SELECT * FROM orders ORDER BY id DESC LIMIT 10'),
                'lowStock' => $d->all('SELECT id, sku, name_json, vintage, stock FROM products WHERE active = 1 AND stock < 12 ORDER BY stock ASC LIMIT 8'),
                'daily' => $d->all("SELECT SUBSTR(created_at,1,10) AS day, COUNT(*) AS n, SUM(total_gross) AS total FROM orders WHERE created_at >= ? AND status <> 'cancelled' GROUP BY SUBSTR(created_at,1,10) ORDER BY day", [$since]),
            ]);
        }, $mw);

        // ---- orders ------------------------------------------------------
        $r->get('/admin/orders', function (Request $req) use ($db, $admin) {
            $where = '1=1';
            $params = [];
            if ($s = $req->str('status')) {
                $where .= ' AND status = ?';
                $params[] = $s;
            }
            if ($q = $req->str('q')) {
                $where .= ' AND (number LIKE ? OR email LIKE ? OR billing_json LIKE ?)';
                array_push($params, "%$q%", "%$q%", "%$q%");
            }
            if ($req->str('b2b') !== '') {
                $where .= ' AND is_b2b = ?';
                $params[] = (int) $req->str('b2b');
            }
            return $admin('admin/orders', ['orders' => $db()->all("SELECT * FROM orders WHERE $where ORDER BY id DESC LIMIT 200", $params), 'filters' => $req->query]);
        }, $mw);

        $r->get('/admin/orders/{id}', function (Request $req, array $p) use ($app, $admin) {
            $order = $app->get(OrderService::class)->find((int) $p['id']);
            if (!$order) {
                throw new HttpException(404);
            }
            $outbox = $app->db()->all("SELECT * FROM erp_outbox WHERE type = 'order' AND ref_id = ? ORDER BY id DESC", [$order['id']]);
            return $admin('admin/order', ['order' => $order, 'outbox' => $outbox]);
        }, $mw);

        $r->post('/admin/orders/{id}', function (Request $req, array $p) use ($app) {
            $orders = $app->get(OrderService::class);
            $id = (int) $p['id'];
            if (in_array($req->str('status'), OrderService::statuses(), true)) {
                $orders->setStatus($id, $req->str('status'));
            }
            if ($req->str('paid') === '1') {
                $orders->markPaid($id, 'manual');
            }
            flash('success', 'Bestellung aktualisiert');
            return redirect('/admin/orders/' . $id);
        }, $mw);

        // ---- products ----------------------------------------------------
        $r->get('/admin/products', function (Request $req) use ($db, $admin) {
            $q = $req->str('q');
            $rows = $q
                ? $db()->all('SELECT p.*, pr.name AS producer_name FROM products p LEFT JOIN producers pr ON pr.id = p.producer_id WHERE p.sku LIKE ? OR p.name_json LIKE ? ORDER BY p.sku LIMIT 300', ["%$q%", "%$q%"])
                : $db()->all('SELECT p.*, pr.name AS producer_name FROM products p LEFT JOIN producers pr ON pr.id = p.producer_id ORDER BY p.sku LIMIT 300');
            return $admin('admin/products', ['products' => $rows, 'q' => $q]);
        }, $mw);

        $form = function (?array $product) use ($db, $admin) {
            return $admin('admin/product-edit', [
                'product' => $product,
                'categories' => $db()->all('SELECT * FROM categories ORDER BY sort'),
                'producers' => $db()->all('SELECT id, name FROM producers ORDER BY name'),
                'owned' => config('vinx.enabled') ? (array) config('vinx.owned_fields', []) : [],
                'locales' => (array) config('app.locales', ['de']),
            ]);
        };
        $r->get('/admin/products/new', fn () => $form(null), $mw);
        $r->get('/admin/products/{id}', function (Request $req, array $p) use ($db, $form) {
            $product = $db()->one('SELECT * FROM products WHERE id = ?', [(int) $p['id']]);
            if (!$product) {
                throw new HttpException(404);
            }
            return $form($product);
        }, $mw);

        $r->post('/admin/products/save', function (Request $req) use ($db) {
            $id = $req->int('id');
            $locales = (array) config('app.locales', ['de']);
            $json = function (string $field) use ($req, $locales): string {
                $vals = [];
                foreach ($locales as $l) {
                    $v = trim((string) ($req->post[$field][$l] ?? ''));
                    if ($v !== '') {
                        $vals[$l] = $v;
                    }
                }
                return (string) json_encode($vals, JSON_UNESCAPED_UNICODE);
            };
            $data = [
                'sku' => $req->str('sku'),
                'slug' => slugify($req->str('slug') ?: ($req->post['name']['de'] ?? $req->str('sku'))),
                'type' => in_array($req->str('type'), ['wine', 'speciality', 'spirit'], true) ? $req->str('type') : 'wine',
                'category_id' => $req->int('category_id') ?: null,
                'producer_id' => $req->int('producer_id') ?: null,
                'name_json' => $json('name'),
                'short_json' => $json('short'),
                'description_json' => $json('description'),
                'tasting_json' => $json('description'),
                'pairing_json' => $json('pairing'),
                'color' => $req->str('color') ?: null,
                'region' => $req->str('region') ?: null,
                'country' => $req->str('country') ?: null,
                'appellation' => $req->str('appellation') ?: null,
                'grapes' => $req->str('grapes') ?: null,
                'vintage' => $req->str('vintage') ?: null,
                'volume_ml' => $req->int('volume_ml') ?: null,
                'alcohol' => is_numeric($req->str('alcohol')) ? (float) $req->str('alcohol') : null,
                'serving_temp' => $req->str('serving_temp') ?: null,
                'aging' => $req->str('aging') ?: null,
                'rating' => $req->str('rating') ?: null,
                'price_gross' => (int) round((float) str_replace("'", '', $req->str('price')) * 100),
                'tax_class' => $req->str('tax_class') === 'reduced' ? 'reduced' : 'standard',
                'case_size' => max(1, $req->int('case_size', 6)),
                'stock' => max(0, $req->int('stock')),
                'image' => $req->str('image') ?: null,
                'organic' => $req->str('organic') === '1' ? 1 : 0,
                'featured' => $req->str('featured') === '1' ? 1 : 0,
                'active' => $req->str('active') === '1' ? 1 : 0,
                'b2b_only' => $req->str('b2b_only') === '1' ? 1 : 0,
                'age_restricted' => $req->str('age_restricted') === '1' ? 1 : 0,
                'updated_at' => DB::now(),
            ];
            if ($data['sku'] === '') {
                flash('error', 'SKU ist erforderlich');
                return redirect($id ? "/admin/products/$id" : '/admin/products/new');
            }
            if ($db()->value('SELECT id FROM products WHERE (sku = ? OR slug = ?) AND id <> ?', [$data['sku'], $data['slug'], $id])) {
                flash('error', 'SKU oder Slug bereits vergeben');
                return redirect($id ? "/admin/products/$id" : '/admin/products/new');
            }
            if ($id) {
                $db()->update('products', $data, 'id = ?', [$id]);
            } else {
                $id = $db()->insert('products', $data + ['created_at' => DB::now()]);
            }
            flash('success', 'Produkt gespeichert');
            return redirect('/admin/products/' . $id);
        }, $mw);

        // ---- customers ---------------------------------------------------
        $r->get('/admin/customers', function (Request $req) use ($db, $admin) {
            $where = "u.role = 'customer'";
            $params = [];
            if ($s = $req->str('status')) {
                $where .= ' AND u.b2b_status = ?';
                $params[] = $s;
            }
            if ($q = $req->str('q')) {
                $where .= ' AND (u.email LIKE ? OR u.name LIKE ? OR u.company LIKE ?)';
                array_push($params, "%$q%", "%$q%", "%$q%");
            }
            return $admin('admin/customers', [
                'customers' => $db()->all("SELECT u.*, g.name AS group_name, (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count FROM users u LEFT JOIN customer_groups g ON g.id = u.customer_group_id WHERE $where ORDER BY CASE WHEN u.b2b_status = 'pending' THEN 0 ELSE 1 END, u.id DESC LIMIT 300", $params),
                'groups' => $db()->all('SELECT * FROM customer_groups ORDER BY id'),
                'filters' => $req->query,
            ]);
        }, $mw);

        $r->post('/admin/customers/{id}', function (Request $req, array $p) use ($db, $app) {
            $id = (int) $p['id'];
            $u = $db()->one('SELECT * FROM users WHERE id = ?', [$id]);
            if (!$u) {
                throw new HttpException(404);
            }
            $data = ['updated_at' => DB::now()];
            if ($gid = $req->int('customer_group_id')) {
                $data['customer_group_id'] = $gid;
            }
            $action = $req->str('action');
            if ($action === 'approve') {
                $data['b2b_status'] = 'approved';
            } elseif ($action === 'reject') {
                $data['b2b_status'] = 'rejected';
                $data['customer_group_id'] = $db()->value("SELECT id FROM customer_groups WHERE code = 'retail'");
            }
            $db()->update('users', $data, 'id = ?', [$id]);
            if ($action === 'approve') {
                $app->get(Mailer::class)->sendTemplate($u['email'], t('mail.b2b_approved_subject'), 'b2b-approved', ['user' => $u]);
                $app->events->emit('b2b.approved', ['user_id' => $id]);
            }
            flash('success', 'Kunde aktualisiert');
            return redirect('/admin/customers');
        }, $mw);

        // ---- coupons -----------------------------------------------------
        $r->get('/admin/coupons', fn () => $admin('admin/coupons', ['coupons' => $db()->all('SELECT * FROM coupons ORDER BY id DESC')]), $mw);
        $r->post('/admin/coupons', function (Request $req) use ($db) {
            $code = strtoupper(preg_replace('/[^A-Z0-9_-]/i', '', $req->str('code')));
            if ($code === '' || $db()->value('SELECT id FROM coupons WHERE code = ?', [$code])) {
                flash('error', 'Code fehlt oder existiert bereits');
                return redirect('/admin/coupons');
            }
            $type = $req->str('type') === 'fixed' ? 'fixed' : 'percent';
            $db()->insert('coupons', [
                'code' => $code, 'type' => $type,
                'value' => $type === 'fixed' ? (int) round((float) $req->str('value') * 100) : max(1, min(100, $req->int('value'))),
                'min_total' => (int) round((float) $req->str('min_total') * 100),
                'b2c_only' => $req->str('b2c_only') === '1' ? 1 : 0, 'active' => 1,
                'expires_at' => preg_match('/^\d{4}-\d{2}-\d{2}$/', $req->str('expires_at')) ? $req->str('expires_at') : null,
            ]);
            flash('success', 'Gutschein erstellt');
            return redirect('/admin/coupons');
        }, $mw);
        $r->post('/admin/coupons/{id}/toggle', function (Request $req, array $p) use ($db) {
            $db()->run('UPDATE coupons SET active = 1 - active WHERE id = ?', [(int) $p['id']]);
            return redirect('/admin/coupons');
        }, $mw);
    }
}
