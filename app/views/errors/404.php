<?php $this->section('title', '404'); ?>
<section class="container empty empty--wide">
  <span class="display">404</span>
  <h1 class="h2"><?= e(t('error.404')) ?></h1>
  <p class="muted"><?= e(t('error.404_text')) ?></p>
  <a class="btn btn--primary" href="<?= url('/shop') ?>"><?= e(t('cart.discover')) ?></a>
</section>
