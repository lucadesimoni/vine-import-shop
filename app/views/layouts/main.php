<?php
/** @var string $content */
$appName = (string) config('app.name');
$title = $this->section('title');
$desc = $this->section('description') ?: (string) config('app.tagline');
$cartCount = app()->get(App\Shop\Cart::class)->count();
$isB2B = auth()->isB2B();
$ageGate = (bool) config('shop.age_gate', true) && empty($_COOKIE['age_ok']);
?><!doctype html>
<html lang="<?= e(locale()) ?>">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= e($title ? "$title · $appName" : "$appName — " . config('app.tagline')) ?></title>
  <meta name="description" content="<?= e($desc) ?>">
  <meta name="csrf-token" content="<?= e(csrf_token()) ?>">
  <meta name="theme-color" content="#1b1917">
  <meta property="og:title" content="<?= e($title ?: $appName) ?>">
  <meta property="og:description" content="<?= e($desc) ?>">
  <meta property="og:type" content="website">
  <?php foreach ((array) config('app.locales') as $l): ?>
    <link rel="alternate" hreflang="<?= e($l) ?>" href="?lang=<?= e($l) ?>">
  <?php endforeach ?>
  <link rel="preload" href="<?= asset('fonts/fraunces.woff2') ?>" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="<?= asset('fonts/inter.woff2') ?>" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="<?= asset('css/app.css') ?>">
  <link rel="icon" href="<?= asset('img/favicon.svg') ?>" type="image/svg+xml">
  <?= $this->section('head') ?>
</head>
<body class="<?= $isB2B ? 'is-b2b' : '' ?>" data-base="<?= e(url('/')) ?>">
<a class="skip" href="#main"><?= e(t('nav.skip')) ?></a>

<div class="topbar">
  <div class="container topbar__inner">
    <p class="topbar__msg">
      <?php if ($isB2B): ?>
        <?= icon('building', 14) ?> <?= e(t('b2b.bar', ['group' => auth()->group()['name']])) ?>
      <?php else: ?>
        <?= icon('truck', 14) ?> <?= e(t('topbar.shipping', ['amount' => money((int) config('shipping.methods.post.free_from_gross', 25000))])) ?>
      <?php endif ?>
    </p>
    <nav class="topbar__links" aria-label="Service">
      <?php if (!$isB2B): ?><a href="<?= url('/b2b') ?>"><?= e(t('nav.b2b_short')) ?></a><?php endif ?>
      <a href="<?= url('/contact') ?>"><?= e(t('nav.contact')) ?></a>
      <div class="lang">
        <?php foreach ((array) config('app.locales') as $l): ?>
          <a href="?lang=<?= e($l) ?>" class="<?= $l === locale() ? 'is-active' : '' ?>" hreflang="<?= e($l) ?>"><?= e(strtoupper($l)) ?></a>
        <?php endforeach ?>
      </div>
    </nav>
  </div>
</div>

<header class="header" data-header>
  <div class="container header__inner">
    <button class="icon-btn header__burger" data-nav-open aria-label="<?= e(t('nav.menu')) ?>"><?= icon('menu', 22) ?></button>
    <a class="logo" href="<?= url('/') ?>" aria-label="<?= e($appName) ?>">
      <span class="logo__mark"><?= e(mb_substr($appName, 0, 1)) ?></span>
      <span class="logo__text"><?= e($appName) ?><small><?= e(t('brand.sub')) ?></small></span>
    </a>
    <nav class="nav" data-nav aria-label="<?= e(t('nav.main')) ?>">
      <button class="icon-btn nav__close" data-nav-close aria-label="<?= e(t('nav.close')) ?>"><?= icon('close') ?></button>
      <a href="<?= url('/shop', ['type' => 'wine']) ?>" class="<?= is_path('/shop') ? 'is-active' : '' ?>"><?= e(t('nav.wines')) ?></a>
      <a href="<?= url('/shop', ['type' => 'speciality']) ?>"><?= e(t('nav.specialities')) ?></a>
      <a href="<?= url('/shop/spirituosen') ?>"><?= e(t('nav.spirits')) ?></a>
      <a href="<?= url('/producers') ?>" class="<?= is_path('/producers') ? 'is-active' : '' ?>"><?= e(t('nav.producers')) ?></a>
      <a href="<?= url($isB2B ? '/b2b/portal' : '/b2b') ?>" class="nav__b2b <?= is_path('/b2b') ? 'is-active' : '' ?>"><?= e($isB2B ? t('nav.portal') : t('nav.b2b')) ?></a>
      <a href="<?= url('/page/about') ?>"><?= e(t('nav.about')) ?></a>
    </nav>
    <div class="header__actions">
      <button class="icon-btn" data-search-open aria-label="<?= e(t('nav.search')) ?>"><?= icon('search') ?></button>
      <a class="icon-btn" href="<?= url(auth()->check() ? '/account/wishlist' : '/login') ?>" aria-label="<?= e(t('nav.wishlist')) ?>"><?= icon('heart') ?></a>
      <a class="icon-btn" href="<?= url(auth()->check() ? (auth()->isAdmin() ? '/admin' : '/account') : '/login') ?>" aria-label="<?= e(t('nav.account')) ?>"><?= icon('user') ?></a>
      <a class="icon-btn cart-btn" href="<?= url('/cart') ?>" data-cart-open aria-label="<?= e(t('nav.cart')) ?>">
        <?= icon('cart') ?><span class="cart-btn__count" data-cart-count <?= $cartCount ? '' : 'hidden' ?>><?= $cartCount ?></span>
      </a>
    </div>
  </div>
  <form class="search" action="<?= url('/shop') ?>" method="get" data-search role="search">
    <div class="container search__inner">
      <?= icon('search') ?>
      <input type="search" name="q" placeholder="<?= e(t('search.placeholder')) ?>" aria-label="<?= e(t('nav.search')) ?>">
      <button class="icon-btn" type="button" data-search-close aria-label="<?= e(t('nav.close')) ?>"><?= icon('close') ?></button>
    </div>
  </form>
</header>

<main id="main">
  <?= $this->partial('flash') ?>
  <?= $content ?>
</main>

<?= $this->partial('footer') ?>

<div class="drawer" data-drawer aria-hidden="true">
  <div class="drawer__backdrop" data-drawer-close></div>
  <aside class="drawer__panel" role="dialog" aria-label="<?= e(t('nav.cart')) ?>" data-drawer-panel>
    <div class="drawer__loading"><?= e(t('common.loading')) ?></div>
  </aside>
</div>
<div class="toast" data-toast role="status" aria-live="polite"></div>

<?php if ($ageGate): ?>
<div class="age-gate" data-age-gate>
  <div class="age-gate__card">
    <span class="eyebrow"><?= e($appName) ?></span>
    <h2><?= e(t('age.title')) ?></h2>
    <p><?= e(t('age.text', ['age' => (string) config('shop.min_age', 18)])) ?></p>
    <div class="age-gate__actions">
      <button class="btn btn--primary" data-age-yes><?= e(t('age.yes')) ?></button>
      <a class="btn btn--ghost" href="https://www.sucht-schweiz.ch" rel="noopener"><?= e(t('age.no')) ?></a>
    </div>
  </div>
</div>
<?php endif ?>

<script src="<?= asset('js/app.js') ?>" defer></script>
<?= $this->section('scripts') ?>
</body>
</html>
