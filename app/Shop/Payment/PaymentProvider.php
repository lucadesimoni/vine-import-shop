<?php
declare(strict_types=1);

namespace App\Shop\Payment;

use App\Core\Request;
use App\Core\Response;

/**
 * Add a payment method by implementing this interface and listing the class
 * in config['payment']['providers']. Examples to add: Payrexx/TWINT,
 * Datatrans, Saferpay, PostFinance Checkout, Mollie.
 */
interface PaymentProvider
{
    public function code(): string;

    public function label(): string;

    public function description(): string;

    /** Whether this method is offered for the given customer group / cart. */
    public function available(array $group, ?array $user, array $summary): bool;

    /** Start payment; return a redirect to an external page, or null if nothing to do. */
    public function start(array $order): ?Response;

    /** Handle provider callbacks (webhooks / return URLs). */
    public function webhook(Request $request): Response;
}
