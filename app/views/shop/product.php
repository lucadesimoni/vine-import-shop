<?php
/** @var array $product @var ?array $producer @var array $related @var array $price @var bool $inWishlist */
$p = $product;
$name = tf($p['name_json']);
$this->section('title', $name . ($p['vintage'] && $p['vintage'] !== 'NV' ? ' ' . $p['vintage'] : ''));
$this->section('description', tf($p['short_json']));
$net = $price['display_mode'] === 'net';
$case = max(1, (int) $p['case_size']);
$facts = array_filter([
    t('fact.producer') => $producer['name'] ?? null,
    t('fact.origin') => trim(($p['region'] ?? '') . ', ' . ($p['country'] ?? ''), ', '),
    t('fact.appellation') => $p['appellation'],
    t('fact.grapes') => $p['grapes'],
    t('fact.vintage') => $p['vintage'],
    t('fact.volume') => $p['volume_ml'] ? ($p['volume_ml'] >= 1000 ? ($p['volume_ml'] / 1000) . ' kg' : ($p['volume_ml'] / 10) . ' cl') : null,
    t('fact.alcohol') => $p['alcohol'] ? rtrim(rtrim((string) $p['alcohol'], '0'), '.') . ' % vol.' : null,
    t('fact.temp') => $p['serving_temp'],
    t('fact.aging') => $p['aging'],
    t('fact.sku') => $p['sku'],
]);
$ld = [
    '@context' => 'https://schema.org', '@type' => 'Product', 'name' => $name, 'sku' => $p['sku'],
    'description' => tf($p['description_json']), 'brand' => ['@type' => 'Brand', 'name' => $producer['name'] ?? config('app.name')],
    'offers' => ['@type' => 'Offer', 'priceCurrency' => config('app.currency'), 'price' => number_format($p['price_gross'] / 100, 2, '.', ''),
        'availability' => (int) $p['stock'] > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', 'url' => absolute_url('/p/' . $p['slug'])],
];
$this->section('head', '<script type="application/ld+json">' . json_encode($ld, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) . '</script>');
?>
<section class="container product">
  <nav class="crumbs" aria-label="Breadcrumb">
    <a href="<?= url('/') ?>"><?= e(t('nav.home')) ?></a><span>/</span>
    <a href="<?= url('/shop/' . $p['category_slug']) ?>"><?= e(tf($p['category_name'])) ?></a><span>/</span>
    <span><?= e($name) ?></span>
  </nav>
  <div class="product__grid">
    <div class="product__media product__media--<?= e($p['color'] ?: $p['type']) ?>">
      <?= product_art($p, 'product__art') ?>
      <div class="card__badges">
        <?php if ((int) $p['organic']): ?><span class="badge badge--bio"><?= icon('leaf', 12) ?> Bio</span><?php endif ?>
        <?php if ($p['rating']): ?><span class="badge"><?= e($p['rating']) ?></span><?php endif ?>
      </div>
    </div>

    <div class="product__info">
      <?php if ($producer): ?><a class="eyebrow" href="<?= url('/producers/' . $producer['slug']) ?>"><?= e($producer['name']) ?> · <?= e($producer['region']) ?></a><?php endif ?>
      <h1 class="h1 product__title"><?= e($name) ?> <?php if ($p['vintage'] && $p['vintage'] !== 'NV'): ?><span class="product__vintage"><?= e($p['vintage']) ?></span><?php endif ?></h1>
      <p class="lead"><?= e(tf($p['short_json'])) ?></p>

      <div class="buybox">
        <div class="price price--lg">
          <span class="price__now" data-unit-price><?= money($price['display']) ?></span>
          <?php if ($price['reduced'] && !$net): ?><s class="price__was"><?= money($price['list_gross']) ?></s><?php endif ?>
          <span class="price__hint">
            <?= e($net ? t('price.excl_vat') : t('price.incl_vat')) ?>
            <?php if ($p['volume_ml'] && $p['type'] !== 'speciality'): ?> · <?= money((int) round($price['display'] / $p['volume_ml'] * 750)) ?> / 75 cl<?php endif ?>
          </span>
        </div>

        <?php if ($price['tiers']): ?>
          <table class="tiers">
            <caption><?= e(t('price.tiers')) ?> <?= e($net ? t('price.excl_vat') : '') ?></caption>
            <tbody>
              <?php foreach ($price['tiers'] as $tier): ?>
                <tr><th><?= e(t('price.from_qty', ['qty' => (string) $tier['min_qty']])) ?></th><td><?= money($net ? $tier['price_net'] : (int) round($tier['price_net'] * (1 + $price['tax_rate'] / 100))) ?></td></tr>
              <?php endforeach ?>
            </tbody>
          </table>
        <?php elseif (!auth()->isB2B()): ?>
          <p class="note"><?= icon('building', 14) ?> <span><?= t('product.b2b_hint', ['link' => '<a href="' . url('/b2b') . '">' . e(t('nav.b2b')) . '</a>']) ?></span></p>
        <?php endif ?>

        <?php if ((int) $p['stock'] > 0): ?>
          <form action="<?= url('/cart/add') ?>" method="post" class="buybox__form" data-add-to-cart>
            <?= csrf_field() ?>
            <input type="hidden" name="product_id" value="<?= (int) $p['id'] ?>">
            <div class="stepper" data-stepper>
              <button type="button" data-step="-1" aria-label="−"><?= icon('minus', 16) ?></button>
              <input type="number" name="qty" value="<?= max(1, (int) $p['min_qty']) ?>" min="1" max="<?= (int) $p['stock'] ?>" aria-label="<?= e(t('cart.qty')) ?>">
              <button type="button" data-step="1" aria-label="+"><?= icon('plus', 16) ?></button>
            </div>
            <button class="btn btn--primary btn--lg buybox__add"><?= icon('cart', 18) ?> <?= e(t('product.add_to_cart')) ?></button>
            <?php if ($case > 1): ?>
              <button class="btn btn--ghost buybox__case" type="submit" name="qty" value="<?= $case ?>"><?= icon('box', 16) ?> <?= e(t('product.add_case', ['n' => (string) $case])) ?></button>
            <?php endif ?>
          </form>
          <p class="stock <?= (int) $p['stock'] < 24 ? 'stock--low' : '' ?>">
            <span class="dot"></span>
            <?= e((int) $p['stock'] < 24 ? t('product.stock_low', ['n' => (string) $p['stock']]) : t('product.in_stock')) ?> · <?= e(t('product.delivery')) ?>
          </p>
        <?php else: ?>
          <p class="stock stock--out"><span class="dot"></span><?= e(t('product.soldout')) ?></p>
        <?php endif ?>

        <form action="<?= url('/wishlist/toggle') ?>" method="post" data-wishlist>
          <?= csrf_field() ?><input type="hidden" name="product_id" value="<?= (int) $p['id'] ?>">
          <button class="btn btn--text <?= $inWishlist ? 'is-active' : '' ?>"><?= icon('heart', 16) ?> <span><?= e(t('product.wishlist')) ?></span></button>
        </form>
      </div>

      <dl class="facts">
        <?php foreach ($facts as $k => $v): ?><div><dt><?= e($k) ?></dt><dd><?= e($v) ?></dd></div><?php endforeach ?>
      </dl>
    </div>
  </div>

  <div class="product__details">
    <div class="tabs" data-tabs>
      <div class="tabs__list" role="tablist">
        <button role="tab" aria-selected="true" data-tab="taste"><?= e($p['type'] === 'wine' ? t('product.tasting') : t('product.description')) ?></button>
        <button role="tab" aria-selected="false" data-tab="pair"><?= e(t('product.pairing')) ?></button>
        <?php if ($producer): ?><button role="tab" aria-selected="false" data-tab="producer"><?= e(t('product.producer')) ?></button><?php endif ?>
      </div>
      <div class="tabs__panel" role="tabpanel" data-panel="taste"><p><?= e(tf($p['tasting_json'] ?: $p['description_json'])) ?></p></div>
      <div class="tabs__panel" role="tabpanel" data-panel="pair" hidden><p><?= e(tf($p['pairing_json'])) ?></p></div>
      <?php if ($producer): ?>
        <div class="tabs__panel" role="tabpanel" data-panel="producer" hidden>
          <h3><?= e($producer['name']) ?></h3>
          <p><?= e(tf($producer['description_json'])) ?></p>
          <a class="link-arrow" href="<?= url('/producers/' . $producer['slug']) ?>"><?= e(t('product.all_from', ['name' => $producer['name']])) ?> <?= icon('arrow', 16) ?></a>
        </div>
      <?php endif ?>
    </div>
  </div>

  <?php if ($related): ?>
    <div class="section__head"><h2 class="h2"><?= e(t('product.related')) ?></h2></div>
    <div class="grid grid--4"><?php foreach ($related as $rp): ?><?= $this->partial('product-card', ['p' => $rp]) ?><?php endforeach ?></div>
  <?php endif ?>
</section>
