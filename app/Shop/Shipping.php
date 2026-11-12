<?php
declare(strict_types=1);

namespace App\Shop;

/**
 * Rule-based shipping, configured in config['shipping'].
 * Rates are by number of units (bottles/articles) — the usual model for
 * wine shipping in Switzerland (bottle cartons of 1/3/6/12).
 */
final class Shipping
{
    public function __construct(private array $config)
    {
    }

    /** @return array<string, array{label:string, price:int, available:bool, note:string}> */
    public function methods(array $ctx): array
    {
        $isB2B = (int) ($ctx['group']['is_b2b'] ?? 0) === 1;
        $out = [];
        foreach ($this->config['methods'] ?? [] as $code => $m) {
            if (($m['b2b_only'] ?? false) && !$isB2B) {
                continue;
            }
            if (($m['b2c_only'] ?? false) && $isB2B) {
                continue;
            }
            $price = (int) ($m['price'] ?? 0);
            foreach ($m['rates'] ?? [] as [$minUnits, $ratePrice]) {
                if ($ctx['units'] >= $minUnits) {
                    $price = (int) $ratePrice;
                }
            }
            $note = '';
            if (!$isB2B && isset($m['free_from_gross']) && $ctx['subtotal_gross'] >= $m['free_from_gross']) {
                $price = 0;
            }
            if ($isB2B && isset($m['b2b_free_from_net']) && $ctx['subtotal_net'] >= $m['b2b_free_from_net']) {
                $price = 0;
            }
            if (!$isB2B && isset($m['free_from_gross']) && $price > 0) {
                $note = t('shipping.free_from', ['amount' => money((int) $m['free_from_gross'])]);
            }
            $available = !isset($m['min_units']) || $ctx['units'] >= $m['min_units'];
            $out[$code] = [
                'label' => t($m['label'] ?? $code),
                'description' => isset($m['description']) ? t($m['description']) : '',
                'price' => $price,
                'available' => $available,
                'note' => $note,
            ];
        }
        return $out;
    }
}
