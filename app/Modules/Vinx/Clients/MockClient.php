<?php
declare(strict_types=1);

namespace App\Modules\Vinx\Clients;

use App\Core\DB;
use App\Modules\Vinx\ErpClient;

/**
 * Demo driver: behaves like vinX without a connection. Generates ERP-shaped
 * records from the local catalog (with slightly changing stock) and writes
 * pushed orders to storage/vinx/outbox/mock-*.json. Lets you test the whole
 * sync pipeline end-to-end before the real interface is available.
 */
final class MockClient implements ErpClient
{
    public function __construct(private DB $db, private array $cfg)
    {
    }

    public function ping(): string
    {
        return 'Mock vinX OK (demo mode — no real ERP connected)';
    }

    public function articles(?string $since = null): iterable
    {
        $colorBack = array_flip($this->cfg['mapping']['color_map'] ?? []);
        foreach ($this->db->all('SELECT p.*, pr.name AS producer_name, c.slug AS cat FROM products p LEFT JOIN producers pr ON pr.id = p.producer_id LEFT JOIN categories c ON c.id = p.category_id') as $p) {
            $names = json_decode($p['name_json'], true) ?: [];
            yield [
                'ArtikelNr' => $p['sku'],
                'ArtikelId' => $p['erp_id'] ?: $p['sku'],
                'Bezeichnung' => $names['de'] ?? '',
                'Produzent' => $p['producer_name'],
                'Land' => $p['country'],
                'Region' => $p['region'],
                'Appellation' => $p['appellation'],
                'Traubensorten' => $p['grapes'],
                'Jahrgang' => $p['vintage'],
                'InhaltCl' => $p['volume_ml'] ? $p['volume_ml'] / 10 : null,
                'Alkohol' => $p['alcohol'],
                'Weinfarbe' => $colorBack[$p['color']] ?? null,
                'Warengruppe' => $p['cat'],
                'VerkaufspreisInkl' => number_format($p['price_gross'] / 100, 2, '.', ''),
                'MwstCode' => $p['tax_class'] === 'reduced' ? 'R' : 'N',
                'Kartoninhalt' => $p['case_size'],
                'LagerVerfuegbar' => (int) $p['stock'],
                'Webshop' => (int) $p['active'],
            ];
        }
    }

    public function stock(): iterable
    {
        foreach ($this->db->all('SELECT sku, stock FROM products') as $row) {
            // Simulate warehouse movements so the sync visibly does something.
            yield ['ArtikelNr' => $row['sku'], 'Verfuegbar' => max(0, (int) $row['stock'] + random_int(-6, 12))];
        }
    }

    public function prices(): iterable
    {
        $rows = $this->db->all('SELECT p.sku, g.erp_code, pr.min_qty, pr.price_net FROM prices pr JOIN products p ON p.id = pr.product_id JOIN customer_groups g ON g.id = pr.customer_group_id');
        foreach ($rows as $r) {
            yield ['ArtikelNr' => $r['sku'], 'Preisliste' => $r['erp_code'], 'AbMenge' => $r['min_qty'], 'PreisExkl' => number_format($r['price_net'] / 100, 2, '.', '')];
        }
    }

    public function pushOrder(array $payload): string
    {
        $id = 'VX-' . random_int(100000, 999999);
        $dir = $this->cfg['file']['outbox'] ?? BASE_PATH . '/storage/vinx/outbox';
        @mkdir($dir, 0775, true);
        file_put_contents($dir . '/mock-order-' . $payload['order']['number'] . '.json', json_encode($payload + ['erp_id' => $id], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        return $id;
    }

    public function pushCustomer(array $payload): string
    {
        return 'K-' . random_int(10000, 99999);
    }
}
