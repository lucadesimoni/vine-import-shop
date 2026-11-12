<?php $addr = (array) config('shop.address', []); ?>
<section class="newsletter">
  <div class="container newsletter__inner">
    <div>
      <span class="eyebrow eyebrow--light"><?= e(t('newsletter.eyebrow')) ?></span>
      <h2><?= e(t('newsletter.title')) ?></h2>
      <p><?= e(t('newsletter.text')) ?></p>
    </div>
    <form action="<?= url('/newsletter') ?>" method="post" class="newsletter__form" data-ajax-form>
      <?= csrf_field() ?>
      <input type="email" name="email" required placeholder="<?= e(t('form.email')) ?>" aria-label="<?= e(t('form.email')) ?>">
      <button class="btn btn--light"><?= e(t('newsletter.cta')) ?></button>
    </form>
  </div>
</section>
<footer class="footer">
  <div class="container footer__grid">
    <div class="footer__brand">
      <a class="logo logo--light" href="<?= url('/') ?>">
        <span class="logo__mark"><?= e(mb_substr((string) config('app.name'), 0, 1)) ?></span>
        <span class="logo__text"><?= e(config('app.name')) ?><small><?= e(t('brand.sub')) ?></small></span>
      </a>
      <p><?= e(config('app.tagline')) ?></p>
      <address>
        <?= e($addr['street'] ?? '') ?><br><?= e(($addr['zip'] ?? '') . ' ' . ($addr['city'] ?? '')) ?><br>
        <a href="mailto:<?= e(config('shop.email')) ?>"><?= e(config('shop.email')) ?></a><br>
        <a href="tel:<?= e(preg_replace('/\s+/', '', (string) config('shop.phone'))) ?>"><?= e(config('shop.phone')) ?></a>
      </address>
    </div>
    <div>
      <h3><?= e(t('footer.shop')) ?></h3>
      <a href="<?= url('/shop/rotwein') ?>"><?= e(t('cat.red')) ?></a>
      <a href="<?= url('/shop/weisswein') ?>"><?= e(t('cat.white')) ?></a>
      <a href="<?= url('/shop/schaumwein') ?>"><?= e(t('cat.sparkling')) ?></a>
      <a href="<?= url('/shop', ['type' => 'speciality']) ?>"><?= e(t('nav.specialities')) ?></a>
      <a href="<?= url('/producers') ?>"><?= e(t('nav.producers')) ?></a>
    </div>
    <div>
      <h3><?= e(t('footer.trade')) ?></h3>
      <a href="<?= url('/b2b') ?>"><?= e(t('nav.b2b')) ?></a>
      <a href="<?= url('/b2b/quick-order') ?>"><?= e(t('b2b.quick_order')) ?></a>
      <a href="<?= url('/b2b/pricelist.csv') ?>"><?= e(t('b2b.pricelist')) ?></a>
      <a href="<?= url('/account') ?>"><?= e(t('nav.account')) ?></a>
    </div>
    <div>
      <h3><?= e(t('footer.service')) ?></h3>
      <a href="<?= url('/page/shipping') ?>"><?= e(t('page.shipping')) ?></a>
      <a href="<?= url('/page/terms') ?>"><?= e(t('page.terms')) ?></a>
      <a href="<?= url('/page/privacy') ?>"><?= e(t('page.privacy')) ?></a>
      <a href="<?= url('/page/imprint') ?>"><?= e(t('page.imprint')) ?></a>
      <a href="<?= url('/contact') ?>"><?= e(t('nav.contact')) ?></a>
    </div>
  </div>
  <div class="container footer__bottom">
    <span>© <?= date('Y') ?> <?= e(config('app.name')) ?> · <?= e(config('shop.uid')) ?></span>
    <span class="footer__pay">
      <span class="pay-chip">TWINT</span><span class="pay-chip">VISA</span><span class="pay-chip">Mastercard</span><span class="pay-chip"><?= e(t('payment.invoice')) ?></span>
    </span>
    <span><?= e(t('footer.age', ['age' => (string) config('shop.min_age', 18)])) ?></span>
  </div>
</footer>
