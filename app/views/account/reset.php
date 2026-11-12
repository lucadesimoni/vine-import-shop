<?php /** @var string $token @var string $email */ $this->section('title', t('auth.new_password')); ?>
<section class="container auth auth--single">
  <div class="auth__card">
    <h1 class="h1"><?= e(t('auth.new_password')) ?></h1>
    <form method="post" action="<?= url('/password/reset') ?>" class="stack">
      <?= csrf_field() ?>
      <input type="hidden" name="token" value="<?= e($token) ?>">
      <input type="hidden" name="email" value="<?= e($email) ?>">
      <label class="field"><span><?= e(t('form.password')) ?> <small class="muted">(<?= e(t('auth.min8')) ?>)</small></span><input type="password" name="password" minlength="8" required autocomplete="new-password"></label>
      <button class="btn btn--primary btn--block"><?= e(t('auth.save_password')) ?></button>
    </form>
  </div>
</section>
