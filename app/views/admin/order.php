<?php /** @var array $order @var array $outbox */ $this->section('title', $order['number']); $b = json_field($order['billing_json']); $s = json_field($order['shipping_json']); ?>
<header class="admin__head">
  <div><a class="muted" href="<?= url('/admin/orders') ?>">← Bestellungen</a><h1><?= e($order['number']) ?> <?= $order['is_b2b'] ? '<span class="tag">B2B</span>' : '' ?></h1></div>
  <form method="post" action="<?= url('/admin/orders/' . $order['id']) ?>" class="admin__inline">
    <?= csrf_field() ?>
    <select name="status"><?php foreach (App\Shop\OrderService::statuses() as $st): ?><option <?= $order['status'] === $st ? 'selected' : '' ?>><?= $st ?></option><?php endforeach ?></select>
    <?php if ($order['payment_status'] !== 'paid'): ?><label class="check"><input type="checkbox" name="paid" value="1"> als bezahlt markieren</label><?php endif ?>
    <button class="btn btn--primary btn--sm">Speichern</button>
  </form>
</header>
<div class="grid grid--3">
  <div class="panel"><h2 class="panel__title">Rechnung</h2><address><?= nl2br(e(implode("\n", array_filter([$b['company'] ?? '', $b['name'] ?? '', $b['street'] ?? '', trim(($b['zip'] ?? '') . ' ' . ($b['city'] ?? '')), $b['phone'] ?? ''])))) ?></address><p><a href="mailto:<?= e($order['email']) ?>"><?= e($order['email']) ?></a></p></div>
  <div class="panel"><h2 class="panel__title">Lieferung</h2><address><?= $s ? nl2br(e(implode("\n", array_filter([$s['company'] ?? '', $s['name'] ?? '', $s['street'] ?? '', trim(($s['zip'] ?? '') . ' ' . ($s['city'] ?? ''))])))) : 'wie Rechnung' ?></address>
    <p class="muted">Versand: <?= e($order['shipping_method']) ?><?= $order['delivery_date'] ? '<br>Wunschtermin: ' . e($order['delivery_date']) : '' ?><?= $order['po_number'] ? '<br>Referenz: ' . e($order['po_number']) : '' ?></p></div>
  <div class="panel"><h2 class="panel__title">Status</h2>
    <dl class="kv"><dt>Bestellung</dt><dd><span class="status status--<?= e($order['status']) ?>"><?= e($order['status']) ?></span></dd>
    <dt>Zahlung</dt><dd><?= e($order['payment_method']) ?> · <span class="status status--<?= e($order['payment_status']) ?>"><?= e($order['payment_status']) ?></span></dd>
    <dt>vinX</dt><dd><span class="status status--<?= e($order['erp_status']) ?>"><?= e($order['erp_status']) ?></span> <?= e($order['erp_id'] ?? '') ?></dd></dl>
  </div>
</div>
<div class="panel">
  <table class="table">
    <thead><tr><th>SKU</th><th>Artikel</th><th class="num">Menge</th><th class="num">Netto</th><th class="num">Brutto</th><th class="num">MWST</th><th class="num">Total</th></tr></thead>
    <tbody><?php foreach ($order['items'] as $i): ?><tr><td class="mono"><?= e($i['sku']) ?></td><td><?= e($i['name']) ?></td><td class="num"><?= (int) $i['qty'] ?></td><td class="num"><?= money((int) $i['unit_net'], false) ?></td><td class="num"><?= money((int) $i['unit_gross'], false) ?></td><td class="num"><?= e($i['tax_rate']) ?>%</td><td class="num"><?= money((int) $i['line_gross']) ?></td></tr><?php endforeach ?></tbody>
    <tfoot>
      <tr><td colspan="6">Zwischensumme netto / brutto</td><td class="num"><?= money((int) $order['subtotal_net'], false) ?> / <?= money((int) $order['subtotal_gross']) ?></td></tr>
      <tr><td colspan="6">Versand</td><td class="num"><?= money((int) $order['shipping_gross']) ?></td></tr>
      <?php if ((int) $order['discount_gross']): ?><tr><td colspan="6">Rabatt <?= e($order['coupon_code']) ?></td><td class="num">− <?= money((int) $order['discount_gross']) ?></td></tr><?php endif ?>
      <tr class="strong"><td colspan="6">Total inkl. MWST</td><td class="num"><?= money((int) $order['total_gross']) ?></td></tr>
      <tr class="muted"><td colspan="6">MWST</td><td class="num"><?= money((int) $order['tax_total']) ?></td></tr>
    </tfoot>
  </table>
  <?php if ($order['notes']): ?><p class="note"><strong>Bemerkung:</strong> <?= nl2br(e($order['notes'])) ?></p><?php endif ?>
</div>
<?php if ($outbox): ?>
<div class="panel"><h2 class="panel__title">vinX Übertragung</h2>
  <table class="table"><tbody><?php foreach ($outbox as $ob): ?><tr><td>#<?= (int) $ob['id'] ?></td><td><span class="status status--<?= e($ob['status']) ?>"><?= e($ob['status']) ?></span></td><td><?= (int) $ob['attempts'] ?> Versuche</td><td class="small muted"><?= e($ob['last_error'] ?? '') ?></td><td><?= e($ob['sent_at'] ?? '') ?></td></tr><?php endforeach ?></tbody></table>
</div>
<?php endif ?>
