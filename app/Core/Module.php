<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Every feature is a module. Enable/disable in config['modules'].
 * A module registers routes, services, event listeners and admin menu items.
 */
interface Module
{
    public function name(): string;

    public function register(App $app): void;
}
