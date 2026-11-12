<?php /** @var string $content */ $title = $this->section('title'); ?><!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= e(csrf_token()) ?>">
  <meta name="robots" content="noindex">
  <title><?= e(($title ? "$title · " : '') . 'Admin · ' . config('app.name')) ?></title>
  <link rel="stylesheet" href="<?= asset('css/app.css') ?>">
  <link rel="stylesheet" href="<?= asset('css/admin.css') ?>">
  <link rel="icon" href="<?= asset('img/favicon.svg') ?>" type="image/svg+xml">
</head>
<body class="admin" data-base="<?= e(url('/')) ?>">
<aside class="admin__side">
  <a class="logo logo--light" href="<?= url('/admin') ?>"><span class="logo__mark"><?= e(mb_substr((string) config('app.name'), 0, 1)) ?></span><span class="logo__text"><?= e(config('app.name')) ?><small>Admin</small></span></a>
  <nav>
    <?php foreach (app()->adminMenu as $item): ?>
      <a href="<?= url($item['url']) ?>" class="<?= ($item['url'] === '/admin' ? current_path() === '/admin' : is_path($item['url'])) ? 'is-active' : '' ?>"><?= icon($item['icon'], 18) ?> <?= e($item['label']) ?></a>
    <?php endforeach ?>
  </nav>
  <div class="admin__side-foot">
    <a href="<?= url('/') ?>" target="_blank"><?= icon('arrow', 16) ?> Shop ansehen</a>
    <form method="post" action="<?= url('/logout') ?>"><?= csrf_field() ?><button><?= icon('logout', 16) ?> Abmelden</button></form>
  </div>
</aside>
<main class="admin__main">
  <?= $this->partial('flash') ?>
  <?= $content ?>
</main>
<script src="<?= asset('js/app.js') ?>" defer></script>
</body>
</html>
