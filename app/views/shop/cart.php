<?php
/** @var array $summary */
$this->section('title', t('cart.title'));
$net = $summary['display_mode'] === 'net';
?>
<section class="page-head page-head--slim">
  <div class="container">
    <?= $this->partial('steps', ['step' => 1]) ?>
    <h1 class="h1"><?= e(t('cart.title')) ?></h1>
  </div>
</section>
<section class="container checkout-layout">
  <?php if ($summary['empty']): ?>
    <div class="empty empty--wide">
      <?= icon('glass', 40) ?>
      <h2><?= e(t('cart.empty')) ?></h2>
      <a class="btn btn--primary" href="<?= url('/shop') ?>"><?= e(t('cart.discover')) ?></a>
    </div>
  <?php else: ?>
  <form method="post" action="<?= url('/cart/update') ?>" class="cart" data-cart-form>
    <?= csrf_field() ?>
    <div class="cart__head"><span><?= e(t('cart.product')) ?></span><span><?= e(t('cart.qty')) ?></span><span><?= e(t('cart.total')) ?></span></div>
    <?php foreach ($summary['lines'] as $l): $p = $l['product']; ?>
      <div class="cart-line">
        <a class="cart-line__art" href="<?= product_url($p) ?>"><?= product_art($p) ?></a>
        <div class="cart-line__info">
          <a class="cart-line__name" href="<?= product_url($p) ?>"><?= e(tf($p['name_json'])) ?></a>
          <span class="muted"><?= e(implode(' · ', array_filter([$p['vintage'], $p['producer_name'], $p['sku']]))) ?></span>
          <span class="muted"><?= money($net ? $l['price']['net'] : $l['price']['gross']) ?> / <?= e(t('cart.unit')) ?><?= $l['price']['reduced'] ? ' · <span class="accent">' . e(t('price.tier_applied')) . '</span>' : '' ?></span>
          <?php foreach ($summary['warnings'] as $w): if ($w['sku'] === $p['sku']): ?>
            <span class="note note--warn"><?= e(t('cart.stock_warning', ['n' => (string) $w['available']])) ?></span>
          <?php endif; endforeach ?>
        </div>
        <div class="stepper stepper--sm" data-stepper>
          <button type="button" data-step="-1" aria-label="−"><?= icon('minus', 14) ?></button>
          <input type="number" name="qty[<?= (int) $p['id'] ?>]" value="<?= (int) $l['qty'] ?>" min="0" max="999" aria-label="<?= e(t('cart.qty')) ?>" data-autosubmit-debounce>
          <button type="button" data-step="1" aria-label="+"><?= icon('plus', 14) ?></button>
        </div>
        <strong class="cart-line__total"><?= money($net ? $l['line_net'] : $l['line_gross']) ?></strong>
        <button class="icon-btn cart-line__remove" formaction="<?= url('/cart/remove') ?>" name="product_id" value="<?= (int) $p['id'] ?>" aria-label="<?= e(t('cart.remove')) ?>"><?= icon('close', 16) ?></button>
      </div>
    <?php endforeach ?>
    <div class="cart__actions">
      <a class="btn btn--text" href="<?= url('/shop') ?>">← <?= e(t('cart.continue')) ?></a>
      <button class="btn btn--ghost btn--sm"><?= icon('refresh', 14) ?> <?= e(t('cart.update')) ?></button>
    </div>
  </form>

  <aside class="summary">
    <h2><?= e(t('cart.summary')) ?></h2>
    <?= $this->partial('totals', ['summary' => $summary]) ?>
    <?php if (!$net): ?>
      <form method="post" action="<?= url('/cart/coupon') ?>" class="coupon">
        <?= csrf_field() ?>
        <input type="text" name="code" placeholder="<?= e(t('coupon.placeholder')) ?>" value="<?= e($summary['coupon']['code'] ?? '') ?>" aria-label="<?= e(t('coupon.placeholder')) ?>">
        <button class="btn btn--ghost btn--sm"><?= e(t('coupon.apply')) ?></button>
      </form>
    <?php endif ?>
    <?php if ($summary['below_minimum']): ?>
      <p class="note note--warn"><?= e(t('b2b.min_order', ['amount' => money($summary['min_order_net'])])) ?></p>
    <?php endif ?>
    <a class="btn btn--primary btn--lg btn--block <?= $summary['below_minimum'] ? 'is-disabled' : '' ?>" href="<?= url('/checkout') ?>"><?= e(t('cart.checkout')) ?> <?= icon('arrow', 18) ?></a>
    <ul class="trust">
      <li><?= icon('shield', 16) ?> <?= e(t('trust.secure')) ?></li>
      <li><?= icon('truck', 16) ?> <?= e(t('trust.packaging')) ?></li>
    </ul>
  </aside>
  <?php endif ?>
</section>
