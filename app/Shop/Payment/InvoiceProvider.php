<?php
declare(strict_types=1);

namespace App\Shop\Payment;

use App\Core\Request;
use App\Core\Response;

/** Purchase on account — default for approved B2B customers (vinX issues the invoice / QR-bill). */
final class InvoiceProvider implements PaymentProvider
{
    public function __construct(private array $cfg = [])
    {
    }

    public function code(): string
    {
        return 'invoice';
    }

    public function label(): string
    {
        return t('payment.invoice');
    }

    public function description(): string
    {
        return t('payment.invoice_desc', ['days' => (string) ($this->cfg['terms_days'] ?? 30)]);
    }

    public function available(array $group, ?array $user, array $summary): bool
    {
        if ((int) ($group['is_b2b'] ?? 0) === 1) {
            return true;
        }
        // Optional: allow invoice for known retail customers.
        return (bool) ($this->cfg['allow_b2c_logged_in'] ?? false) && $user !== null;
    }

    public function start(array $order): ?Response
    {
        return null;
    }

    public function webhook(Request $request): Response
    {
        return Response::json(['ok' => true]);
    }
}
