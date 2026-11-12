<?php /** @var ?array $product @var array $categories @var array $producers @var array $owned @var array $locales */
$p = $product ?? ['id' => 0, 'type' => 'wine', 'case_size' => 6, 'active' => 1, 'age_restricted' => 1, 'tax_class' => 'standard', 'stock' => 0, 'price_gross' => 0];
$this->section('title', $product ? tf($p['name_json']) : 'Neues Produkt');
$v = fn (string $k) => e($p[$k] ?? '');
$j = fn (string $k, string $l) => e(json_field($p[$k] ?? null)[$l] ?? '');
$erp = fn (string $k) => in_array($k, $owned, true) && $product ? ' <span class="tag" title="Wird von vinX überschrieben">vinX</span>' : '';
?>
<header class="admin__head">
  <div><a class="muted" href="<?= url('/admin/products') ?>">← Produkte</a><h1><?= $product ? e(tf($p['name_json'])) : 'Neues Produkt' ?></h1></div>
  <?php if ($product): ?><a class="btn btn--ghost btn--sm" href="<?= url('/p/' . $p['slug']) ?>" target="_blank">Im Shop ansehen</a><?php endif ?>
</header>
<form method="post" action="<?= url('/admin/products/save') ?>" class="admin-form">
  <?= csrf_field() ?><input type="hidden" name="id" value="<?= (int) $p['id'] ?>">
  <div class="admin-form__main">
    <div class="panel">
      <h2 class="panel__title">Inhalte</h2>
      <div class="tabs" data-tabs>
        <div class="tabs__list" role="tablist"><?php foreach ($locales as $i => $l): ?><button type="button" role="tab" aria-selected="<?= $i ? 'false' : 'true' ?>" data-tab="l-<?= $l ?>"><?= strtoupper($l) ?></button><?php endforeach ?></div>
        <?php foreach ($locales as $i => $l): ?>
          <div class="tabs__panel stack" data-panel="l-<?= $l ?>" <?= $i ? 'hidden' : '' ?>>
            <label class="field"><span>Name<?= $erp('name_json') ?></span><input name="name[<?= $l ?>]" value="<?= $j('name_json', $l) ?>" <?= $l === 'de' ? 'required' : '' ?>></label>
            <label class="field"><span>Kurzbeschreibung</span><input name="short[<?= $l ?>]" value="<?= $j('short_json', $l) ?>"></label>
            <label class="field"><span>Degustationsnotiz / Beschreibung</span><textarea name="description[<?= $l ?>]" rows="5"><?= $j('description_json', $l) ?></textarea></label>
            <label class="field"><span>Passt zu</span><input name="pairing[<?= $l ?>]" value="<?= $j('pairing_json', $l) ?>"></label>
          </div>
        <?php endforeach ?>
      </div>
    </div>
    <div class="panel">
      <h2 class="panel__title">Weindaten</h2>
      <div class="form-grid form-grid--3">
        <label class="field"><span>Farbe<?= $erp('color') ?></span><select name="color"><option value="">—</option><?php foreach (['red', 'white', 'rose', 'sparkling', 'sweet'] as $c): ?><option value="<?= $c ?>" <?= ($p['color'] ?? '') === $c ? 'selected' : '' ?>><?= e(t('color.' . $c)) ?></option><?php endforeach ?></select></label>
        <label class="field"><span>Jahrgang<?= $erp('vintage') ?></span><input name="vintage" value="<?= $v('vintage') ?>"></label>
        <label class="field"><span>Inhalt ml<?= $erp('volume_ml') ?></span><input type="number" name="volume_ml" value="<?= $v('volume_ml') ?>"></label>
        <label class="field"><span>Land<?= $erp('country') ?></span><input name="country" value="<?= $v('country') ?>"></label>
        <label class="field"><span>Region<?= $erp('region') ?></span><input name="region" value="<?= $v('region') ?>"></label>
        <label class="field"><span>Appellation<?= $erp('appellation') ?></span><input name="appellation" value="<?= $v('appellation') ?>"></label>
        <label class="field span-2"><span>Traubensorten<?= $erp('grapes') ?></span><input name="grapes" value="<?= $v('grapes') ?>"></label>
        <label class="field"><span>Alkohol %<?= $erp('alcohol') ?></span><input name="alcohol" value="<?= $v('alcohol') ?>"></label>
        <label class="field"><span>Trinktemperatur</span><input name="serving_temp" value="<?= $v('serving_temp') ?>"></label>
        <label class="field"><span>Trinkreife</span><input name="aging" value="<?= $v('aging') ?>"></label>
        <label class="field"><span>Bewertung</span><input name="rating" value="<?= $v('rating') ?>" placeholder="z.B. 94 Punkte"></label>
      </div>
    </div>
  </div>
  <div class="admin-form__side">
    <div class="panel stack">
      <h2 class="panel__title">Stammdaten</h2>
      <label class="field"><span>SKU / Artikel-Nr.</span><input name="sku" value="<?= $v('sku') ?>" required class="mono"></label>
      <label class="field"><span>Slug (URL)</span><input name="slug" value="<?= $v('slug') ?>" placeholder="auto"></label>
      <label class="field"><span>Typ</span><select name="type"><?php foreach (['wine' => 'Wein', 'speciality' => 'Spezialität', 'spirit' => 'Spirituose'] as $k => $l): ?><option value="<?= $k ?>" <?= $p['type'] === $k ? 'selected' : '' ?>><?= $l ?></option><?php endforeach ?></select></label>
      <label class="field"><span>Kategorie</span><select name="category_id"><option value="">—</option><?php foreach ($categories as $c): ?><option value="<?= (int) $c['id'] ?>" <?= (int) ($p['category_id'] ?? 0) === (int) $c['id'] ? 'selected' : '' ?>><?= e(tf($c['name_json'])) ?></option><?php endforeach ?></select></label>
      <label class="field"><span>Produzent</span><select name="producer_id"><option value="">—</option><?php foreach ($producers as $pr): ?><option value="<?= (int) $pr['id'] ?>" <?= (int) ($p['producer_id'] ?? 0) === (int) $pr['id'] ? 'selected' : '' ?>><?= e($pr['name']) ?></option><?php endforeach ?></select></label>
      <label class="field"><span>Bild (Pfad/URL)</span><input name="image" value="<?= $v('image') ?>" placeholder="uploads/w-1001.webp"></label>
    </div>
    <div class="panel stack">
      <h2 class="panel__title">Preis & Lager</h2>
      <label class="field"><span>Preis CHF inkl. MWST<?= $erp('price_gross') ?></span><input name="price" value="<?= money((int) $p['price_gross'], false) ?>"></label>
      <label class="field"><span>MWST-Satz<?= $erp('tax_class') ?></span><select name="tax_class"><option value="standard" <?= $p['tax_class'] === 'standard' ? 'selected' : '' ?>>Normal <?= e(config('tax.standard')) ?>%</option><option value="reduced" <?= $p['tax_class'] === 'reduced' ? 'selected' : '' ?>>Reduziert <?= e(config('tax.reduced')) ?>% (Lebensmittel)</option></select></label>
      <div class="form-grid">
        <label class="field"><span>Lager<?= $erp('stock') ?></span><input type="number" name="stock" value="<?= (int) $p['stock'] ?>"></label>
        <label class="field"><span>Karton<?= $erp('case_size') ?></span><input type="number" name="case_size" value="<?= (int) $p['case_size'] ?>"></label>
      </div>
      <p class="muted small">Gruppen- und Staffelpreise kommen aus den vinX-Preislisten.</p>
    </div>
    <div class="panel stack">
      <h2 class="panel__title">Sichtbarkeit</h2>
      <label class="check"><input type="checkbox" name="active" value="1" <?= (int) $p['active'] ? 'checked' : '' ?>> Aktiv im Shop</label>
      <label class="check"><input type="checkbox" name="featured" value="1" <?= (int) ($p['featured'] ?? 0) ? 'checked' : '' ?>> Auf Startseite empfehlen</label>
      <label class="check"><input type="checkbox" name="organic" value="1" <?= (int) ($p['organic'] ?? 0) ? 'checked' : '' ?>> Bio</label>
      <label class="check"><input type="checkbox" name="b2b_only" value="1" <?= (int) ($p['b2b_only'] ?? 0) ? 'checked' : '' ?>> Nur für B2B-Kunden</label>
      <label class="check"><input type="checkbox" name="age_restricted" value="1" <?= (int) $p['age_restricted'] ? 'checked' : '' ?>> Alkohol (Altersprüfung)</label>
      <button class="btn btn--primary btn--block">Speichern</button>
    </div>
  </div>
</form>
