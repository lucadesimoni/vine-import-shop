<?php /** @var array $kpi @var array $orders @var array $lowStock @var array $daily */ $this->section('title', 'Dashboard');
$max = max(1, ...array_map(fn ($d) => (int) $d['total'], $daily ?: [['total' => 1]])); ?>
<header class="admin__head"><h1>Dashboard</h1><span class="muted">Letzte 30 Tage</span></header>
<div class="kpis">
  <div class="kpi"><span>Bestellungen</span><strong><?= $kpi['orders30'] ?></strong></div>
  <div class="kpi"><span>Umsatz brutto</span><strong><?= money($kpi['revenue30']) ?></strong></div>
  <div class="kpi"><span>davon B2B</span><strong><?= $kpi['revenue30'] ? round($kpi['b2b_share'] / $kpi['revenue30'] * 100) : 0 ?> %</strong></div>
  <a class="kpi <?= $kpi['pending_b2b'] ? 'kpi--alert' : '' ?>" href="<?= url('/admin/customers', ['status' => 'pending']) ?>"><span>B2B-Anfragen offen</span><strong><?= $kpi['pending_b2b'] ?></strong></a>
  <a class="kpi" href="<?= url('/admin/products') ?>"><span>Tiefer Lagerbestand</span><strong><?= $kpi['low_stock'] ?></strong></a>
  <a class="kpi <?= $kpi['erp_failed'] ? 'kpi--alert' : '' ?>" href="<?= url('/admin/vinx') ?>"><span>vinX Fehler</span><strong><?= $kpi['erp_failed'] ?></strong></a>
</div>
<div class="panel">
  <h2 class="panel__title">Umsatz pro Tag</h2>
  <?php if (!$daily): ?><p class="muted">Noch keine Bestellungen.</p><?php else: ?>
  <div class="bars" role="img" aria-label="Umsatz pro Tag">
    <?php foreach ($daily as $d): ?><div class="bars__bar" style="--h: <?= round((int) $d['total'] / $max * 100) ?>%" title="<?= e(date('d.m.', strtotime($d['day']))) ?>: <?= money((int) $d['total']) ?> (<?= (int) $d['n'] ?>)"><span><?= e(date('d.m.', strtotime($d['day']))) ?></span></div><?php endforeach ?>
  </div>
  <?php endif ?>
</div>
<div class="grid grid--2">
  <div class="panel">
    <h2 class="panel__title">Neueste Bestellungen</h2>
    <?= $this->partial('admin-orders', ['orders' => $orders]) ?>
  </div>
  <div class="panel">
    <h2 class="panel__title">Nachbestellen</h2>
    <table class="table"><tbody>
      <?php foreach ($lowStock as $p): ?><tr><td class="mono"><a href="<?= url('/admin/products/' . $p['id']) ?>"><?= e($p['sku']) ?></a></td><td><?= e(tf($p['name_json'])) ?> <?= e($p['vintage']) ?></td><td class="num"><span class="status status--<?= $p['stock'] > 0 ? 'pending' : 'cancelled' ?>"><?= (int) $p['stock'] ?></span></td></tr><?php endforeach ?>
    </tbody></table>
  </div>
</div>
