<?php /** @var ?array $result */ $this->section('title', t('b2b.quick_order')); ?>
<section class="page-head page-head--slim">
  <div class="container"><h1 class="h1"><?= e(t('b2b.quick_order')) ?></h1><p class="muted"><?= e(t('b2b.quick_order_text')) ?></p></div>
</section>
<section class="container account">
  <?php include dirname(__DIR__) . '/account/_nav.php'; ?>
  <div class="account__main">
    <?php if ($result): ?>
      <div class="panel">
        <?php if ($result['added']): ?>
          <p class="note note--ok"><?= icon('check', 16) ?> <?= e(t('b2b.quick_added', ['count' => (string) count($result['added'])])) ?></p>
          <ul class="plain-list"><?php foreach ($result['added'] as $a): ?><li><span class="mono"><?= e($a['sku']) ?></span> · <?= (int) $a['qty'] ?> × <?= e($a['name']) ?></li><?php endforeach ?></ul>
        <?php endif ?>
        <?php if ($result['missing']): ?><p class="note note--warn"><?= e(t('b2b.quick_missing')) ?>: <span class="mono"><?= e(implode(', ', $result['missing'])) ?></span></p><?php endif ?>
        <a class="btn btn--primary" href="<?= url('/cart') ?>"><?= e(t('cart.view')) ?> <?= icon('arrow', 16) ?></a>
      </div>
    <?php endif ?>

    <form method="post" action="<?= url('/b2b/quick-order') ?>" class="grid grid--2 quick">
      <?= csrf_field() ?><input type="hidden" name="go" value="cart">
      <div class="panel">
        <h2 class="panel__title"><?= e(t('b2b.by_sku')) ?></h2>
        <div class="quick__rows" data-quick-rows>
          <?php for ($i = 0; $i < 6; $i++): ?>
            <div class="quick__row">
              <input name="sku[]" placeholder="SKU" class="mono" list="sku-suggest" data-sku-lookup aria-label="SKU">
              <input name="qty[]" type="number" min="0" placeholder="<?= e(t('cart.qty')) ?>" aria-label="<?= e(t('cart.qty')) ?>">
              <span class="quick__hint muted" data-sku-hint></span>
            </div>
          <?php endfor ?>
        </div>
        <datalist id="sku-suggest"></datalist>
        <button type="button" class="btn btn--text btn--sm" data-add-row><?= icon('plus', 14) ?> <?= e(t('b2b.add_row')) ?></button>
      </div>
      <div class="panel">
        <h2 class="panel__title"><?= e(t('b2b.paste')) ?></h2>
        <p class="muted small"><?= e(t('b2b.paste_text')) ?></p>
        <textarea name="paste" rows="10" class="mono" placeholder="W-1001;12&#10;W-1003;6&#10;S-1001	24"></textarea>
      </div>
      <div class="span-2"><button class="btn btn--primary btn--lg"><?= icon('cart', 18) ?> <?= e(t('b2b.add_to_cart')) ?></button></div>
    </form>
  </div>
</section>
