<?php
/** @var array $orders @var array $user @var array $group */
$this->section('title', t('nav.account'));
$billing = json_field($user['billing_json']);
?>
<section class="page-head page-head--slim">
  <div class="container">
    <span class="eyebrow"><?= e($group['name']) ?><?= $user['company'] ? ' · ' . e($user['company']) : '' ?></span>
    <h1 class="h1"><?= e(t('account.hello', ['name' => $user['name'] ?: $user['email']])) ?></h1>
  </div>
</section>
<section class="container account">
  <?php include __DIR__ . '/_nav.php'; ?>
  <div class="account__main">
    <?php if ($user['b2b_status'] === 'pending'): ?>
      <div class="note note--info"><?= icon('building', 16) ?> <?= e(t('b2b.pending')) ?></div>
    <?php elseif ($user['b2b_status'] === 'rejected'): ?>
      <div class="note note--warn"><?= e(t('b2b.rejected')) ?></div>
    <?php endif ?>

    <div class="panel">
      <h2 class="panel__title"><?= e(t('account.orders')) ?></h2>
      <?php if (!$orders): ?>
        <p class="muted"><?= e(t('account.no_orders')) ?></p>
        <a class="btn btn--primary" href="<?= url('/shop') ?>"><?= e(t('cart.discover')) ?></a>
      <?php else: ?>
        <div class="table-wrap">
        <table class="table">
          <thead><tr><th><?= e(t('done.number')) ?></th><th><?= e(t('account.date')) ?></th><th><?= e(t('done.status')) ?></th><th class="num"><?= e(t('cart.total')) ?></th><th></th></tr></thead>
          <tbody>
            <?php foreach ($orders as $o): ?>
              <tr>
                <td><a href="<?= url('/account/orders/' . $o['number']) ?>"><?= e($o['number']) ?></a></td>
                <td><?= e(date('d.m.Y', strtotime($o['created_at']))) ?></td>
                <td><span class="status status--<?= e($o['status']) ?>"><?= e(t('status.' . $o['status'])) ?></span></td>
                <td class="num"><?= money((int) $o['total_gross']) ?></td>
                <td class="num">
                  <form method="post" action="<?= url('/account/orders/' . $o['number'] . '/reorder') ?>"><?= csrf_field() ?><button class="btn btn--text btn--sm"><?= icon('refresh', 14) ?> <?= e(t('account.reorder')) ?></button></form>
                </td>
              </tr>
            <?php endforeach ?>
          </tbody>
        </table>
        </div>
      <?php endif ?>
    </div>

    <form class="panel" method="post" action="<?= url('/account/profile') ?>">
      <?= csrf_field() ?>
      <h2 class="panel__title"><?= e(t('account.profile')) ?></h2>
      <div class="form-grid">
        <label class="field"><span><?= e(t('form.name')) ?></span><input name="name" value="<?= e($user['name']) ?>"></label>
        <label class="field"><span><?= e(t('form.email')) ?></span><input value="<?= e($user['email']) ?>" disabled></label>
        <label class="field"><span><?= e(t('form.company')) ?></span><input name="billing[company]" value="<?= e($billing['company'] ?? '') ?>"></label>
        <label class="field"><span><?= e(t('form.phone')) ?></span><input name="phone" value="<?= e($user['phone'] ?? '') ?>"></label>
        <label class="field span-2"><span><?= e(t('form.street')) ?></span><input name="billing[street]" value="<?= e($billing['street'] ?? '') ?>"></label>
        <label class="field"><span><?= e(t('form.zip')) ?></span><input name="billing[zip]" value="<?= e($billing['zip'] ?? '') ?>"></label>
        <label class="field"><span><?= e(t('form.city')) ?></span><input name="billing[city]" value="<?= e($billing['city'] ?? '') ?>"></label>
        <input type="hidden" name="billing[name]" value="<?= e($billing['name'] ?? $user['name']) ?>">
        <input type="hidden" name="billing[country]" value="<?= e($billing['country'] ?? 'CH') ?>">
      </div>
      <details class="details">
        <summary><?= e(t('account.change_password')) ?></summary>
        <div class="form-grid">
          <label class="field"><span><?= e(t('account.current_password')) ?></span><input type="password" name="current_password" autocomplete="current-password"></label>
          <label class="field"><span><?= e(t('auth.new_password')) ?></span><input type="password" name="new_password" minlength="8" autocomplete="new-password"></label>
        </div>
      </details>
      <label class="check"><input type="checkbox" name="newsletter" value="1" <?= (int) $user['newsletter'] ? 'checked' : '' ?>> <?= e(t('newsletter.optin')) ?></label>
      <button class="btn btn--primary"><?= e(t('account.save')) ?></button>
    </form>

    <?php if (!$user['b2b_status']): ?>
      <div class="panel panel--accent">
        <h2 class="panel__title"><?= e(t('auth.trade')) ?></h2>
        <p><?= e(t('auth.trade_text')) ?></p>
        <a class="btn btn--ghost" href="<?= url('/b2b') ?>"><?= e(t('b2b.apply')) ?></a>
      </div>
    <?php endif ?>
  </div>
</section>
