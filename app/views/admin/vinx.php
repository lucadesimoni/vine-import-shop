<?php /** @var string $driver @var array $logs @var array $outbox @var array $counts @var array $last */ $this->section('title', 'vinX ERP');
$job = fn (string $j, string $label, string $icon, array $extra = []) => '<form method="post" action="' . url('/admin/vinx/run') . '">' . csrf_field() . '<input type="hidden" name="job" value="' . $j . '">' . implode('', array_map(fn ($k, $v) => '<input type="hidden" name="' . $k . '" value="' . $v . '">', array_keys($extra), $extra)) . '<button class="btn btn--ghost btn--sm">' . icon($icon, 14) . ' ' . $label . '</button></form>'; ?>
<header class="admin__head"><div><h1>vinX ERP</h1><p class="muted">Treiber: <span class="tag"><?= e($driver) ?></span> <?= $driver === 'mock' ? '— Demo-Modus, keine echte Verbindung. In config: vinx.driver = rest | file' : '' ?></p></div></header>
<div class="kpis">
  <div class="kpi"><span>Artikel zuletzt</span><strong class="small"><?= e($last['articles'] ? date('d.m. H:i', strtotime($last['articles'])) : '—') ?></strong></div>
  <div class="kpi"><span>Lager zuletzt</span><strong class="small"><?= e($last['stock'] ? date('d.m. H:i', strtotime($last['stock'])) : '—') ?></strong></div>
  <div class="kpi"><span>Preise zuletzt</span><strong class="small"><?= e($last['prices'] ? date('d.m. H:i', strtotime($last['prices'])) : '—') ?></strong></div>
  <div class="kpi"><span>Warteschlange</span><strong><?= $counts['pending'] ?></strong></div>
  <div class="kpi <?= $counts['failed'] ? 'kpi--alert' : '' ?>"><span>Fehlgeschlagen</span><strong><?= $counts['failed'] ?></strong></div>
  <div class="kpi"><span>Übertragen</span><strong><?= $counts['sent'] ?></strong></div>
</div>
<div class="panel">
  <h2 class="panel__title">Aktionen</h2>
  <div class="admin__inline">
    <?= $job('ping', 'Verbindung testen', 'shield') ?>
    <?= $job('articles', 'Artikel (Delta)', 'glass') ?>
    <?= $job('articles', 'Artikel (voll)', 'glass', ['full' => '1']) ?>
    <?= $job('stock', 'Lagerbestand', 'box') ?>
    <?= $job('prices', 'Preislisten', 'file') ?>
    <?= $job('outbox', 'Bestellungen senden', 'truck') ?>
  </div>
  <p class="muted small">Automatisch per Cron: <code>php bin/console vinx:sync</code> oder Web-Cron <code>/cron.php?key=…</code>. Webhook für Push-Updates: <code><?= e(absolute_url('/api/vinx/webhook')) ?></code></p>
</div>
<div class="grid grid--2">
  <div class="panel"><h2 class="panel__title">Ausgang (offen / Fehler)</h2>
    <table class="table"><thead><tr><th>#</th><th>Typ</th><th>Status</th><th>Versuche</th><th>Fehler</th><th></th></tr></thead><tbody>
    <?php foreach ($outbox as $o): ?><tr><td><?= (int) $o['id'] ?></td><td><?= e($o['type']) ?> <?= (int) $o['ref_id'] ?></td><td><span class="status status--<?= e($o['status']) ?>"><?= e($o['status']) ?></span></td><td><?= (int) $o['attempts'] ?></td><td class="small muted"><?= e(mb_strimwidth((string) $o['last_error'], 0, 80, '…')) ?></td>
    <td><form method="post" action="<?= url('/admin/vinx/retry/' . $o['id']) ?>"><?= csrf_field() ?><button class="btn btn--text btn--sm">Retry</button></form></td></tr><?php endforeach ?>
    <?php if (!$outbox): ?><tr><td colspan="6" class="muted">Alles übertragen ✓</td></tr><?php endif ?>
    </tbody></table>
  </div>
  <div class="panel"><h2 class="panel__title">Protokoll</h2>
    <table class="table"><thead><tr><th>Job</th><th>Start</th><th>Status</th><th>Info</th></tr></thead><tbody>
    <?php foreach ($logs as $l): ?><tr><td><?= e($l['job']) ?></td><td class="small"><?= e(date('d.m. H:i:s', strtotime($l['started_at']))) ?></td><td><span class="status status--<?= $l['status'] === 'ok' ? 'completed' : ($l['status'] === 'error' ? 'cancelled' : 'pending') ?>"><?= e($l['status']) ?></span></td><td class="small muted"><?= e(mb_strimwidth((string) $l['message'], 0, 100, '…')) ?></td></tr><?php endforeach ?>
    </tbody></table>
  </div>
</div>
