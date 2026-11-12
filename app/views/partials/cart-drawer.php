<?php /** @var array $summary */ $net = $summary['display_mode'] === 'net'; ?>
<div class="drawer__head">
  <h2><?= e(t('cart.title')) ?> <span class="muted">(<?= (int) $summary['units'] ?>)</span></h2>
  <button class="icon-btn" data-drawer-close aria-label="<?= e(t('nav.close')) ?>"><?= icon('close') ?></button>
</div>
<?php if ($summary['empty']): ?>
  <div class="drawer__empty">
    <?= icon('glass', 40) ?>
    <p><?= e(t('cart.empty')) ?></p>
    <a class="btn btn--primary" href="<?= url('/shop') ?>"><?= e(t('cart.discover')) ?></a>
  </div>
<?php else: ?>
  <ul class="drawer__lines">
    <?php foreach ($summary['lines'] as $l): $p = $l['product']; ?>
      <li class="mini-line">
        <a class="mini-line__art" href="<?= product_url($p) ?>"><?= product_art($p) ?></a>
        <div class="mini-line__body">
          <a href="<?= product_url($p) ?>" class="mini-line__name"><?= e(tf($p['name_json'])) ?></a>
          <span class="muted"><?= e(trim(($p['vintage'] ?? '') . ' · ' . ($p['producer_name'] ?? ''), ' ·')) ?></span>
          <span class="muted"><?= (int) $l['qty'] ?> × <?= money($net ? $l['price']['net'] : $l['price']['gross']) ?></span>
        </div>
        <strong><?= money($net ? $l['line_net'] : $l['line_gross']) ?></strong>
      </li>
    <?php endforeach ?>
  </ul>
  <div class="drawer__foot">
    <div class="sum-row"><span><?= e(t('cart.subtotal')) ?><?= $net ? ' ' . e(t('price.excl_vat')) : '' ?></span><strong><?= money($net ? $summary['subtotal_net'] : $summary['subtotal_gross']) ?></strong></div>
    <?php if ($summary['below_minimum']): ?><p class="note note--warn"><?= e(t('b2b.min_order', ['amount' => money($summary['min_order_net'])])) ?></p><?php endif ?>
    <a class="btn btn--primary btn--block" href="<?= url('/checkout') ?>"><?= e(t('cart.checkout')) ?></a>
    <a class="btn btn--ghost btn--block" href="<?= url('/cart') ?>"><?= e(t('cart.view')) ?></a>
  </div>
<?php endif ?>
