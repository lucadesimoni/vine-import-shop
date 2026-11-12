<?php $this->section('title', t('auth.login')); ?>
<section class="container auth">
  <div class="auth__card">
    <span class="eyebrow"><?= e(t('auth.welcome_back')) ?></span>
    <h1 class="h1"><?= e(t('auth.login')) ?></h1>
    <form method="post" action="<?= url('/login') ?>" class="stack">
      <?= csrf_field() ?>
      <label class="field"><span><?= e(t('form.email')) ?></span><input type="email" name="email" required autocomplete="email" autofocus></label>
      <label class="field"><span><?= e(t('form.password')) ?></span><input type="password" name="password" required autocomplete="current-password"></label>
      <button class="btn btn--primary btn--lg btn--block"><?= e(t('auth.login')) ?></button>
      <a class="btn btn--text" href="<?= url('/password/forgot') ?>"><?= e(t('auth.forgot')) ?></a>
    </form>
  </div>
  <div class="auth__side">
    <div>
      <h2 class="h3"><?= e(t('auth.new_here')) ?></h2>
      <p class="muted"><?= e(t('auth.new_text')) ?></p>
      <a class="btn btn--ghost" href="<?= url('/register') ?>"><?= e(t('auth.register')) ?></a>
    </div>
    <div>
      <h2 class="h3"><?= e(t('auth.trade')) ?></h2>
      <p class="muted"><?= e(t('auth.trade_text')) ?></p>
      <a class="btn btn--ghost" href="<?= url('/b2b') ?>"><?= e(t('b2b.apply')) ?></a>
    </div>
    <?php if (config('install.demo_data', true)): ?>
      <div class="demo-hint">
        <strong>Demo</strong>
        <code>kunde@example.com / kunde-demo</code>
        <code>b2b@example.com / b2b-demo</code>
      </div>
    <?php endif ?>
  </div>
</section>
