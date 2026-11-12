<?php /** @var int $step */ ?>
<ol class="steps" aria-label="Checkout">
  <?php foreach ([1 => 'steps.cart', 2 => 'steps.details', 3 => 'steps.done'] as $n => $k): ?>
    <li class="<?= $n < $step ? 'is-done' : ($n === $step ? 'is-current' : '') ?>"><span><?= $n ?></span><?= e(t($k)) ?></li>
  <?php endforeach ?>
</ol>
