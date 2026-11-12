<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Tiny event bus — the glue between modules.
 * e.g. Checkout emits 'order.placed'; Vinx queues the ERP push, Mail notifies.
 */
final class Events
{
    /** @var array<string, array<int, callable>> */
    private array $listeners = [];

    public function on(string $event, callable $listener): void
    {
        $this->listeners[$event][] = $listener;
    }

    public function emit(string $event, array $payload = []): void
    {
        foreach ($this->listeners[$event] ?? [] as $listener) {
            try {
                $listener($payload);
            } catch (\Throwable $e) {
                // A failing listener must never break checkout.
                error_log("[event:$event] " . $e->getMessage());
            }
        }
    }
}
