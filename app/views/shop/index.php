<?php
/** @var ?array $category @var array $filters @var array $result @var array $facets @var array $categories */
$heading = $category ? tf($category['name_json']) : ($filters['q'] !== '' ? t('shop.results_for', ['q' => $filters['q']]) : ($filters['type'] ? t('type.' . $filters['type']) : t('shop.all')));
$this->section('title', $heading);
$base = $category ? '/shop/' . $category['slug'] : '/shop';
$checked = fn (string $k, string $v) => in_array($v, (array) $filters[$k], true) ? 'checked' : '';
$query = array_filter($filters, fn ($v) => $v !== '' && $v !== []);
?>
<section class="page-head">
  <div class="container">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="<?= url('/') ?>"><?= e(t('nav.home')) ?></a><span>/</span><a href="<?= url('/shop') ?>"><?= e(t('nav.shop')) ?></a><?php if ($category): ?><span>/</span><span><?= e($heading) ?></span><?php endif ?></nav>
    <h1 class="h1"><?= e($heading) ?></h1>
    <div class="chips">
      <a class="chip <?= !$category && !$filters['type'] ? 'is-active' : '' ?>" href="<?= url('/shop') ?>"><?= e(t('shop.all')) ?></a>
      <?php foreach ($categories as $c): ?>
        <a class="chip <?= ($category['slug'] ?? '') === $c['slug'] ? 'is-active' : '' ?>" href="<?= url('/shop/' . $c['slug']) ?>"><?= e(tf($c['name_json'])) ?></a>
      <?php endforeach ?>
    </div>
  </div>
</section>

