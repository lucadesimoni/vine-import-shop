<?php
declare(strict_types=1);

namespace App\Modules\Vinx;

use App\Core\DB;

/**
 * vinX is the master for articles, stock and prices; the shop is the master
 * for rich content (texts, images, SEO). Orders/customers flow shop → vinX
 * through a persistent outbox with retries, so nothing is lost if the ERP
 * is offline.
 */
final class SyncService
{
    private Mapper $mapper;

    public function __construct(private DB $db, private ErpClient $client, private array $cfg)
    {
        $this->mapper = new Mapper($cfg['mapping'] ?? []);
    }

    public function client(): ErpClient
    {
        return $this->client;
    }

    /** Wrap a job with sync_log bookkeeping. */
    private function job(string $name, callable $fn): array
    {
        $logId = $this->db->insert('sync_log', ['job' => $name, 'status' => 'running', 'started_at' => DB::now()]);
        try {
            [$count, $message] = $fn();
            $this->db->update('sync_log', ['status' => 'ok', 'items' => $count, 'message' => $message, 'finished_at' => DB::now()], 'id = ?', [$logId]);
            return ['ok' => true, 'items' => $count, 'message' => $message];
        } catch (\Throwable $e) {
            $this->db->update('sync_log', ['status' => 'error', 'message' => mb_substr($e->getMessage(), 0, 2000), 'finished_at' => DB::now()], 'id = ?', [$logId]);
            return ['ok' => false, 'items' => 0, 'message' => $e->getMessage()];
        }
    }

    public function lastSuccess(string $job): ?string
    {
        return $this->db->value("SELECT MAX(started_at) FROM sync_log WHERE job = ? AND status = 'ok'", [$job]);
    }

    public function syncArticles(bool $full = false): array
    {
        return $this->job('articles', function () use ($full) {
            $since = $full ? null : $this->lastSuccess('articles');
            $owned = array_flip($this->cfg['owned_fields'] ?? []);
            $created = $updated = $skipped = 0;
            foreach ($this->client->articles($since) as $raw) {
                $a = $this->mapper->article($raw);
                if ($a['sku'] === '') {
                    $skipped++;
                    continue;
                }
                $fields = array_intersect_key($a['fields'], $owned + ['erp_id' => 1]);
                $existing = $this->db->one('SELECT id FROM products WHERE sku = ?', [$a['sku']]);
                if ($a['producer']) {
                    $fields['producer_id'] = $this->producerId($a['producer'], $a['fields']['region'] ?? null, $a['fields']['country'] ?? null);
                }
                if ($a['category'] && ($catId = $this->categoryId($a['category']))) {
                    $fields['category_id'] = $catId;
                }
                $fields['synced_at'] = DB::now();
                if ($existing) {
                    $fields['updated_at'] = DB::now();
                    $this->db->update('products', $fields, 'id = ?', [$existing['id']]);
                    $updated++;
                } else {
                    $name = $a['fields']['name_json'] ?? json_encode(['de' => $a['sku']]);
                    $type = isset($fields['category_id'])
                        ? (string) $this->db->value('SELECT type FROM categories WHERE id = ?', [$fields['category_id']])
                        : (isset($a['fields']['color']) ? 'wine' : 'speciality');
                    $this->db->insert('products', $fields + [
                        'sku' => $a['sku'],
                        'slug' => $this->uniqueSlug(slugify((json_decode((string) $name, true)['de'] ?? $a['sku']) . ' ' . ($a['fields']['vintage'] ?? ''))),
                        'name_json' => $name,
                        'type' => $type ?: 'wine',
                        'age_restricted' => $type === 'speciality' ? 0 : 1,
                        'tax_class' => $a['fields']['tax_class'] ?? ($type === 'speciality' ? 'reduced' : 'standard'),
                        'active' => $a['fields']['active'] ?? 1,
                        'created_at' => DB::now(),
                    ]);
                    $created++;
                }
            }
            return [$created + $updated, "created $created, updated $updated, skipped $skipped" . ($since ? " (delta since $since)" : ' (full)')];
        });
    }

    public function syncStock(): array
    {
        return $this->job('stock', function () {
            $n = 0;
            $stmt = $this->db->pdo->prepare('UPDATE products SET stock = ?, synced_at = ? WHERE sku = ?');
            $now = DB::now();
            $this->db->pdo->beginTransaction();
            foreach ($this->client->stock() as $raw) {
                $s = $this->mapper->stock($raw);
                if ($s['sku'] !== '') {
                    $stmt->execute([$s['stock'], $now, $s['sku']]);
                    $n += $stmt->rowCount();
                }
            }
            $this->db->pdo->commit();
            return [$n, "$n articles updated"];
        });
    }

    public function syncPrices(): array
    {
        return $this->job('prices', function () {
            $groupMap = $this->cfg['group_map'] ?? [];
            $groups = [];
            foreach ($this->db->all('SELECT id, code, erp_code FROM customer_groups') as $g) {
                $groups[$g['code']] = (int) $g['id'];
                if ($g['erp_code']) {
                    $groups['erp:' . $g['erp_code']] = (int) $g['id'];
                }
            }
            $products = [];
            foreach ($this->db->all('SELECT id, sku FROM products') as $p) {
                $products[$p['sku']] = (int) $p['id'];
            }
            $rows = [];
            foreach ($this->client->prices() as $raw) {
                $p = $this->mapper->price($raw);
                $gid = $groups[$groupMap[$p['group']] ?? ''] ?? $groups['erp:' . $p['group']] ?? null;
                $pid = $products[$p['sku']] ?? null;
                if ($gid && $pid && $p['price_net'] > 0) {
                    $rows["$pid:$gid"][] = [$p['min_qty'], $p['price_net']];
                }
            }
            $n = 0;
            $this->db->transaction(function (DB $db) use ($rows, &$n) {
                foreach ($rows as $key => $tiers) {
                    [$pid, $gid] = array_map('intval', explode(':', $key));
                    $db->run('DELETE FROM prices WHERE product_id = ? AND customer_group_id = ?', [$pid, $gid]);
                    foreach ($tiers as [$min, $net]) {
                        $db->insert('prices', ['product_id' => $pid, 'customer_group_id' => $gid, 'min_qty' => $min, 'price_net' => $net]);
                        $n++;
                    }
                }
            });
            return [$n, "$n price rows for " . count($rows) . ' article/list combinations'];
        });
    }

