<?php $this->section('title', t('nav.contact')); $addr = (array) config('shop.address', []); ?>
<section class="page-head page-head--slim">
  <div class="container"><span class="eyebrow"><?= e(t('contact.eyebrow')) ?></span><h1 class="h1"><?= e(t('contact.title')) ?></h1></div>
</section>
<section class="container split split--top">
  <form method="post" action="<?= url('/contact') ?>" class="panel stack">
    <?= csrf_field() ?>
    <div class="form-grid">
      <label class="field"><span><?= e(t('form.name')) ?></span><input name="name" required autocomplete="name"></label>
      <label class="field"><span><?= e(t('form.email')) ?></span><input type="email" name="email" required autocomplete="email"></label>
      <label class="field span-2"><span><?= e(t('contact.subject')) ?></span>
        <select name="subject">
          <option><?= e(t('contact.s_general')) ?></option>
          <option><?= e(t('contact.s_order')) ?></option>
          <option><?= e(t('contact.s_b2b')) ?></option>
          <option><?= e(t('contact.s_event')) ?></option>
        </select>
      </label>
      <label class="field span-2"><span><?= e(t('contact.message')) ?></span><textarea name="message" rows="6" required></textarea></label>
      <label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
    </div>
    <button class="btn btn--primary"><?= e(t('contact.send')) ?></button>
  </form>
  <div class="contact-card">
    <h2 class="h3"><?= e(config('app.name')) ?></h2>
    <address><?= e($addr['street'] ?? '') ?><br><?= e(($addr['zip'] ?? '') . ' ' . ($addr['city'] ?? '')) ?><br><?= e($addr['country'] ?? '') ?></address>
    <p><a href="mailto:<?= e(config('shop.email')) ?>"><?= e(config('shop.email')) ?></a><br><a href="tel:<?= e(preg_replace('/\s+/', '', (string) config('shop.phone'))) ?>"><?= e(config('shop.phone')) ?></a></p>
    <h3 class="h4"><?= e(t('contact.hours')) ?></h3>
    <p class="muted"><?= e(t('contact.hours_text')) ?></p>
  </div>
</section>
