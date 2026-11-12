<?php
declare(strict_types=1);

namespace App\Shop;

use App\Core\DB;
use App\Core\Events;

final class OrderService
{
    public function __construct(private DB $db, private Events $events, private string $prefix = 'WS')
    {
    }

    /**
     * Persist an order from a cart summary. Stock is reserved (decremented)
     * locally; vinX remains the master and corrects stock on the next sync.
     */
    public function place(array $summary, array $data, ?array $user, array $group): array
    {
        $order = $this->db->transaction(function (DB $db) use ($summary, $data, $user, $group) {
            $now = DB::now();
            $id = $db->insert('orders', [
                'number' => 'TMP-' . bin2hex(random_bytes(6)),
                'access_token' => bin2hex(random_bytes(20)),
                'user_id' => $user['id'] ?? null,
                'customer_group_id' => $group['id'] ?: null,
                'is_b2b' => (int) ($group['is_b2b'] ?? 0),
                'email' => $data['email'],
                'status' => 'new',
                'payment_method' => $data['payment_method'],
                'payment_status' => 'pending',
                'shipping_method' => $summary['shipping_method'],
                'currency' => (string) config('app.currency', 'CHF'),
                'subtotal_net' => $summary['subtotal_net'],
                'subtotal_gross' => $summary['subtotal_gross'],
                'shipping_gross' => $summary['shipping_gross'],
                'discount_gross' => $summary['discount'],
                'tax_total' => $summary['tax_total'],
                'total_gross' => $summary['total_gross'],
                'coupon_code' => $summary['coupon']['code'] ?? null,
                'billing_json' => json_encode($data['billing'], JSON_UNESCAPED_UNICODE),
                'shipping_json' => $data['shipping'] ? json_encode($data['shipping'], JSON_UNESCAPED_UNICODE) : null,
                'notes' => $data['notes'] ?? null,
                'po_number' => $data['po_number'] ?? null,
                'delivery_date' => $data['delivery_date'] ?? null,
                'locale' => locale(),
                'erp_status' => 'pending',
                'created_at' => $now,
            ]);
            $number = sprintf('%s-%s-%06d', $this->prefix, date('Y'), $id);
            $db->update('orders', ['number' => $number], 'id = ?', [$id]);

            foreach ($summary['lines'] as $line) {
                $p = $line['product'];
                $db->insert('order_items', [
                    'order_id' => $id,
                    'product_id' => $p['id'],
                    'sku' => $p['sku'],
                    'name' => tf($p['name_json']) . ($p['vintage'] && $p['vintage'] !== 'NV' ? ' ' . $p['vintage'] : ''),
                    'qty' => $line['qty'],
                    'unit_net' => $line['price']['net'],
                    'unit_gross' => $line['price']['gross'],
                    'tax_rate' => $line['price']['tax_rate'],
                    'line_gross' => $line['line_gross'],
                ]);
                $db->run('UPDATE products SET stock = CASE WHEN stock >= ? THEN stock - ? ELSE 0 END WHERE id = ?', [$line['qty'], $line['qty'], $p['id']]);
            }
            return $this->find($id);
        });

        $this->events->emit('order.placed', ['order' => $order]);
        return $order;
    }

    public function find(int $id): ?array
    {
        $o = $this->db->one('SELECT * FROM orders WHERE id = ?', [$id]);
        if ($o) {
            $o['items'] = $this->db->all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [$id]);
        }
        return $o;
    }

    public function findByNumber(string $number): ?array
    {
        $id = $this->db->value('SELECT id FROM orders WHERE number = ?', [$number]);
        return $id ? $this->find((int) $id) : null;
    }

    public function setStatus(int $id, string $status): void
    {
        $this->db->update('orders', ['status' => $status, 'updated_at' => DB::now()], 'id = ?', [$id]);
        $this->events->emit('order.status', ['order_id' => $id, 'status' => $status]);
    }

    public function markPaid(int $id, string $ref = ''): void
    {
        $this->db->update('orders', ['payment_status' => 'paid', 'payment_ref' => $ref, 'updated_at' => DB::now()], 'id = ?', [$id]);
        $this->events->emit('order.paid', ['order' => $this->find($id)]);
    }

    public static function statuses(): array
    {
        return ['new', 'confirmed', 'processing', 'shipped', 'completed', 'cancelled'];
    }
}
