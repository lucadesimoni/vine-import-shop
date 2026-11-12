<?php /** @var array $producer @var array $products */ $this->section('title', $producer['name']); ?>
<section class="page-head page-head--dark">
  <div class="container">
    <nav class="crumbs crumbs--light"><a href="<?= url('/') ?>"><?= e(t('nav.home')) ?></a><span>/</span><a href="<?= url('/producers') ?>"><?= e(t('nav.producers')) ?></a></nav>
    <span class="eyebrow eyebrow--light"><?= e($producer['region']) ?> · <?= e($producer['country']) ?></span>
    <h1 class="display display--sm"><?= e($producer['name']) ?></h1>
    <p class="lead"><?= e(tf($producer['description_json'])) ?></p>
    <dl class="hero__facts hero__facts--light">
      <?php if ($producer['founded']): ?><div><dt><?= e($producer['founded']) ?></dt><dd><?= e(t('producers.founded')) ?></dd></div><?php endif ?>
      <?php if ($producer['hectares'] && $producer['hectares'] !== '—'): ?><div><dt><?= e($producer['hectares']) ?></dt><dd><?= e(t('producers.vineyards')) ?></dd></div><?php endif ?>
      <div><dt><?= count($products) ?></dt><dd><?= e(t('producers.in_range')) ?></dd></div>
    </dl>
  </div>
</section>
<section class="container section">
  <div class="grid grid--4"><?php foreach ($products as $p): ?><?= $this->partial('product-card', ['p' => $p]) ?><?php endforeach ?></div>
</section>
