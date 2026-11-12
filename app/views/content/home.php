<?php
/** @var array $featured @var array $categories @var array $producers */
$this->section('description', t('home.meta'));
$heroBottles = array_slice(array_values(array_filter($featured, fn ($p) => $p['type'] === 'wine')), 0, 3);
$wineCats = array_values(array_filter($categories, fn ($c) => $c['type'] === 'wine'));
$specCats = array_values(array_filter($categories, fn ($c) => $c['type'] !== 'wine'));
?>
<section class="hero">
  <div class="container hero__inner">
    <div class="hero__copy">
      <span class="eyebrow"><?= e(t('home.eyebrow')) ?></span>
      <h1 class="display"><?= t('home.title') /* contains <em> */ ?></h1>
      <p class="lead"><?= e(t('home.lead')) ?></p>
      <div class="hero__cta">
        <a class="btn btn--primary btn--lg" href="<?= url('/shop', ['type' => 'wine']) ?>"><?= e(t('home.cta_wines')) ?> <?= icon('arrow', 18) ?></a>
        <a class="btn btn--ghost btn--lg" href="<?= url('/b2b') ?>"><?= e(t('home.cta_b2b')) ?></a>
      </div>
      <dl class="hero__facts">
        <div><dt><?= e(t('home.fact1_v')) ?></dt><dd><?= e(t('home.fact1')) ?></dd></div>
        <div><dt><?= e(t('home.fact2_v')) ?></dt><dd><?= e(t('home.fact2')) ?></dd></div>
        <div><dt><?= e(t('home.fact3_v')) ?></dt><dd><?= e(t('home.fact3')) ?></dd></div>
      </dl>
    </div>
    <div class="hero__visual" aria-hidden="true">
      <div class="hero__disc"></div>
      <?php foreach ($heroBottles as $i => $p): ?>
        <div class="hero__bottle hero__bottle--<?= $i ?>"><?= product_art($p) ?></div>
      <?php endforeach ?>
    </div>
  </div>
</section>

<section class="usp">
  <div class="container usp__grid">
    <div><?= icon('glass', 22) ?><span><strong><?= e(t('usp.1')) ?></strong><?= e(t('usp.1_sub')) ?></span></div>
    <div><?= icon('truck', 22) ?><span><strong><?= e(t('usp.2')) ?></strong><?= e(t('usp.2_sub')) ?></span></div>
    <div><?= icon('building', 22) ?><span><strong><?= e(t('usp.3')) ?></strong><?= e(t('usp.3_sub')) ?></span></div>
    <div><?= icon('shield', 22) ?><span><strong><?= e(t('usp.4')) ?></strong><?= e(t('usp.4_sub')) ?></span></div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section__head">
      <div><span class="eyebrow"><?= e(t('home.cats_eyebrow')) ?></span><h2 class="h2"><?= e(t('home.cats_title')) ?></h2></div>
      <a class="link-arrow" href="<?= url('/shop') ?>"><?= e(t('home.all_products')) ?> <?= icon('arrow', 16) ?></a>
    </div>
    <div class="tiles">
      <?php foreach ($wineCats as $c): ?>
        <a class="tile tile--<?= e($c['slug']) ?>" href="<?= url('/shop/' . $c['slug']) ?>">
          <span class="tile__name"><?= e(tf($c['name_json'])) ?></span>
          <span class="tile__go"><?= icon('arrow', 18) ?></span>
        </a>
      <?php endforeach ?>
    </div>
    <div class="chips chips--center">
      <?php foreach ($specCats as $c): ?>
        <a class="chip" href="<?= url('/shop/' . $c['slug']) ?>"><?= e(tf($c['name_json'])) ?></a>
      <?php endforeach ?>
    </div>
  </div>
</section>

<section class="section section--tint">
  <div class="container">
    <div class="section__head">
      <div><span class="eyebrow"><?= e(t('home.featured_eyebrow')) ?></span><h2 class="h2"><?= e(t('home.featured_title')) ?></h2></div>
      <a class="link-arrow" href="<?= url('/shop', ['sort' => 'new']) ?>"><?= e(t('home.discover')) ?> <?= icon('arrow', 16) ?></a>
    </div>
    <div class="grid grid--4">
      <?php foreach ($featured as $p): ?><?= $this->partial('product-card', ['p' => $p]) ?><?php endforeach ?>
    </div>
  </div>
</section>

<section class="section">
  <div class="container split">
    <div class="split__text">
      <span class="eyebrow"><?= e(t('home.story_eyebrow')) ?></span>
      <h2 class="h2"><?= e(t('home.story_title')) ?></h2>
      <p class="lead"><?= e(t('home.story_text')) ?></p>
      <a class="btn btn--ghost" href="<?= url('/producers') ?>"><?= e(t('home.story_cta')) ?></a>
    </div>
    <ul class="producer-list">
      <?php foreach ($producers as $pr): ?>
        <li>
          <a href="<?= url('/producers/' . $pr['slug']) ?>">
            <span class="producer-list__name"><?= e($pr['name']) ?></span>
            <span class="producer-list__region"><?= e($pr['region']) ?></span>
            <?= icon('arrow', 16) ?>
          </a>
        </li>
      <?php endforeach ?>
    </ul>
  </div>
</section>

<section class="b2b-teaser">
  <div class="container b2b-teaser__inner">
    <div>
      <span class="eyebrow eyebrow--light"><?= e(t('home.b2b_eyebrow')) ?></span>
      <h2 class="h2"><?= e(t('home.b2b_title')) ?></h2>
      <p><?= e(t('home.b2b_text')) ?></p>
    </div>
    <ul class="checklist checklist--light">
      <li><?= icon('check', 18) ?><?= e(t('b2b.feat1')) ?></li>
      <li><?= icon('check', 18) ?><?= e(t('b2b.feat2')) ?></li>
      <li><?= icon('check', 18) ?><?= e(t('b2b.feat3')) ?></li>
      <li><?= icon('check', 18) ?><?= e(t('b2b.feat4')) ?></li>
    </ul>
    <a class="btn btn--light btn--lg" href="<?= url('/b2b') ?>"><?= e(t('home.b2b_cta')) ?> <?= icon('arrow', 18) ?></a>
  </div>
</section>