<section class="container shop">
  <aside class="filters" data-filters>
    <form method="get" action="<?= url($base) ?>" data-filter-form>
      <div class="filters__head">
        <h2><?= icon('filter', 16) ?> <?= e(t('shop.filter')) ?></h2>
        <button type="button" class="icon-btn filters__close" data-filters-close aria-label="<?= e(t('nav.close')) ?>"><?= icon('close') ?></button>
      </div>
      <?php if ($filters['q'] !== ''): ?><input type="hidden" name="q" value="<?= e($filters['q']) ?>"><?php endif ?>
      <?php if ($filters['type'] !== ''): ?><input type="hidden" name="type" value="<?= e($filters['type']) ?>"><?php endif ?>
      <?php if ($filters['sort'] !== ''): ?><input type="hidden" name="sort" value="<?= e($filters['sort']) ?>"><?php endif ?>

      <?php if ($facets['colors']): ?>
      <fieldset class="facet">
        <legend><?= e(t('filter.color')) ?></legend>
        <?php foreach ($facets['colors'] as $c): ?>
          <label class="check"><input type="checkbox" name="color[]" value="<?= e($c) ?>" <?= $checked('color', $c) ?>><span class="swatch swatch--<?= e($c) ?>"></span><?= e(t('color.' . $c)) ?></label>
        <?php endforeach ?>
      </fieldset>
      <?php endif ?>

      <fieldset class="facet">
        <legend><?= e(t('filter.region')) ?></legend>
        <?php foreach ($facets['regions'] as $r): ?>
          <label class="check"><input type="checkbox" name="region[]" value="<?= e($r) ?>" <?= $checked('region', $r) ?>><?= e($r) ?></label>
        <?php endforeach ?>
      </fieldset>

      <fieldset class="facet">
        <legend><?= e(t('filter.producer')) ?></legend>
        <?php foreach ($facets['producers'] as $pr): ?>
          <label class="check"><input type="checkbox" name="producer[]" value="<?= e($pr['slug']) ?>" <?= $checked('producer', $pr['slug']) ?>><?= e($pr['name']) ?></label>
        <?php endforeach ?>
      </fieldset>

      <?php if ($facets['vintages']): ?>
      <fieldset class="facet facet--inline">
        <legend><?= e(t('filter.vintage')) ?></legend>
        <?php foreach ($facets['vintages'] as $v): ?>
          <label class="pill"><input type="checkbox" name="vintage[]" value="<?= e($v) ?>" <?= $checked('vintage', $v) ?>><span><?= e($v) ?></span></label>
        <?php endforeach ?>
      </fieldset>
      <?php endif ?>

      <fieldset class="facet">
        <legend><?= e(t('filter.price')) ?> (CHF)</legend>
        <div class="range">
          <input type="number" name="min" min="0" step="1" placeholder="<?= e(t('filter.from')) ?>" value="<?= e($filters['min']) ?>" aria-label="<?= e(t('filter.from')) ?>">
          <span>–</span>
          <input type="number" name="max" min="0" step="1" placeholder="<?= e(t('filter.to')) ?>" value="<?= e($filters['max']) ?>" aria-label="<?= e(t('filter.to')) ?>">
        </div>
      </fieldset>

      <fieldset class="facet">
        <legend><?= e(t('filter.more')) ?></legend>
        <label class="field field--compact"><span class="sr-only"><?= e(t('filter.grape')) ?></span><input type="text" name="grape" placeholder="<?= e(t('filter.grape')) ?>" value="<?= e($filters['grape']) ?>"></label>
        <label class="check"><input type="checkbox" name="organic" value="1" <?= $filters['organic'] ? 'checked' : '' ?>><?= e(t('filter.organic')) ?></label>
        <label class="check"><input type="checkbox" name="instock" value="1" <?= $filters['instock'] ? 'checked' : '' ?>><?= e(t('filter.instock')) ?></label>
      </fieldset>

      <div class="filters__actions">
        <button class="btn btn--primary btn--block"><?= e(t('filter.apply')) ?></button>
        <a class="btn btn--text btn--block" href="<?= url($base) ?>"><?= e(t('filter.reset')) ?></a>
      </div>
    </form>
  </aside>

  <div class="shop__main">
    <div class="toolbar">
      <button class="btn btn--ghost btn--sm toolbar__filter" data-filters-open><?= icon('filter', 16) ?> <?= e(t('shop.filter')) ?></button>
      <p class="muted"><?= e(t('shop.count', ['count' => (string) $result['total']])) ?></p>
      <form method="get" action="<?= url($base) ?>" class="toolbar__sort">
        <?php foreach ($query as $k => $v): if ($k === 'sort') continue; foreach ((array) $v as $vv): ?>
          <input type="hidden" name="<?= e($k) . (is_array($v) ? '[]' : '') ?>" value="<?= e($vv) ?>">
        <?php endforeach; endforeach ?>
        <label><span class="sr-only"><?= e(t('shop.sort')) ?></span>
          <select name="sort" data-autosubmit>
            <?php foreach (['' => 'sort.recommended', 'price_asc' => 'sort.price_asc', 'price_desc' => 'sort.price_desc', 'vintage' => 'sort.vintage', 'new' => 'sort.new'] as $v => $label): ?>
              <option value="<?= e($v) ?>" <?= $filters['sort'] === $v ? 'selected' : '' ?>><?= e(t($label)) ?></option>
            <?php endforeach ?>
          </select>
        </label>
      </form>
    </div>

    <?php if (!$result['items']): ?>
      <div class="empty">
        <?= icon('search', 36) ?>
        <h2><?= e(t('shop.none')) ?></h2>
        <a class="btn btn--ghost" href="<?= url('/shop') ?>"><?= e(t('filter.reset')) ?></a>
      </div>
    <?php else: ?>
      <div class="grid grid--3">
        <?php foreach ($result['items'] as $p): ?><?= $this->partial('product-card', ['p' => $p]) ?><?php endforeach ?>
      </div>
      <?php if ($result['pages'] > 1): ?>
        <nav class="pager" aria-label="Pagination">
          <?php for ($i = 1; $i <= $result['pages']; $i++): ?>
            <a class="<?= $i === $result['page'] ? 'is-active' : '' ?>" href="<?= url($base, $query + ['page' => $i]) ?>"><?= $i ?></a>
          <?php endfor ?>
        </nav>
      <?php endif ?>
    <?php endif ?>
  </div>
</section>
