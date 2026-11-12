<?php
/** @var string $slug */
$this->section('title', t('page.' . $slug));
// Edit page texts in app/lang/*.php (keys pagebody.*) or override this view in app/views/theme/content/page.php
?>
<section class="page-head page-head--slim">
  <div class="container"><h1 class="h1"><?= e(t('page.' . $slug)) ?></h1></div>
</section>
<section class="container prose">
  <?= t('pagebody.' . $slug, [
      'name' => e(config('app.name')),
      'email' => e(config('shop.email')),
      'address' => e(implode(', ', (array) config('shop.address', []))),
      'uid' => e(config('shop.uid')),
      'age' => (string) config('shop.min_age', 18),
  ]) ?>
</section>
