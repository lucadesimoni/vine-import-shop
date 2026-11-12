<?php $this->section('title', t('auth.forgot')); ?>
<section class="container auth auth--single">
  <div class="auth__card">
    <h1 class="h1"><?= e(t('auth.forgot')) ?></h1>
    <p class="muted"><?= e(t('auth.forgot_text')) ?></p>
    <form method="post" action="<?= url('/password/forgot') ?>" class="stack">
      <?= csrf_field() ?>
      <label class="field"><span><?= e(t('form.email')) ?></span><input type="email" name="email" required autocomplete="email"></label>
      <button class="btn btn--primary btn--block"><?= e(t('auth.send_link')) ?></button>
    </form>
  </div>
</section>
