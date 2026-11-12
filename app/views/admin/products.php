<?php /** @var array $products @var string $q */ $this->section('title', 'Produkte'); ?>
<header class="admin__head"><h1>Produkte</h1><a class="btn btn--primary btn--sm" href="<?= url('/admin/products/new') ?>"><?= icon('plus', 14) ?> Neues Produkt</a></header>
<form class="admin__filters" method="get"><input name="q" value="<?= e($q) ?>" placeholder="SKU oder Name"><button class="btn btn--ghost btn--sm">Suchen</button></form>
<p class="muted small">Stammdaten, Preise und Lager werden aus vinX synchronisiert. Texte, Bilder und Sichtbarkeit pflegen Sie hier.</p>
<div class="panel"><div class="table-wrap"><table class="table">
  <thead><tr><th></th><th>SKU</th><th>Name</th><th>Produzent</th><th>Typ</th><th class="num">Preis</th><th class="num">Lager</th><th>Status</th><th>Sync</th></tr></thead>
  <tbody><?php foreach ($products as $p): ?>
    <tr>
      <td class="thumb"><?= product_art($p) ?></td>
      <td class="mono"><a href="<?= url('/admin/products/' . $p['id']) ?>"><?= e($p['sku']) ?></a></td>
      <td><a href="<?= url('/admin/products/' . $p['id']) ?>"><?= e(tf($p['name_json'])) ?></a> <span class="muted"><?= e($p['vintage']) ?></span></td>
      <td><?= e($p['producer_name']) ?></td>
      <td><?= e($p['type']) ?></td>
      <td class="num"><?= money((int) $p['price_gross']) ?></td>
      <td class="num"><?= (int) $p['stock'] ?></td>
      <td><?= (int) $p['active'] ? '<span class="status status--completed">aktiv</span>' : '<span class="status status--cancelled">inaktiv</span>' ?><?= (int) $p['b2b_only'] ? ' <span class="tag">B2B</span>' : '' ?><?= (int) $p['featured'] ? ' <span class="tag">★</span>' : '' ?></td>
      <td class="small muted"><?= e($p['synced_at'] ? date('d.m. H:i', strtotime($p['synced_at'])) : '—') ?></td>
    </tr>
  <?php endforeach ?></tbody>
</table></div></div>
