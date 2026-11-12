<?php /** @var array $orders */ ?>
<div class="table-wrap"><table class="table">
  <thead><tr><th>Nr.</th><th>Datum</th><th>Kunde</th><th>Status</th><th>Zahlung</th><th>vinX</th><th class="num">Total</th></tr></thead>
  <tbody>
  <?php foreach ($orders as $o): $b = json_field($o['billing_json']); ?>
    <tr>
      <td><a href="<?= url('/admin/orders/' . $o['id']) ?>"><?= e($o['number']) ?></a><?= $o['is_b2b'] ? ' <span class="tag">B2B</span>' : '' ?></td>
      <td><?= e(date('d.m. H:i', strtotime($o['created_at']))) ?></td>
      <td><?= e($b['company'] ?? '' ?: ($b['name'] ?? $o['email'])) ?></td>
      <td><span class="status status--<?= e($o['status']) ?>"><?= e($o['status']) ?></span></td>
      <td><span class="status status--<?= e($o['payment_status']) ?>"><?= e($o['payment_method']) ?></span></td>
      <td><span class="status status--<?= e($o['erp_status']) ?>"><?= e($o['erp_status']) ?></span></td>
      <td class="num"><?= money((int) $o['total_gross']) ?></td>
    </tr>
  <?php endforeach ?>
  <?php if (!$orders): ?><tr><td colspan="7" class="muted">Keine Bestellungen</td></tr><?php endif ?>
  </tbody>
</table></div>
