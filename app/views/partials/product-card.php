<?php
/** @var array $p */
$price = app()->get(App\Shop\Pricing::class)->price($p, auth()->group());
$name = tf($p['name_json']);
$soldOut = (int) $p['stock'] <= 0;
$colorLabel = $p['color'] ? t('color.' . $p['color']) : ($p['category_name'] ?? null ? tf($p['category_name']) : '');
?>
<article class="card <?= $soldOut ? 'is-soldout' : '' ?>">
  <a class="card__media card__media--<?= e($p['color'] ?: $p['type']) ?>" href="<?= product_url($p) ?>" tabindex="-1" aria-hidden="true">
    <?= product_art($p, 'card__art') ?>
    <span class="card__badges">
      <?php if ((int) $p['organic']): ?><span class="badge badge--bio"><?= icon('leaf', 12) ?> Bio</span><?php endif ?>
      <?php if (!empty($p['rating'])): ?><span class="badge"><?= e($p['rating']) ?></span><?php endif ?>
      <?php if ($price['reduced'] && $price['display_mode'] === 'gross'): ?><span class="badge badge--accent"><?= e(t('product.your_price')) ?></span><?php endif ?>
    </span>
  </a>
  <div class="card__body">
    <p class="card__meta"><?= e(trim(($p['producer_name'] ?? '') . ($p['region'] ? ' · ' . $p['region'] : ''), ' ·')) ?></p>
    <h3 class="card__title"><a href="<?= product_url($p) ?>"><?= e($name) ?></a></h3>
    <p class="card__sub">
      <?= e(implode(' · ', array_filter([$colorLabel, $p['vintage'] && $p['vintage'] !== 'NV' ? $p['vintage'] : null, $p['volume_ml'] ? ($p['volume_ml'] >= 1000 ? ($p['volume_ml'] / 1000) . ' kg' : ($p['volume_ml'] / 10) . ' cl') : null]))) ?>
    </p>
    <div class="card__foot">
      <div class="price">
        <span class="price__now"><?= money($price['display']) ?></span>
        <?php if ($price['display_mode'] === 'net'): ?>
          <span class="price__hint"><?= e(t('price.excl_vat')) ?><?php if ($price['tiers'] && count($price['tiers']) > 1): ?> · <?= e(t('price.from_qty', ['qty' => (string) end($price['tiers'])['min_qty']])) ?> <?= money(end($price['tiers'])['price_net']) ?><?php endif ?></span>
        <?php elseif ($price['reduced']): ?>
          <s class="price__was"><?= money($price['list_gross']) ?></s>
        <?php endif ?>
      </div>
      <?php if ($soldOut): ?>
        <span class="card__soldout"><?= e(t('product.soldout')) ?></span>
      <?php else: ?>
        <form action="<?= url('/cart/add') ?>" method="post" data-add-to-cart>
          <?= csrf_field() ?>
          <input type="hidden" name="product_id" value="<?= (int) $p['id'] ?>">
          <input type="hidden" name="qty" value="1">
          <button class="icon-btn icon-btn--solid" aria-label="<?= e(t('product.add', ['name' => $name])) ?>"><?= icon('plus', 18) ?></button>
        </form>
      <?php endif ?>
    </div>
  </div>
</article>
