<?php /** @var int $status @var string $message */ $this->section('title', (string) $status); ?>
<section class="container empty empty--wide">
  <span class="display"><?= (int) $status ?></span>
  <h1 class="h2"><?= e($status === 403 ? t('error.403') : ($status === 419 ? t('error.419') : t('error.500'))) ?></h1>
  <?php if ($message): ?><pre class="error-detail"><?= e($message) ?></pre><?php endif ?>
  <a class="btn btn--primary" href="<?= url('/') ?>"><?= e(t('nav.home')) ?></a>
</section>
