<?php /** @var array $orders @var array $filters */ $this->section('title', 'Bestellungen'); $f = fn ($k) => e($filters[$k] ?? ''); ?>
<header class="admin__head"><h1>Bestellungen</h1></header>
<form class="admin__filters" method="get">
  <input name="q" placeholder="Nr., E-Mail, Name" value="<?= $f('q') ?>">
  <select name="status" data-autosubmit><option value="">Alle Status</option><?php foreach (App\Shop\OrderService::statuses() as $s): ?><option <?= ($filters['status'] ?? '') === $s ? 'selected' : '' ?>><?= $s ?></option><?php endforeach ?></select>
  <select name="b2b" data-autosubmit><option value="">B2B + B2C</option><option value="1" <?= ($filters['b2b'] ?? '') === '1' ? 'selected' : '' ?>>nur B2B</option><option value="0" <?= ($filters['b2b'] ?? '') === '0' ? 'selected' : '' ?>>nur B2C</option></select>
  <button class="btn btn--ghost btn--sm">Filtern</button>
</form>
<div class="panel"><?= $this->partial('admin-orders', ['orders' => $orders]) ?></div>
