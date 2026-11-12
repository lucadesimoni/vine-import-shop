<?php
declare(strict_types=1);

namespace App\Modules\Vinx;

/** Translates raw ERP records into shop rows according to config mapping. */
final class Mapper
{
    public function __construct(private array $mapping)
    {
    }

    public static function pick(array $row, ?string $path): mixed
    {
        if ($path === null || $path === '') {
            return null;
        }
        $v = $row;
        foreach (explode('.', $path) as $seg) {
            if (!is_array($v) || !array_key_exists($seg, $v)) {
                return null;
            }
            $v = $v[$seg];
        }
        return is_string($v) ? trim($v) : $v;
    }

    public static function decimal(mixed $v): ?float
    {
        if ($v === null || $v === '') {
            return null;
        }
        // Accept 1'234.50, 1234,50, "CHF 12.50"
        $s = str_replace(["'", '’', ' ', 'CHF'], '', (string) $v);
        if (str_contains($s, ',') && !str_contains($s, '.')) {
            $s = str_replace(',', '.', $s);
        }
        return is_numeric($s) ? (float) $s : null;
    }

    /** @return array{sku:string, fields:array, producer:?string, category:?string} */
    public function article(array $row): array
    {
        $m = $this->mapping['article'] ?? [];
        $get = fn (string $k) => self::pick($row, $m[$k] ?? null);

        $names = array_filter([
            'de' => $get('name'),
            'fr' => $get('name_fr'),
            'it' => $get('name_it'),
            'en' => $get('name_en'),
        ], fn ($v) => $v !== null && $v !== '');

        $fields = [];
        if ($names) {
            $fields['name_json'] = json_encode($names, JSON_UNESCAPED_UNICODE);
        }
        foreach (['country', 'region', 'appellation', 'grapes', 'vintage'] as $k) {
            $v = $get($k);
            if ($v !== null && $v !== '') {
                $fields[$k] = (string) $v;
            }
        }
        if (($cl = self::decimal($get('volume_ml'))) !== null) {
            $fields['volume_ml'] = (int) round($cl * 10);
        }
        if (($a = self::decimal($get('alcohol'))) !== null) {
            $fields['alcohol'] = $a;
        }
        if (($c = $get('color')) !== null) {
            $fields['color'] = $this->mapping['color_map'][$c] ?? null;
        }
        if (($p = self::decimal($get('price_gross'))) !== null) {
            $fields['price_gross'] = (int) round($p * 100);
        }
        if (($t = $get('tax_class')) !== null) {
            $fields['tax_class'] = $this->mapping['tax_map'][(string) $t] ?? 'standard';
        }
        if (($cs = $get('case_size')) !== null && (int) $cs > 0) {
            $fields['case_size'] = (int) $cs;
        }
        if (($s = $get('stock')) !== null) {
            $fields['stock'] = max(0, (int) self::decimal($s));
        }
        if (($act = $get('active')) !== null) {
            $fields['active'] = in_array(strtolower((string) $act), ['1', 'true', 'ja', 'yes', 'j', 'x'], true) ? 1 : 0;
        }
        if (($erp = $get('erp_id')) !== null) {
            $fields['erp_id'] = (string) $erp;
        }

        return [
            'sku' => (string) $get('sku'),
            'fields' => $fields,
            'producer' => $get('producer') ? (string) $get('producer') : null,
            'category' => $get('category') ? (string) $get('category') : null,
        ];
    }

    /** @return array{sku:string, stock:int} */
    public function stock(array $row): array
    {
        $m = $this->mapping['stock'] ?? [];
        return ['sku' => (string) self::pick($row, $m['sku'] ?? 'sku'), 'stock' => max(0, (int) self::decimal(self::pick($row, $m['stock'] ?? 'stock')))];
    }

    /** @return array{sku:string, group:string, min_qty:int, price_net:int} */
    public function price(array $row): array
    {
        $m = $this->mapping['price'] ?? [];
        return [
            'sku' => (string) self::pick($row, $m['sku'] ?? 'sku'),
            'group' => (string) self::pick($row, $m['group'] ?? 'group'),
            'min_qty' => max(1, (int) (self::pick($row, $m['min_qty'] ?? 'min_qty') ?: 1)),
            'price_net' => (int) round((self::decimal(self::pick($row, $m['price_net'] ?? 'price_net')) ?? 0) * 100),
        ];
    }
}
