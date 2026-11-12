<nav class="subnav" aria-label="<?= e(t('nav.account')) ?>">
  <a href="<?= url('/account') ?>" class="<?= is_path('/account') && !is_path('/account/wishlist') ? 'is-active' : '' ?>"><?= icon('user', 16) ?> <?= e(t('account.overview')) ?></a>
  <a href="<?= url('/account/wishlist') ?>" class="<?= is_path('/account/wishlist') ? 'is-active' : '' ?>"><?= icon('heart', 16) ?> <?= e(t('nav.wishlist')) ?></a>
  <?php if (auth()->isB2B()): ?>
    <a href="<?= url('/b2b/portal') ?>"><?= icon('building', 16) ?> <?= e(t('nav.portal')) ?></a>
    <a href="<?= url('/b2b/quick-order') ?>"><?= icon('file', 16) ?> <?= e(t('b2b.quick_order')) ?></a>
  <?php endif ?>
  <?php if (auth()->isAdmin()): ?><a href="<?= url('/admin') ?>"><?= icon('box', 16) ?> Admin</a><?php endif ?>
  <form method="post" action="<?= url('/logout') ?>"><?= csrf_field() ?><button class="btn btn--text"><?= icon('logout', 16) ?> <?= e(t('auth.logout')) ?></button></form>
</nav>
