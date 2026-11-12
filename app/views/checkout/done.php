<?php /** @var array $order @var array $bank */ $this->section('title', t('done.title')); $billing = json_field($order['billing_json']); ?>
<section class="page-head page-head--slim">
  <div class="container"><?= $this->partial('steps', ['step' => 3]) ?></div>
</section>
<section class="container done">
  <div class="done__card">
    <span class="done__icon"><?= icon('check', 32) ?></span>
    <span class="eyebrow"><?= e(t('done.eyebrow')) ?></span>
    <h1 class="h1"><?= e(t('done.title')) ?></h1>
    <p class="lead"><?= e(t('done.text', ['name' => $billing['name'] ?? '', 'email' => $order['email']])) ?></p>
    <dl class="done__meta">
      <div><dt><?= e(t('done.number')) ?></dt><dd><?= e($order['number']) ?></dd></div>
      <div><dt><?= e(t('cart.total')) ?></dt><dd><?= money((int) $order['total_gross']) ?></dd></div>
      <div><dt><?= e(t('checkout.payment')) ?></dt><dd><?= e(t('payment.' . ($order['payment_method'] === 'stripe' ? 'card' : $order['payment_method']))) ?></dd></div>
      <div><dt><?= e(t('done.status')) ?></dt><dd><span class="status status--<?= e($order['payment_status']) ?>"><?= e(t('payment_status.' . $order['payment_status'])) ?></span></dd></div>
    </dl>

    <?php if ($order['payment_method'] === 'prepayment' && $bank): ?>
      <div class="bank">
        <h2><?= e(t('done.bank_title')) ?></h2>
        <dl>
          <div><dt><?= e(t('done.holder')) ?></dt><dd><?= e($bank['holder']) ?></dd></div>
          <div><dt>IBAN</dt><dd class="mono"><?= e($bank['iban']) ?></dd></div>
          <div><dt><?= e(t('done.bank')) ?></dt><dd><?= e($bank['bank']) ?></dd></div>
          <div><dt><?= e(t('done.reference')) ?></dt><dd class="mono"><?= e($order['number']) ?></dd></div>
          <div><dt><?= e(t('cart.total')) ?></dt><dd><?= money((int) $order['total_gross']) ?></dd></div>
        </dl>
      </div>
    <?php endif ?>

    <table class="table">
      <tbody>
        <?php foreach ($order['items'] as $i): ?>
          <tr><td><?= (int) $i['qty'] ?>×</td><td><?= e($i['name']) ?> <small class="muted"><?= e($i['sku']) ?></small></td><td class="num"><?= money((int) $i['line_gross']) ?></td></tr>
        <?php endforeach ?>
      </tbody>
    </table>
    <div class="done__actions">
      <a class="btn btn--primary" href="<?= url('/shop') ?>"><?= e(t('cart.continue')) ?></a>
      <?php if (auth()->check()): ?><a class="btn btn--ghost" href="<?= url('/account/orders/' . $order['number']) ?>"><?= e(t('done.view_order')) ?></a><?php endif ?>
    </div>
  </div>
</section>
