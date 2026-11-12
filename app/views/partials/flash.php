<?php $flashes = App\Core\Session::flashes(); if (!$flashes) return; ?>
<div class="container flash-stack">
  <?php foreach ($flashes as $f): ?>
    <div class="flash flash--<?= e($f['type']) ?>" role="alert">
      <?= icon($f['type'] === 'error' ? 'close' : 'check', 18) ?>
      <span><?= e($f['message']) ?></span>
    </div>
  <?php endforeach ?>
</div>
