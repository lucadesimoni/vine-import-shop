<?php
declare(strict_types=1);

namespace App\Shop\Payment;

use App\Core\App;
use App\Core\HttpClient;
use App\Core\Request;
use App\Core\Response;
use App\Shop\OrderService;

/**
 * Stripe Checkout (cards, Apple Pay, Google Pay, TWINT where enabled in your
 * Stripe dashboard). Uses the REST API via cURL — no SDK needed.
 * Configure STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET; the webhook URL is
 * /api/payment/stripe/webhook (event: checkout.session.completed).
 */
final class StripeProvider implements PaymentProvider
{
    public function __construct(private array $cfg = [])
    {
    }

    public function code(): string
    {
        return 'stripe';
    }

    public function label(): string
    {
        return t('payment.card');
    }

    public function description(): string
    {
        return t('payment.card_desc');
    }

    public function available(array $group, ?array $user, array $summary): bool
    {
        return !empty($this->cfg['secret_key']);
    }

    public function start(array $order): ?Response
    {
        $done = absolute_url('/checkout/done/' . $order['number']) . '?t=' . $order['access_token'];
        $body = [
            'mode' => 'payment',
            'customer_email' => $order['email'],
            'client_reference_id' => $order['number'],
            'success_url' => $done . '&paid=1',
            'cancel_url' => absolute_url('/checkout') . '?cancelled=1',
            'metadata[order_number]' => $order['number'],
            'line_items[0][quantity]' => 1,
            'line_items[0][price_data][currency]' => strtolower($order['currency']),
            'line_items[0][price_data][unit_amount]' => $order['total_gross'],
            'line_items[0][price_data][product_data][name]' => t('payment.order_label', ['number' => $order['number']]),
        ];
        foreach (($this->cfg['payment_method_types'] ?? []) as $i => $type) {
            $body["payment_method_types[$i]"] = $type;
        }
        $res = (new HttpClient())->request('POST', 'https://api.stripe.com/v1/checkout/sessions', [
            'Authorization' => 'Bearer ' . $this->cfg['secret_key'],
        ], $body, true);

        if ($res['status'] >= 300 || empty($res['json']['url'])) {
            error_log('[stripe] ' . $res['body']);
            flash('error', t('payment.failed'));
            return redirect('/checkout/done/' . $order['number'], ['t' => $order['access_token']]);
        }
        App::instance()->db()->update('orders', ['payment_ref' => $res['json']['id']], 'id = ?', [$order['id']]);
        return Response::redirect($res['json']['url'], 303);
    }

    public function webhook(Request $request): Response
    {
        $secret = (string) ($this->cfg['webhook_secret'] ?? '');
        $sig = (string) $request->header('Stripe-Signature');
        if ($secret === '' || !$this->verify($request->body, $sig, $secret)) {
            return Response::json(['error' => 'invalid signature'], 400);
        }
        $event = json_decode($request->body, true);
        if (($event['type'] ?? '') === 'checkout.session.completed') {
            $session = $event['data']['object'] ?? [];
            $number = $session['metadata']['order_number'] ?? $session['client_reference_id'] ?? null;
            if ($number && ($session['payment_status'] ?? '') === 'paid') {
                $orders = App::instance()->get(OrderService::class);
                $order = $orders->findByNumber($number);
                if ($order && $order['payment_status'] !== 'paid') {
                    $orders->markPaid((int) $order['id'], (string) ($session['payment_intent'] ?? $session['id']));
                }
            }
        }
        return Response::json(['received' => true]);
    }

    private function verify(string $payload, string $header, string $secret): bool
    {
        $parts = [];
        foreach (explode(',', $header) as $kv) {
            [$k, $v] = array_pad(explode('=', $kv, 2), 2, '');
            $parts[$k][] = $v;
        }
        $ts = $parts['t'][0] ?? '';
        if ($ts === '' || abs(time() - (int) $ts) > 300) {
            return false;
        }
        $expected = hash_hmac('sha256', $ts . '.' . $payload, $secret);
        foreach ($parts['v1'] ?? [] as $sig) {
            if (hash_equals($expected, $sig)) {
                return true;
            }
        }
        return false;
    }
}
