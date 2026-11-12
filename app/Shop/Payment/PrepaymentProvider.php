<?php
declare(strict_types=1);

namespace App\Shop\Payment;

use App\Core\Request;
use App\Core\Response;

/** Bank transfer in advance; bank details shown on the confirmation page and in the email. */
final class PrepaymentProvider implements PaymentProvider
{
    public function __construct(private array $cfg = [])
    {
    }

    public function code(): string
    {
        return 'prepayment';
    }

    public function label(): string
    {
        return t('payment.prepayment');
    }

    public function description(): string
    {
        return t('payment.prepayment_desc');
    }

    public function available(array $group, ?array $user, array $summary): bool
    {
        return true;
    }

    public function start(array $order): ?Response
    {
        return null;
    }

    public function bankDetails(): array
    {
        return [
            'holder' => $this->cfg['holder'] ?? '',
            'iban' => $this->cfg['iban'] ?? '',
            'bank' => $this->cfg['bank'] ?? '',
        ];
    }

    public function webhook(Request $request): Response
    {
        return Response::json(['ok' => true]);
    }
}
