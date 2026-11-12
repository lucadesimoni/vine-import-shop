<?php /** @var array $order */ $this->section('title', $order['number']); $billing = json_field($order['billing_json']); $ship = json_field($order['shipping_json']) ?: $billing; ?>
<section class="page-head page-head--slim">
  <div class="container">
    <nav class="crumbs"><a href="<?= url('/account') ?>"><?= e(t('nav.account')) ?></a><span>/</span><span><?= e($order['number']) ?></span></nav>
    <h1 class="h1"><?= e(t('account.order')) ?> <?= e($order['number']) ?></h1>
    <p class="muted"><?= e(date('d.m.Y H:i', strtotime($order['created_at']))) ?> · <span class="status status--<?= e($order['status']) ?>"><?= e(t('status.' . $order['status'])) ?></span></p>
  </div>
</section>
<section class="container account">
  <?php include __DIR__ . '/_nav.php'; ?>
  <div class="account__main">
    <div class="panel">
      <div class="table-wrap">
      <table class="table">
        <thead><tr><th><?= e(t('cart.product')) ?></th><th class="num"><?= e(t('cart.qty')) ?></th><th class="num"><?= e($order['is_b2b'] ? t('price.net') : t('cart.unit')) ?></th><th class="num"><?= e(t('cart.total')) ?></th></tr></thead>
        <tbody>
          <?php foreach ($order['items'] as $i): ?>
            <tr><td><?= e($i['name']) ?><br><small class="muted"><?= e($i['sku']) ?></small></td><td class="num"><?= (int) $i['qty'] ?></td><td class="num"><?= money((int) ($order['is_b2b'] ? $i['unit_net'] : $i['unit_gross'])) ?></td><td class="num"><?= money((int) $i['line_gross']) ?></td></tr>
          <?php endforeach ?>
        </tbody>
        <tfoot>
          <tr><td colspan="3"><?= e(t('cart.subtotal')) ?></td><td class="num"><?= money((int) $order['subtotal_gross']) ?></td></tr>
          <?php if ((int) $order['discount_gross']): ?><tr><td colspan="3"><?= e(t('coupon.discount')) ?></td><td class="num">− <?= money((int) $order['discount_gross']) ?></td></tr><?php endif ?>
          <tr><td colspan="3"><?= e(t('checkout.shipping')) ?></td><td class="num"><?= money((int) $order['shipping_gross']) ?></td></tr>
          <tr class="strong"><td colspan="3"><?= e(t('cart.total')) ?> <?= e(t('price.incl_vat')) ?></td><td class="num"><?= money((int) $order['total_gross']) ?></td></tr>
          <tr class="muted"><td colspan="3"><?= e(t('price.vat')) ?></td><td class="num"><?= money((int) $order['tax_total']) ?></td></tr>
        </tfoot>
      </table>
      </div>
    </div>
    <div class="grid grid--2">
      <div class="panel"><h2 class="panel__title"><?= e(t('checkout.billing')) ?></h2><address><?= nl2br(e(implode("\n", array_filter([$billing['company'] ?? '', $billing['name'] ?? '', $billing['street'] ?? '', trim(($billing['zip'] ?? '') . ' ' . ($billing['city'] ?? ''))])))) ?></address></div>
      <div class="panel"><h2 class="panel__title"><?= e(t('checkout.shipping')) ?></h2><address><?= nl2br(e(implode("\n", array_filter([$ship['company'] ?? '', $ship['name'] ?? '', $ship['street'] ?? '', trim(($ship['zip'] ?? '') . ' ' . ($ship['city'] ?? ''))])))) ?></address>
        <?php if ($order['po_number']): ?><p class="muted"><?= e(t('checkout.po_number')) ?>: <?= e($order['po_number']) ?></p><?php endif ?>
      </div>
    </div>
    <form method="post" action="<?= url('/account/orders/' . $order['number'] . '/reorder') ?>"><?= csrf_field() ?><button class="btn btn--primary"><?= icon('refresh', 16) ?> <?= e(t('account.reorder_all')) ?></button></form>
  </div>
</section>
