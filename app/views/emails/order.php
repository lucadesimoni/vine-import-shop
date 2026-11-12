<?php /** @var array $order @var array $bank @var bool $internal */ $b = json_field($order['billing_json']); $internal = $internal ?? false; ?>
<h1 style="font-family:Georgia,serif;font-weight:400;font-size:26px;margin:0 0 12px"><?= e($internal ? 'Neue Bestellung ' . $order['number'] : t('mail.order_title')) ?></h1>
<?php if (!$internal): ?><p><?= e(t('mail.order_intro', ['name' => $b['name'] ?? ''])) ?></p><?php endif ?>
<p><strong><?= e(t('done.number')) ?>:</strong> <?= e($order['number']) ?><br>
<strong><?= e(t('checkout.payment')) ?>:</strong> <?= e(t('payment.' . ($order['payment_method'] === 'stripe' ? 'card' : $order['payment_method']))) ?><br>
<?php if ($order['po_number']): ?><strong><?= e(t('checkout.po_number')) ?>:</strong> <?= e($order['po_number']) ?><br><?php endif ?>
<?php if ($internal): ?><strong>Kunde:</strong> <?= e($order['email']) ?> <?= $order['is_b2b'] ? '(B2B)' : '' ?><br><?php endif ?></p>
<table width="100%" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px">
<?php foreach ($order['items'] as $i): ?>
<tr style="border-bottom:1px solid #eee"><td><?= (int) $i['qty'] ?>×</td><td><?= e($i['name']) ?><br><span style="color:#888;font-size:12px"><?= e($i['sku']) ?></span></td><td align="right"><?= money((int) $i['line_gross']) ?></td></tr>
<?php endforeach ?>
<tr><td colspan="2"><?= e(t('checkout.shipping')) ?></td><td align="right"><?= money((int) $order['shipping_gross']) ?></td></tr>
<?php if ((int) $order['discount_gross']): ?><tr><td colspan="2"><?= e(t('coupon.discount')) ?></td><td align="right">− <?= money((int) $order['discount_gross']) ?></td></tr><?php endif ?>
<tr><td colspan="2"><strong><?= e(t('cart.total')) ?></strong></td><td align="right"><strong><?= money((int) $order['total_gross']) ?></strong></td></tr>
<tr><td colspan="2" style="color:#888"><?= e(t('price.vat')) ?></td><td align="right" style="color:#888"><?= money((int) $order['tax_total']) ?></td></tr>
</table>
<?php if ($order['payment_method'] === 'prepayment' && !empty($bank['iban'])): ?>
<p style="background:#faf8f4;padding:16px;border-radius:4px"><strong><?= e(t('done.bank_title')) ?></strong><br><?= e($bank['holder']) ?><br>IBAN <?= e($bank['iban']) ?><br><?= e($bank['bank']) ?><br><?= e(t('done.reference')) ?>: <?= e($order['number']) ?></p>
<?php endif ?>
<p><?= e(t('mail.order_outro')) ?></p>
