<?php
/** @var array $stats @var array $favourites @var array $orders @var array $group */
$this->section('title', t('nav.portal'));
$user = auth()->user();
?>
<section class="page-head page-head--slim">
  <div class="container">
    <span class="eyebrow"><?= e($group['name']) ?> · <?= e($user['company'] ?? '') ?></span>
    <h1 class="h1"><?= e(t('nav.portal')) ?></h1>
  </div>
</section>
<section class="container account">
  <?php include dirname(__DIR__) . '/account/_nav.php'; ?>
  <div class="account__main">
    <div class="kpis">
      <div class="kpi"><span><?= e(t('b2b.kpi_orders')) ?></span><strong><?= (int) $stats['orders'] ?></strong></div>
      <div class="kpi"><span><?= e(t('b2b.kpi_open')) ?></span><strong><?= (int) $stats['open'] ?></strong></div>
      <div class="kpi"><span><?= e(t('b2b.kpi_volume')) ?></span><strong><?= money($stats['revenue_net']) ?></strong></div>
      <div class="kpi"><span><?= e(t('b2b.kpi_minimum')) ?></span><strong><?= money((int) $group['min_order_net']) ?></strong></div>
    </div>

    <div class="quick-actions">
      <a class="action-card" href="<?= url('/b2b/quick-order') ?>"><?= icon('file', 22) ?><strong><?= e(t('b2b.quick_order')) ?></strong><span><?= e(t('b2b.quick_order_text')) ?></span></a>
      <a class="action-card" href="<?= url('/b2b/pricelist.csv') ?>"><?= icon('box', 22) ?><strong><?= e(t('b2b.pricelist')) ?></strong><span><?= e(t('b2b.pricelist_text')) ?></span></a>
      <a class="action-card" href="<?= url('/shop') ?>"><?= icon('glass', 22) ?><strong><?= e(t('b2b.browse')) ?></strong><span><?= e(t('b2b.browse_text')) ?></span></a>
    </div>

    <?php if ($favourites): ?>
      <div class="panel">
        <h2 class="panel__title"><?= e(t('b2b.favourites')) ?></h2>
        <form method="post" action="<?= url('/b2b/quick-order') ?>">
          <?= csrf_field() ?><input type="hidden" name="go" value="cart">
          <div class="table-wrap">
          <table class="table">
            <thead><tr><th>SKU</th><th><?= e(t('cart.product')) ?></th><th class="num"><?= e(t('b2b.ordered')) ?></th><th class="num"><?= e(t('price.net')) ?></th><th class="num"><?= e(t('cart.qty')) ?></th></tr></thead>
            <tbody>
              <?php $pricing = app()->get(App\Shop\Pricing::class); foreach ($favourites as $p): $pr = $pricing->price($p, $group); ?>
                <tr>
                  <td class="mono"><?= e($p['sku']) ?><input type="hidden" name="sku[]" value="<?= e($p['sku']) ?>"></td>
                  <td><a href="<?= product_url($p) ?>"><?= e(tf($p['name_json'])) ?></a> <small class="muted"><?= e($p['vintage']) ?></small></td>
                  <td class="num"><?= (int) $p['total_qty'] ?></td>
                  <td class="num"><?= money($pr['net']) ?></td>
                  <td class="num"><input class="qty-input" type="number" name="qty[]" min="0" value="0" step="<?= max(1, (int) $p['case_size']) ?>" aria-label="<?= e(t('cart.qty')) ?>"></td>
                </tr>
              <?php endforeach ?>
            </tbody>
          </table>
          </div>
          <button class="btn btn--primary"><?= icon('cart', 16) ?> <?= e(t('b2b.add_selected')) ?></button>
        </form>
      </div>
    <?php endif ?>

    <div class="panel">
      <h2 class="panel__title"><?= e(t('account.orders')) ?></h2>
      <?php if (!$orders): ?><p class="muted"><?= e(t('account.no_orders')) ?></p><?php else: ?>
        <div class="table-wrap">
        <table class="table">
          <thead><tr><th><?= e(t('done.number')) ?></th><th><?= e(t('account.date')) ?></th><th><?= e(t('checkout.po_number')) ?></th><th><?= e(t('done.status')) ?></th><th class="num"><?= e(t('price.net')) ?></th><th></th></tr></thead>
          <tbody>
            <?php foreach ($orders as $o): ?>
              <tr>
                <td><a href="<?= url('/account/orders/' . $o['number']) ?>"><?= e($o['number']) ?></a></td>
                <td><?= e(date('d.m.Y', strtotime($o['created_at']))) ?></td>
                <td><?= e($o['po_number'] ?? '—') ?></td>
                <td><span class="status status--<?= e($o['status']) ?>"><?= e(t('status.' . $o['status'])) ?></span></td>
                <td class="num"><?= money((int) $o['subtotal_net']) ?></td>
                <td class="num"><form method="post" action="<?= url('/account/orders/' . $o['number'] . '/reorder') ?>"><?= csrf_field() ?><button class="btn btn--text btn--sm"><?= icon('refresh', 14) ?> <?= e(t('account.reorder')) ?></button></form></td>
              </tr>
            <?php endforeach ?>
          </tbody>
        </table>
        </div>
      <?php endif ?>
    </div>
  </div>
</section>
