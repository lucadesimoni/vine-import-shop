<?php
declare(strict_types=1);

namespace App\Modules\Vinx;

/**
 * Contract between the shop and the ERP. Implementations return RAW ERP
 * records (associative arrays with the ERP's own field names); the Mapper
 * translates them using config['vinx']['mapping'].
 *
 * To support another ERP (Abacus, bexio, SAP B1 …) implement this interface
 * and set vinx.driver to your class name.
 */
interface ErpClient
{
    /** Verify credentials/connectivity. Returns a human-readable status. */
    public function ping(): string;

    /** @return iterable<array> article master data (optionally only changed since $since) */
    public function articles(?string $since = null): iterable;

    /** @return iterable<array> stock rows (sku + available) */
    public function stock(): iterable;

    /** @return iterable<array> price list rows (sku, list/group, min qty, net price) */
    public function prices(): iterable;

    /** Send an order. Returns the ERP's order id/number. */
    public function pushOrder(array $payload): string;

    /** Create/update a customer. Returns the ERP customer number. */
    public function pushCustomer(array $payload): string;
}
