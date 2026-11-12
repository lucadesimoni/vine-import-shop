<?php
declare(strict_types=1);

namespace App\Modules\Vinx;

use App\Core\App;
use App\Core\DB;
use App\Core\Module;
use App\Core\Request;
use App\Core\Response;
use App\Modules\Vinx\Clients\FileClient;
use App\Modules\Vinx\Clients\MockClient;
use App\Modules\Vinx\Clients\RestClient;
use App\Shop\OrderService;

final class VinxModule implements Module
{
    public function name(): string
    {
        return 'vinx';
    }

    public function register(App $app): void
    {
        $cfg = (array) $app->config->get('vinx', []);
        if (!($cfg['enabled'] ?? false)) {
            return;
        }

        $app->set(ErpClient::class, function (App $a) use ($cfg): ErpClient {
            $driver = (string) ($cfg['driver'] ?? 'mock');
            return match ($driver) {
                'rest' => new RestClient($cfg),
                'file' => new FileClient($cfg),
                'mock' => new MockClient($a->db(), $cfg),
                default => new $driver($cfg), // custom ErpClient class
            };
        });
        $app->set(SyncService::class, fn (App $a) => new SyncService($a->db(), $a->get(ErpClient::class), $cfg));

        // ---- outbound events → outbox -----------------------------------
        $flushScheduled = false;
        $flushSoon = function () use ($app, &$flushScheduled) {
            if ($flushScheduled || PHP_SAPI === 'cli') {
                return;
            }
            $flushScheduled = true;
            // Try to deliver right after the response is sent; cron retries otherwise.
            register_shutdown_function(function () use ($app) {
                if (function_exists('fastcgi_finish_request')) {
                    fastcgi_finish_request();
                }
                try {
                    $app->get(SyncService::class)->processOutbox(5);
                } catch (\Throwable $e) {
                    error_log('[vinx] ' . $e->getMessage());
                }
            });
        };

        if ($cfg['push_orders'] ?? true) {
            $app->events->on('order.placed', function (array $e) use ($app, $flushSoon) {
                $sync = $app->get(SyncService::class);
                $sync->enqueue('order', (int) $e['order']['id'], $sync->orderPayload($e['order']));
                $flushSoon();
            });
        }
        if ($cfg['push_customers'] ?? true) {
            $pushCustomer = function (int $userId) use ($app, $flushSoon) {
                $u = $app->db()->one('SELECT u.*, g.erp_code FROM users u LEFT JOIN customer_groups g ON g.id = u.customer_group_id WHERE u.id = ?', [$userId]);
                if (!$u || $u['role'] === 'admin') {
                    return;
                }
                $app->get(SyncService::class)->enqueue('customer', $userId, ['customer' => [
                    'id' => $u['id'], 'erp_id' => $u['erp_id'], 'email' => $u['email'], 'name' => $u['name'], 'company' => $u['company'],
                    'uid_number' => $u['uid_number'], 'phone' => $u['phone'], 'price_list' => $u['erp_code'], 'locale' => $u['locale'],
                    'billing' => json_decode((string) $u['billing_json'], true), 'newsletter' => (bool) $u['newsletter'],
                ]]);
                $flushSoon();
            };
            $app->events->on('customer.registered', fn (array $e) => $pushCustomer((int) $e['user']['id']));
            $app->events->on('b2b.approved', fn (array $e) => $pushCustomer((int) $e['user_id']));
        }

        // ---- inbound webhook (vinX → shop) ------------------------------
        // Signed with HMAC-SHA256 of the raw body in header X-Vinx-Signature.
        $app->router->post('/api/vinx/webhook', function (Request $req) use ($app, $cfg) {
            $secret = (string) ($cfg['webhook_secret'] ?? '');
            $sig = (string) $req->header('X-Vinx-Signature');
            if ($secret === '' || !hash_equals(hash_hmac('sha256', $req->body, $secret), $sig)) {
                return Response::json(['error' => 'invalid signature'], 401);
            }
            $evt = json_decode($req->body, true) ?: [];
            $db = $app->db();
            $handled = 0;
            switch ($evt['event'] ?? '') {
                case 'stock.updated':
                    foreach ($evt['items'] ?? [$evt] as $it) {
                        $handled += $db->update('products', ['stock' => max(0, (int) ($it['stock'] ?? 0)), 'synced_at' => DB::now()], 'sku = ?', [(string) ($it['sku'] ?? '')]);
                    }
                    break;
                case 'article.updated':
                    $app->get(SyncService::class)->syncArticles();
                    $handled = 1;
                    break;
                case 'order.status':
                    $orders = $app->get(OrderService::class);
                    $o = $orders->findByNumber((string) ($evt['number'] ?? ''));
                    if ($o && in_array($evt['status'] ?? '', OrderService::statuses(), true)) {
                        $orders->setStatus((int) $o['id'], $evt['status']);
                        if (!empty($evt['paid'])) {
                            $orders->markPaid((int) $o['id'], 'vinx');
                        }
                        $handled = 1;
                    }
                    break;
            }
            return Response::json(['ok' => true, 'handled' => $handled]);
        }, ['nocsrf']);

        // ---- admin ------------------------------------------------------
        $app->adminMenu[] = ['label' => 'vinX ERP', 'url' => '/admin/vinx', 'icon' => 'refresh'];

        $app->router->get('/admin/vinx', function () use ($app, $cfg) {
            $db = $app->db();
            return view('admin/vinx', [
                'driver' => $cfg['driver'] ?? 'mock',
                'logs' => $db->all('SELECT * FROM sync_log ORDER BY id DESC LIMIT 30'),
                'outbox' => $db->all("SELECT * FROM erp_outbox WHERE status <> 'sent' ORDER BY id DESC LIMIT 50"),
                'counts' => [
                    'pending' => (int) $db->value("SELECT COUNT(*) FROM erp_outbox WHERE status IN ('pending','retry')"),
                    'failed' => (int) $db->value("SELECT COUNT(*) FROM erp_outbox WHERE status = 'failed'"),
                    'sent' => (int) $db->value("SELECT COUNT(*) FROM erp_outbox WHERE status = 'sent'"),
                ],
                'last' => [
                    'articles' => $app->get(SyncService::class)->lastSuccess('articles'),
                    'stock' => $app->get(SyncService::class)->lastSuccess('stock'),
                    'prices' => $app->get(SyncService::class)->lastSuccess('prices'),
                ],
            ], 'layouts/admin');
        }, ['admin']);

        $app->router->post('/admin/vinx/run', function (Request $req) use ($app) {
            $sync = $app->get(SyncService::class);
            $job = $req->str('job');
            $res = match ($job) {
                'ping' => (function () use ($sync) {
                    try {
                        return ['ok' => true, 'message' => $sync->client()->ping()];
                    } catch (\Throwable $e) {
                        return ['ok' => false, 'message' => $e->getMessage()];
                    }
                })(),
                'articles' => $sync->syncArticles($req->str('full') === '1'),
                'stock' => $sync->syncStock(),
                'prices' => $sync->syncPrices(),
                'outbox' => $sync->processOutbox(),
                default => ['ok' => false, 'message' => 'unknown job'],
            };
            flash($res['ok'] ? 'success' : 'error', strtoupper($job) . ': ' . $res['message']);
            return redirect('/admin/vinx');
        }, ['admin']);

        $app->router->post('/admin/vinx/retry/{id}', function (Request $req, array $p) use ($app) {
            $app->get(SyncService::class)->retry((int) $p['id']);
            flash('success', 'Queued for retry');
            return redirect('/admin/vinx');
        }, ['admin']);
    }

    /** Called by bin/console and public/cron.php */
    public static function runScheduled(App $app, array $jobs = ['outbox', 'stock', 'prices', 'articles']): array
    {
        if (!$app->has(SyncService::class)) {
            return ['vinx' => ['ok' => false, 'message' => 'vinx module disabled']];
        }
        $sync = $app->get(SyncService::class);
        $out = [];
        foreach ($jobs as $job) {
            $out[$job] = match ($job) {
                'outbox' => $sync->processOutbox(),
                'stock' => $sync->syncStock(),
                'prices' => $sync->syncPrices(),
                'articles' => $sync->syncArticles(),
                'articles:full' => $sync->syncArticles(true),
                default => ['ok' => false, 'message' => "unknown job $job"],
            };
        }
        return $out;
    }
}
