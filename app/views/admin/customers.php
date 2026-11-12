<?php /** @var array $customers @var array $groups @var array $filters */ $this->section('title', 'Kunden'); ?>
<header class="admin__head"><h1>Kunden</h1></header>
<form class="admin__filters" method="get">
  <input name="q" placeholder="Name, Firma, E-Mail" value="<?= e($filters['q'] ?? '') ?>">
  <select name="status" data-autosubmit><option value="">Alle</option><?php foreach (['pending' => 'B2B offen', 'approved' => 'B2B freigegeben', 'rejected' => 'B2B abgelehnt'] as $k => $l): ?><option value="<?= $k ?>" <?= ($filters['status'] ?? '') === $k ? 'selected' : '' ?>><?= $l ?></option><?php endforeach ?></select>
  <button class="btn btn--ghost btn--sm">Filtern</button>
</form>
<div class="panel"><div class="table-wrap"><table class="table">
  <thead><tr><th>Kunde</th><th>Firma / UID</th><th>Gruppe</th><th>B2B</th><th class="num">Best.</th><th>vinX</th><th>Aktion</th></tr></thead>
  <tbody><?php foreach ($customers as $c): ?>
    <tr class="<?= $c['b2b_status'] === 'pending' ? 'is-highlight' : '' ?>">
      <td><?= e($c['name']) ?><br><a class="small" href="mailto:<?= e($c['email']) ?>"><?= e($c['email']) ?></a></td>
      <td><?= e($c['company'] ?? '—') ?><br><span class="mono small muted"><?= e($c['uid_number'] ?? '') ?></span></td>
      <td><?= e($c['group_name'] ?? '—') ?></td>
      <td><?= $c['b2b_status'] ? '<span class="status status--' . e($c['b2b_status']) . '">' . e($c['b2b_status']) . '</span>' : '—' ?></td>
      <td class="num"><?= (int) $c['order_count'] ?></td>
      <td class="mono small"><?= e($c['erp_id'] ?? '—') ?></td>
      <td>
        <form method="post" action="<?= url('/admin/customers/' . $c['id']) ?>" class="admin__inline">
          <?= csrf_field() ?>
          <select name="customer_group_id" aria-label="Gruppe"><?php foreach ($groups as $g): ?><option value="<?= (int) $g['id'] ?>" <?= (int) $c['customer_group_id'] === (int) $g['id'] ? 'selected' : '' ?>><?= e($g['name']) ?></option><?php endforeach ?></select>
          <?php if ($c['b2b_status'] === 'pending'): ?>
            <button class="btn btn--primary btn--sm" name="action" value="approve">Freigeben</button>
            <button class="btn btn--ghost btn--sm" name="action" value="reject">Ablehnen</button>
          <?php else: ?>
            <button class="btn btn--ghost btn--sm">Speichern</button>
          <?php endif ?>
        </form>
      </td>
    </tr>
  <?php endforeach ?></tbody>
</table></div></div>
