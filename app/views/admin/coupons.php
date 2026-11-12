<?php /** @var array $coupons */ $this->section('title', 'Gutscheine'); ?>
<header class="admin__head"><h1>Gutscheine</h1></header>
<form method="post" action="<?= url('/admin/coupons') ?>" class="panel admin__filters">
  <?= csrf_field() ?>
  <input name="code" placeholder="CODE" required class="mono">
  <select name="type"><option value="percent">%</option><option value="fixed">CHF</option></select>
  <input name="value" placeholder="Wert" required>
  <input name="min_total" placeholder="Mindestbetrag CHF">
  <input type="date" name="expires_at" aria-label="Gültig bis">
  <label class="check"><input type="checkbox" name="b2c_only" value="1" checked> nur B2C</label>
  <button class="btn btn--primary btn--sm">Erstellen</button>
</form>
<div class="panel"><table class="table">
  <thead><tr><th>Code</th><th>Rabatt</th><th>Mindestbetrag</th><th>Gültig bis</th><th>Status</th><th></th></tr></thead>
  <tbody><?php foreach ($coupons as $c): ?>
    <tr><td class="mono"><?= e($c['code']) ?></td><td><?= $c['type'] === 'percent' ? (int) $c['value'] . ' %' : money((int) $c['value']) ?></td><td><?= money((int) $c['min_total']) ?></td><td><?= e($c['expires_at'] ?? '—') ?></td>
    <td><?= (int) $c['active'] ? '<span class="status status--completed">aktiv</span>' : '<span class="status status--cancelled">inaktiv</span>' ?><?= (int) $c['b2c_only'] ? ' <span class="tag">B2C</span>' : '' ?></td>
    <td><form method="post" action="<?= url('/admin/coupons/' . $c['id'] . '/toggle') ?>"><?= csrf_field() ?><button class="btn btn--text btn--sm"><?= (int) $c['active'] ? 'Deaktivieren' : 'Aktivieren' ?></button></form></td></tr>
  <?php endforeach ?></tbody>
</table></div>
