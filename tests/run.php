<?php
declare(strict_types=1);

/*
 * Dependency-free test runner: php tests/run.php
 * Uses an in-memory-like temp SQLite DB with demo data.
 */

$tmp = sys_get_temp_dir() . '/shop-test-' . getmypid() . '.sqlite';
putenv("DB_PATH=$tmp");
putenv('DB_DRIVER=sqlite');
putenv('VINX_DRIVER=mock');
putenv('MAIL_DRIVER=log');
putenv('ADMIN_PASSWORD=test-admin-pw');

/** @var App\Core\App $app */
$app = require __DIR__ . '/../app/bootstrap.php';
App\Core\Installer::install($app, true);

use App\Modules\Vinx\Mapper;
use App\Modules\Vinx\SyncService;
use App\Shop\Cart;
use App\Shop\Pricing;

$pass = $fail = 0;
function check(string $name, bool $cond, string $info = ''): void
{
    global $pass, $fail;
    if ($cond) {
        $pass++;
        echo "  ✓ $name\n";
    } else {
        $fail++;
        echo "  ✗ $name $info\n";
    }
}

$db = $app->db();
$pricing = $app->get(Pricing::class);
$retail = $db->one("SELECT * FROM customer_groups WHERE code = 'retail'");
$b2b = $db->one("SELECT * FROM customer_groups WHERE code = 'b2b'");
$barolo = $db->one("SELECT * FROM products WHERE sku = 'W-1003'");
$oil = $db->one("SELECT * FROM products WHERE sku = 'S-1001'");

echo "Pricing\n";
$p = $pricing->price($barolo, $retail);
check('retail gross equals list price', $p['gross'] === 6900, (string) $p['gross']);
check('retail net = gross / 1.081', $p['net'] === (int) round(6900 / 1.081), (string) $p['net']);
check('wine uses standard VAT 8.1', $p['tax_rate'] === 8.1);
check('food uses reduced VAT 2.6', $pricing->price($oil, $retail)['tax_rate'] === 2.6);
$b1 = $pricing->price($barolo, $b2b, 1);
$b12 = $pricing->price($barolo, $b2b, 12);
$b60 = $pricing->price($barolo, $b2b, 60);
check('b2b displays net', $b1['display_mode'] === 'net' && $b1['display'] === $b1['net']);
check('tier price decreases with qty', $b1['net'] > $b12['net'] && $b12['net'] > $b60['net'], "{$b1['net']} {$b12['net']} {$b60['net']}");
check('b2b falls back to group discount without list price', $pricing->price($oil, $b2b)['net'] === (int) round(round(2400 / 1.026) * 0.85));

echo "Helpers\n";
check('money Swiss format', money(123450) === "CHF 1'234.50", money(123450));
check('round5 rounds to 5 Rappen', round5(1233) === 1235 && round5(1232) === 1230);
check('slugify umlauts', slugify('Grüner Veltliner Würzburg') === 'gruener-veltliner-wuerzburg');

echo "Cart\n";
$cart = $app->get(Cart::class);
$cart->clear();
$cart->add((int) $barolo['id'], 2);
$cart->add((int) $oil['id'], 1);
$s = $cart->summary($retail, 'post');
check('subtotal gross', $s['subtotal_gross'] === 2 * 6900 + 2400, (string) $s['subtotal_gross']);
check('shipping post for 3 units', $s['shipping_gross'] === 1200, (string) $s['shipping_gross']);
check('two VAT rates reported', isset($s['taxes']['8.1'], $s['taxes']['2.6']), json_encode($s['taxes']));
check('total is rounded to 5 Rappen', $s['total_gross'] % 5 === 0);
check('age restricted (contains wine)', $s['age_restricted'] === true);
$cart->set((int) $barolo['id'], 4);
$s = $cart->summary($retail, 'post');
check('free shipping above threshold', $s['shipping_gross'] === 0, (string) $s['shipping_gross']);
check('b2b-only delivery hidden for retail', !isset($s['shipping_methods']['delivery']));
$sb = $cart->summary($b2b, 'post');
check('b2b minimum order flagged', $sb['below_minimum'] === false || $sb['subtotal_net'] < (int) $b2b['min_order_net']);
$cart->clear();

echo "vinX mapper\n";
$m = new Mapper((array) config('vinx.mapping'));
$a = $m->article(['ArtikelNr' => 'X-1', 'Bezeichnung' => 'Test Rosso', 'VerkaufspreisInkl' => "1'234,50", 'InhaltCl' => '75', 'Weinfarbe' => 'Rot', 'MwstCode' => 'R', 'Webshop' => 'ja', 'LagerVerfuegbar' => '12']);
check('sku mapped', $a['sku'] === 'X-1');
check('price parsed from Swiss format', $a['fields']['price_gross'] === 123450, (string) ($a['fields']['price_gross'] ?? ''));
check('cl converted to ml', $a['fields']['volume_ml'] === 750);
check('colour mapped', $a['fields']['color'] === 'red');
check('tax code mapped', $a['fields']['tax_class'] === 'reduced');
check('active flag parsed', $a['fields']['active'] === 1);

echo "vinX sync (mock)\n";
$sync = $app->get(SyncService::class);
$r = $sync->syncStock();
check('stock sync ok', $r['ok'] && $r['items'] > 0, $r['message']);
$r = $sync->syncPrices();
check('price sync ok', $r['ok'] && $r['items'] > 0, $r['message']);
$r = $sync->syncArticles(true);
check('article sync ok', $r['ok'], $r['message']);
$desc = $db->value("SELECT description_json FROM products WHERE sku = 'W-1003'");
check('rich content preserved by sync', str_contains((string) $desc, 'Granatrot'));

echo "Order + outbox\n";
$cart->add((int) $barolo['id'], 1);
$sum = $cart->summary($retail, 'pickup');
$order = $app->get(App\Shop\OrderService::class)->place($sum, [
    'email' => 't@example.com', 'billing' => ['name' => 'T', 'street' => 'S', 'zip' => '8000', 'city' => 'Z', 'country' => 'CH'],
    'shipping' => null, 'payment_method' => 'prepayment',
], null, $retail);
check('order number format', (bool) preg_match('/^WS-\d{4}-\d{6}$/', $order['number']), $order['number']);
check('order queued for vinX', (int) $db->value("SELECT COUNT(*) FROM erp_outbox WHERE type = 'order' AND ref_id = ?", [$order['id']]) === 1);
$r = $sync->processOutbox();
check('outbox delivered', $r['ok'] && $db->value('SELECT erp_status FROM orders WHERE id = ?', [$order['id']]) === 'transferred', $r['message']);

@unlink($tmp);
echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