    // ---- outbound -------------------------------------------------------

    public function enqueue(string $type, int $refId, array $payload): void
    {
        $this->db->insert('erp_outbox', [
            'type' => $type, 'ref_id' => $refId, 'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
            'status' => 'pending', 'created_at' => DB::now(), 'next_attempt_at' => DB::now(),
        ]);
    }

    public function orderPayload(array $order): array
    {
        $customerErp = $order['user_id'] ? $this->db->value('SELECT erp_id FROM users WHERE id = ?', [$order['user_id']]) : null;
        $priceList = $order['customer_group_id'] ? $this->db->value('SELECT erp_code FROM customer_groups WHERE id = ?', [$order['customer_group_id']]) : null;
        return [
            'order' => array_intersect_key($order, array_flip([
                'number', 'created_at', 'email', 'payment_method', 'payment_status', 'shipping_method', 'currency',
                'subtotal_net', 'subtotal_gross', 'shipping_gross', 'discount_gross', 'tax_total', 'total_gross',
                'po_number', 'delivery_date', 'notes', 'is_b2b', 'locale', 'coupon_code',
            ])) + ['customer_erp_id' => $customerErp, 'price_list' => $priceList],
            'billing' => json_decode((string) $order['billing_json'], true),
            'shipping' => json_decode((string) ($order['shipping_json'] ?? 'null'), true) ?: json_decode((string) $order['billing_json'], true),
            'items' => array_map(fn ($i) => [
                'sku' => $i['sku'], 'name' => $i['name'], 'qty' => (int) $i['qty'],
                'unit_net' => (int) $i['unit_net'], 'unit_gross' => (int) $i['unit_gross'], 'tax_rate' => (float) $i['tax_rate'],
            ], $order['items'] ?? []),
        ];
    }

    public function processOutbox(int $limit = 50): array
    {
        return $this->job('outbox', function () use ($limit) {
            $max = (int) ($this->cfg['max_attempts'] ?? 8);
            $rows = $this->db->all(
                "SELECT * FROM erp_outbox WHERE status IN ('pending','retry') AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY id LIMIT " . (int) $limit,
                [DB::now()]
            );
            $sent = $failed = 0;
            foreach ($rows as $row) {
                $payload = json_decode($row['payload'], true) ?: [];
                try {
                    if ($row['type'] === 'order') {
                        $erpId = $this->client->pushOrder($payload);
                        $this->db->update('orders', ['erp_id' => $erpId ?: null, 'erp_status' => 'transferred'], 'id = ?', [$row['ref_id']]);
                    } elseif ($row['type'] === 'customer') {
                        $erpId = $this->client->pushCustomer($payload);
                        if ($erpId) {
                            $this->db->update('users', ['erp_id' => $erpId], 'id = ?', [$row['ref_id']]);
                        }
                    }
                    $this->db->update('erp_outbox', ['status' => 'sent', 'sent_at' => DB::now(), 'attempts' => $row['attempts'] + 1, 'last_error' => null], 'id = ?', [$row['id']]);
                    $sent++;
                } catch (\Throwable $e) {
                    $attempts = (int) $row['attempts'] + 1;
                    $delay = min(3600 * 6, 60 * (2 ** $attempts)); // exponential backoff
                    $this->db->update('erp_outbox', [
                        'status' => $attempts >= $max ? 'failed' : 'retry',
                        'attempts' => $attempts,
                        'last_error' => mb_substr($e->getMessage(), 0, 2000),
                        'next_attempt_at' => date('Y-m-d H:i:s', time() + $delay),
                    ], 'id = ?', [$row['id']]);
                    if ($row['type'] === 'order' && $attempts >= $max) {
                        $this->db->update('orders', ['erp_status' => 'failed'], 'id = ?', [$row['ref_id']]);
                    }
                    $failed++;
                }
            }
            return [$sent, "sent $sent, failed $failed"];
        });
    }

    public function retry(int $outboxId): void
    {
        $this->db->update('erp_outbox', ['status' => 'retry', 'next_attempt_at' => DB::now()], 'id = ?', [$outboxId]);
    }

    // ---- helpers --------------------------------------------------------

    private function producerId(string $name, ?string $region, ?string $country): int
    {
        $id = $this->db->value('SELECT id FROM producers WHERE name = ?', [$name]);
        if ($id) {
            return (int) $id;
        }
        return $this->db->insert('producers', [
            'slug' => $this->uniqueSlug(slugify($name), 'producers'), 'name' => $name, 'region' => $region, 'country' => $country,
        ]);
    }

    private function categoryId(string $code): ?int
    {
        $id = $this->db->value('SELECT id FROM categories WHERE slug = ? OR LOWER(name_json) LIKE ?', [slugify($code), '%"' . mb_strtolower($code) . '"%']);
        return $id ? (int) $id : null;
    }

    private function uniqueSlug(string $slug, string $table = 'products'): string
    {
        $base = $slug;
        $i = 2;
        while ($this->db->value("SELECT id FROM $table WHERE slug = ?", [$slug])) {
            $slug = $base . '-' . $i++;
        }
        return $slug;
    }
}
