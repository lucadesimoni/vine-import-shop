<?php /** @var array $producers */ $this->section('title', t('nav.producers')); ?>
<section class="page-head">
  <div class="container">
    <span class="eyebrow"><?= e(t('producers.eyebrow')) ?></span>
    <h1 class="h1"><?= e(t('producers.title')) ?></h1>
    <p class="lead"><?= e(t('producers.lead')) ?></p>
  </div>
</section>
<section class="container section section--flush">
  <div class="producer-grid">
    <?php foreach ($producers as $pr): ?>
      <a class="producer-card" href="<?= url('/producers/' . $pr['slug']) ?>">
        <span class="producer-card__region"><?= e($pr['region']) ?> · <?= e($pr['country']) ?></span>
        <h2><?= e($pr['name']) ?></h2>
        <p><?= e(mb_strimwidth(tf($pr['description_json']), 0, 150, '…')) ?></p>
        <span class="producer-card__meta">
          <?php if ($pr['founded']): ?><?= e(t('producers.since', ['year' => $pr['founded']])) ?> · <?php endif ?>
          <?= e(t('producers.products', ['n' => (string) $pr['product_count']])) ?>
          <?= icon('arrow', 16) ?>
        </span>
      </a>
    <?php endforeach ?>
  </div>
</section>
