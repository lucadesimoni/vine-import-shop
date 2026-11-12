<?php
declare(strict_types=1);

namespace App\Shop;

use App\Core\App;
use App\Shop\Payment\PaymentRegistry;

/** Domain services shared by all modules. Swap any of them via $app->set(). */
final class ShopServices
{
    public static function register(App $app): void
    {
        $cfg = $app->config;
        $app->set(Catalog::class, fn (App $a) => new Catalog($a->db()));
        $app->set(Pricing::class, fn (App $a) => new Pricing($a->db(), (array) $cfg->get('tax', ['standard' => 8.1, 'reduced' => 2.6])));
        $app->set(Shipping::class, fn () => new Shipping((array) $cfg->get('shipping', [])));
        $app->set(Cart::class, fn (App $a) => new Cart($a->db(), $a->get(Pricing::class), $a->get(Shipping::class)));
        $app->set(OrderService::class, fn (App $a) => new OrderService($a->db(), $a->events, (string) $cfg->get('shop.order_prefix', 'WS')));
        $app->set(PaymentRegistry::class, fn () => new PaymentRegistry((array) $cfg->get('payment.providers', [])));
    }
}
