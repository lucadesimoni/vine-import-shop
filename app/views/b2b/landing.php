<?php
/** @var ?array $user @var array $old */
$this->section('title', t('nav.b2b'));
$o = fn (string $k, string $d = '') => e($old[$k] ?? $d);
$pending = ($user['b2b_status'] ?? null) === 'pending';
?>
<section class="page-head page-head--dark">
  <div class="container b2b-hero">
    <div>
      <span class="eyebrow eyebrow--light"><?= e(t('home.b2b_eyebrow')) ?></span>
      <h1 class="display display--sm"><?= e(t('b2b.title')) ?></h1>
      <p class="lead"><?= e(t('b2b.lead')) ?></p>
    </div>
    <ul class="checklist checklist--light">
      <li><?= icon('check', 18) ?><?= e(t('b2b.feat1')) ?></li>
      <li><?= icon('check', 18) ?><?= e(t('b2b.feat2')) ?></li>
      <li><?= icon('check', 18) ?><?= e(t('b2b.feat3')) ?></li>
      <li><?= icon('check', 18) ?><?= e(t('b2b.feat4')) ?></li>
      <li><?= icon('check', 18) ?><?= e(t('b2b.feat5')) ?></li>
    </ul>
  </div>
</section>

<section class="container section">
  <div class="features">
    <div class="feature"><?= icon('building', 26) ?><h3><?= e(t('b2b.seg1')) ?></h3><p><?= e(t('b2b.seg1_text')) ?></p></div>
    <div class="feature"><?= icon('glass', 26) ?><h3><?= e(t('b2b.seg2')) ?></h3><p><?= e(t('b2b.seg2_text')) ?></p></div>
    <div class="feature"><?= icon('box', 26) ?><h3><?= e(t('b2b.seg3')) ?></h3><p><?= e(t('b2b.seg3_text')) ?></p></div>
  </div>
</section>

<section class="container section section--flush" id="apply">
  <div class="apply">
    <div class="apply__intro">
      <span class="eyebrow"><?= e(t('b2b.apply_eyebrow')) ?></span>
      <h2 class="h2"><?= e(t('b2b.apply')) ?></h2>
      <p class="muted"><?= e(t('b2b.apply_text')) ?></p>
      <?php if (!$user): ?><p class="muted"><?= t('checkout.have_account', ['link' => '<a href="' . url('/login') . '">' . e(t('auth.login')) . '</a>']) ?></p><?php endif ?>
    </div>
    <?php if ($pending): ?>
      <div class="panel"><p class="note note--info"><?= icon('building', 16) ?> <?= e(t('b2b.pending')) ?></p></div>
    <?php else: ?>
    <form method="post" action="<?= url('/b2b/apply') ?>" class="panel">
      <?= csrf_field() ?>
      <div class="form-grid">
        <label class="field"><span><?= e(t('form.company')) ?> *</span><input name="company" required value="<?= $o('company', $user['company'] ?? '') ?>" autocomplete="organization"></label>
        <label class="field"><span><?= e(t('b2b.uid')) ?> *</span><input name="uid_number" required placeholder="CHE-123.456.789" value="<?= $o('uid_number') ?>"></label>
        <label class="field"><span><?= e(t('b2b.business_type')) ?></span>
          <select name="business_type">
            <option value="retail" <?= ($old['business_type'] ?? '') === 'retail' ? 'selected' : '' ?>><?= e(t('b2b.seg1')) ?></option>
            <option value="gastro" <?= ($old['business_type'] ?? '') === 'gastro' ? 'selected' : '' ?>><?= e(t('b2b.seg2')) ?></option>
            <option value="corporate" <?= ($old['business_type'] ?? '') === 'corporate' ? 'selected' : '' ?>><?= e(t('b2b.seg3')) ?></option>
          </select>
        </label>
        <label class="field"><span><?= e(t('form.name')) ?> *</span><input name="name" required value="<?= $o('name', $user['name'] ?? '') ?>" autocomplete="name"></label>
        <?php if (!$user): ?>
          <label class="field"><span><?= e(t('form.email')) ?> *</span><input type="email" name="email" required value="<?= $o('email') ?>" autocomplete="email"></label>
          <label class="field"><span><?= e(t('form.password')) ?> *</span><input type="password" name="password" minlength="8" required autocomplete="new-password"></label>
        <?php endif ?>
        <label class="field"><span><?= e(t('form.phone')) ?></span><input name="phone" value="<?= $o('phone') ?>" autocomplete="tel"></label>
        <label class="field span-2"><span><?= e(t('form.street')) ?></span><input name="street" value="<?= $o('street') ?>"></label>
        <label class="field"><span><?= e(t('form.zip')) ?></span><input name="zip" value="<?= $o('zip') ?>"></label>
        <label class="field"><span><?= e(t('form.city')) ?></span><input name="city" value="<?= $o('city') ?>"></label>
        <label class="field span-2"><span><?= e(t('b2b.message')) ?></span><textarea name="message" rows="3"><?= $o('message') ?></textarea></label>
      </div>
      <button class="btn btn--primary btn--lg"><?= e(t('b2b.submit')) ?></button>
    </form>
    <?php endif ?>
  </div>
</section>
