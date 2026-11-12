<?php $this->section('title', t('auth.register')); ?>
<section class="container auth">
  <div class="auth__card">
    <span class="eyebrow"><?= e(config('app.name')) ?></span>
    <h1 class="h1"><?= e(t('auth.register')) ?></h1>
    <form method="post" action="<?= url('/register') ?>" class="stack">
      <?= csrf_field() ?>
      <label class="field"><span><?= e(t('form.name')) ?></span><input type="text" name="name" value="<?= old('name') ?>" required autocomplete="name"></label>
      <label class="field"><span><?= e(t('form.email')) ?></span><input type="email" name="email" value="<?= old('email') ?>" required autocomplete="email"></label>
      <label class="field"><span><?= e(t('form.password')) ?> <small class="muted">(<?= e(t('auth.min8')) ?>)</small></span><input type="password" name="password" minlength="8" required autocomplete="new-password"></label>
      <label class="check"><input type="checkbox" name="newsletter" value="1"> <?= e(t('newsletter.optin')) ?></label>
      <button class="btn btn--primary btn--lg btn--block"><?= e(t('auth.register')) ?></button>
      <p class="muted small"><?= e(t('auth.age_note', ['age' => (string) config('shop.min_age', 18)])) ?></p>
    </form>
  </div>
  <div class="auth__side">
    <ul class="checklist">
      <li><?= icon('check', 18) ?><?= e(t('auth.benefit1')) ?></li>
      <li><?= icon('check', 18) ?><?= e(t('auth.benefit2')) ?></li>
      <li><?= icon('check', 18) ?><?= e(t('auth.benefit3')) ?></li>
    </ul>
    <p class="muted"><?= t('auth.has_account', ['link' => '<a href="' . url('/login') . '">' . e(t('auth.login')) . '</a>']) ?></p>
  </div>
</section>
