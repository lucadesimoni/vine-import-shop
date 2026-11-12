<?php /** @var array $summary */ $net = $summary['display_mode'] === 'net'; ?>
<dl class="totals">
  <div><dt><?= e(t('cart.subtotal')) ?> <?= $net ? '<small>' . e(t('price.excl_vat')) . '</small>' : '' ?></dt><dd><?= money($net ? $summary['subtotal_net'] : $summary['subtotal_gross']) ?></dd></div>
  <?php if ($net): ?>
    <div class="muted"><dt><?= e(t('cart.subtotal')) ?> <small><?= e(t('price.incl_vat')) ?></small></dt><dd><?= money($summary['subtotal_gross']) ?></dd></div>
  <?php endif ?>
  <?php if ($summary['discount'] > 0): ?>
    <div class="accent"><dt><?= e(t('coupon.discount')) ?> <small><?= e($summary['coupon']['code']) ?></small></dt><dd>− <?= money($summary['discount']) ?></dd></div>
  <?php endif ?>
  <?php if ($summary['shipping_method'] !== ''): $m = $summary['shipping_methods'][$summary['shipping_method']]; ?>
    <div><dt><?= e($m['label']) ?></dt><dd><?= $summary['shipping_gross'] > 0 ? money($summary['shipping_gross']) : e(t('shipping.free')) ?></dd></div>
    <?php if ($m['note']): ?><p class="totals__note"><?= e($m['note']) ?></p><?php endif ?>
  <?php endif ?>
  <div class="totals__grand"><dt><?= e(t('cart.total')) ?> <small><?= e(t('price.incl_vat')) ?></small></dt><dd><?= money($summary['total_gross']) ?></dd></div>
  <?php foreach ($summary['taxes'] as $rate => $amount): ?>
    <div class="muted totals__tax"><dt><?= e(t('cart.vat_included', ['rate' => (string) $rate])) ?></dt><dd><?= money($amount) ?></dd></div>
  <?php endforeach ?>
</dl>
