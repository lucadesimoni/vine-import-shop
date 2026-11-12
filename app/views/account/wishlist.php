<?php /** @var array $items */ $this->section('title', t('nav.wishlist')); ?>
<section class="page-head page-head--slim"><div class="container"><h1 class="h1"><?= e(t('nav.wishlist')) ?></h1></div></section>
<section class="container account">
  <?php include __DIR__ . '/_nav.php'; ?>
  <div class="account__main">
    <?php if (!$items): ?>
      <div class="empty"><?= icon('heart', 36) ?><h2><?= e(t('wishlist.empty')) ?></h2><a class="btn btn--primary" href="<?= url('/shop') ?>"><?= e(t('cart.discover')) ?></a></div>
    <?php else: ?>
      <div class="grid grid--3"><?php foreach ($items as $p): ?><?= $this->partial('product-card', ['p' => $p]) ?><?php endforeach ?></div>
    <?php endif ?>
  </div>
</section>
