<?php
declare(strict_types=1);

namespace App\Shop\Payment;

final class PaymentRegistry
{
    /** @var array<string, PaymentProvider> */
    private array $providers = [];

    public function __construct(array $config)
    {
        foreach ($config as $class => $cfg) {
            if (class_exists($class) && ($cfg['enabled'] ?? true)) {
                $p = new $class($cfg);
                $this->providers[$p->code()] = $p;
            }
        }
    }

    /** @return array<string, PaymentProvider> */
    public function available(array $group, ?array $user, array $summary): array
    {
        return array_filter($this->providers, fn (PaymentProvider $p) => $p->available($group, $user, $summary));
    }

    public function get(string $code): ?PaymentProvider
    {
        return $this->providers[$code] ?? null;
    }
}
