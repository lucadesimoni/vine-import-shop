<?php
declare(strict_types=1);

namespace App\Shop;

use App\Core\DB;

/**
 * Price resolution.
 *
 *  - products.price_gross   retail price incl. VAT (what B2C sees)
 *  - prices table           net group prices with quantity breaks (from vinX price lists)
 *  - customer_groups.discount_percent  fallback discount when no explicit list price
 *
 * Swiss VAT (2024+): standard 8.1 % (wine, spirits), reduced 2.6 % (food specialities).
 */
final class Pricing
{
    /** @var array<int, array<int, array>> productId => groupId => tiers */
    private array $tierCache = [];

    public function __construct(private DB $db, private array $taxRates)
    {
    }

    public function taxRate(array $product): float
    {
        return (float) ($this->taxRates[$product['tax_class'] ?? 'standard'] ?? $this->taxRates['standard'] ?? 8.1);
    }

    /** @return array<int, array{min_qty:int, price_net:int}> sorted ascending */
    public function tiers(int $productId, int $groupId): array
    {
        if (!isset($this->tierCache[$productId][$groupId])) {
            $this->tierCache[$productId][$groupId] = array_map(
                fn ($r) => ['min_qty' => (int) $r['min_qty'], 'price_net' => (int) $r['price_net']],
                $this->db->all(
                    'SELECT min_qty, price_net FROM prices WHERE product_id = ? AND customer_group_id = ? ORDER BY min_qty ASC',
                    [$productId, $groupId]
                )
            );
        }
        return $this->tierCache[$productId][$groupId];
    }

    /** Preload tiers for a list of products (avoids N+1 on listing pages). */
    public function preload(array $productIds, int $groupId): void
    {
        $ids = array_values(array_unique(array_map('intval', $productIds)));
        if (!$ids || !$groupId) {
            return;
        }
        foreach ($ids as $id) {
            $this->tierCache[$id][$groupId] ??= [];
        }
        $in = implode(',', array_fill(0, count($ids), '?'));
        $rows = $this->db->all(
            "SELECT product_id, min_qty, price_net FROM prices WHERE customer_group_id = ? AND product_id IN ($in) ORDER BY min_qty ASC",
            [$groupId, ...$ids]
        );
        foreach ($ids as $id) {
            $this->tierCache[$id][$groupId] = [];
        }
        foreach ($rows as $r) {
            $this->tierCache[(int) $r['product_id']][$groupId][] = ['min_qty' => (int) $r['min_qty'], 'price_net' => (int) $r['price_net']];
        }
    }

    /**
     * @return array{net:int, gross:int, tax_rate:float, list_gross:int, list_net:int, reduced:bool, display:int, display_mode:string, tiers:array}
     */
    public function price(array $product, array $group, int $qty = 1): array
    {
        $rate = $this->taxRate($product);
        $listGross = (int) $product['price_gross'];
        $listNet = (int) round($listGross / (1 + $rate / 100));
        $net = $listNet;

        $tiers = [];
        $gid = (int) ($group['id'] ?? 0);
        if ($gid) {
            $tiers = $this->tiers((int) $product['id'], $gid);
            $applicable = null;
            foreach ($tiers as $tier) {
                if ($qty >= $tier['min_qty']) {
                    $applicable = $tier;
                }
            }
            if ($applicable) {
                $net = $applicable['price_net'];
            } elseif ((float) ($group['discount_percent'] ?? 0) > 0) {
                $net = (int) round($listNet * (1 - (float) $group['discount_percent'] / 100));
            }
        }

        $gross = $net === $listNet ? $listGross : (int) round($net * (1 + $rate / 100));
        $mode = ($group['price_display'] ?? 'gross') === 'net' ? 'net' : 'gross';

        return [
            'net' => $net,
            'gross' => $gross,
            'tax_rate' => $rate,
            'list_gross' => $listGross,
            'list_net' => $listNet,
            'reduced' => $net < $listNet,
            'display' => $mode === 'net' ? $net : $gross,
            'display_mode' => $mode,
            'tiers' => $tiers,
        ];
    }
}
