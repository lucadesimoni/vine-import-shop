<?php
declare(strict_types=1);

namespace App\Shop;

use App\Core\DB;
use App\Core\Session;

/**
 * Session cart (works without cookies-on-DB and on any host).
 * summary() is the single source of truth for totals — used by cart page,
 * mini-cart, checkout and order creation.
 */
final class Cart
{
    private const KEY = 'cart';

    public function __construct(private DB $db, private Pricing $pricing, private Shipping $shipping)
    {
    }

    /** @return array<int,int> productId => qty */
    public function items(): array
    {
        return (array) Session::get(self::KEY, []);
    }

    public function add(int $productId, int $qty): void
    {
        $items = $this->items();
        $items[$productId] = max(0, ($items[$productId] ?? 0) + $qty);
        $this->save($items);
    }

    public function set(int $productId, int $qty): void
    {
        $items = $this->items();
        $items[$productId] = $qty;
        $this->save($items);
    }

    public function remove(int $productId): void
    {
        $items = $this->items();
        unset($items[$productId]);
        $this->save($items);
    }

    public function clear(): void
    {
        Session::forget(self::KEY);
        Session::forget('coupon');
    }

    public function count(): int
    {
        return array_sum($this->items());
    }

    private function save(array $items): void
    {
        Session::set(self::KEY, array_filter($items, fn ($q) => $q > 0));
    }

    public function coupon(): ?array
    {
        $code = Session::get('coupon');
        if (!$code) {
            return null;
        }
        return $this->db->one('SELECT * FROM coupons WHERE code = ? AND active = 1', [$code]);
    }

    /**
     * @param array $group   customer group row
     * @param ?string $shippingMethod  selected method code
     * @param ?array $items  override items (e.g. reorder preview)
     */
    public function summary(array $group, ?string $shippingMethod = null, ?array $items = null): array
    {
        $items ??= $this->items();
        $lines = [];
        $subGross = $subNet = $units = $alcoholUnits = 0;
        $taxes = [];
        $ageRestricted = false;
        $warnings = [];

        if ($items) {
            $ids = array_keys($items);
            $in = implode(',', array_fill(0, count($ids), '?'));
            $rows = $this->db->all(
                "SELECT p.*, c.slug AS category_slug, pr.name AS producer_name FROM products p
                 LEFT JOIN categories c ON c.id = p.category_id
                 LEFT JOIN producers pr ON pr.id = p.producer_id
                 WHERE p.id IN ($in) AND p.active = 1",
                $ids
            );
            $this->pricing->preload($ids, (int) ($group['id'] ?? 0));
            foreach ($rows as $p) {
                $qty = (int) $items[(int) $p['id']];
                if ((int) $p['b2b_only'] === 1 && !(int) ($group['is_b2b'] ?? 0)) {
                    continue;
                }
                if ($qty > (int) $p['stock']) {
                    $warnings[] = ['sku' => $p['sku'], 'type' => 'stock', 'available' => (int) $p['stock']];
                }
                $price = $this->pricing->price($p, $group, $qty);
                $lineGross = $price['gross'] * $qty;
                $lineNet = $price['net'] * $qty;
                $subGross += $lineGross;
                $subNet += $lineNet;
                $units += $qty;
                if ($p['type'] !== 'speciality') {
                    $alcoholUnits += $qty;
                }
                $rateKey = (string) $price['tax_rate'];
                $taxes[$rateKey] = ($taxes[$rateKey] ?? 0) + ($lineGross - $lineNet);
                $ageRestricted = $ageRestricted || (int) $p['age_restricted'] === 1;
                $lines[] = [
                    'product' => $p,
                    'qty' => $qty,
                    'price' => $price,
                    'line_gross' => $lineGross,
                    'line_net' => $lineNet,
                ];
            }
        }

        // Coupon (B2C only by default).
        $discount = 0;
        $coupon = $this->coupon();
        if ($coupon) {
            $valid = (!$coupon['expires_at'] || $coupon['expires_at'] >= date('Y-m-d'))
                && $subGross >= (int) $coupon['min_total']
                && !((int) $coupon['b2c_only'] === 1 && (int) ($group['is_b2b'] ?? 0) === 1);
            if ($valid) {
                $discount = $coupon['type'] === 'percent'
                    ? (int) round($subGross * (int) $coupon['value'] / 100)
                    : min($subGross, (int) $coupon['value']);
            } else {
                $coupon = null;
            }
        }

        $context = ['subtotal_gross' => $subGross, 'subtotal_net' => $subNet, 'units' => $units, 'group' => $group];
        $methods = $this->shipping->methods($context);
        $selected = $shippingMethod && isset($methods[$shippingMethod]) && $methods[$shippingMethod]['available']
            ? $shippingMethod
            : (string) array_key_first(array_filter($methods, fn ($m) => $m['available']));
        $shippingGross = $selected !== '' ? $methods[$selected]['price'] : 0;
        $stdRate = (string) (float) config('tax.standard', 8.1);
        if ($shippingGross > 0) {
            $taxes[$stdRate] = ($taxes[$stdRate] ?? 0) + ($shippingGross - (int) round($shippingGross / (1 + (float) $stdRate / 100)));
        }

        // Discount reduces VAT proportionally.
        if ($discount > 0 && $subGross > 0) {
            foreach ($taxes as $rate => $amount) {
                $taxes[$rate] = (int) round($amount * (1 - $discount / max(1, $subGross + $shippingGross)));
            }
        }

        $total = round5($subGross - $discount + $shippingGross);
        $minOrder = (int) ($group['min_order_net'] ?? 0);

        return [
            'lines' => $lines,
            'units' => $units,
            'alcohol_units' => $alcoholUnits,
            'subtotal_gross' => $subGross,
            'subtotal_net' => $subNet,
            'discount' => $discount,
            'coupon' => $coupon,
            'shipping_methods' => $methods,
            'shipping_method' => $selected,
            'shipping_gross' => $shippingGross,
            'taxes' => $taxes,
            'tax_total' => array_sum($taxes),
            'total_gross' => $total,
            'total_net' => $total - array_sum($taxes),
            'display_mode' => ($group['price_display'] ?? 'gross') === 'net' ? 'net' : 'gross',
            'age_restricted' => $ageRestricted,
            'min_order_net' => $minOrder,
            'below_minimum' => $minOrder > 0 && $subNet < $minOrder,
            'warnings' => $warnings,
            'empty' => $lines === [],
        ];
    }
}
