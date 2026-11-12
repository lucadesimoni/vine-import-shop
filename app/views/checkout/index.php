<?php
/** @var array $summary @var array $payments @var array $billing @var array $shippingAddr @var array $errors @var array $old @var bool $cancelled */
$this->section('title', t('checkout.title'));
$user = auth()->user();
$isB2B = auth()->isB2B();
$val = function (string $group, string $key) use ($old, $billing, $shippingAddr): string {
    if (isset($old[$group][$key])) {
        return e($old[$group][$key]);
    }
    return e(($group === 'billing' ? $billing : $shippingAddr)[$key] ?? ($key === 'country' ? 'CH' : ''));
};
$err = fn (string $k) => isset($errors[$k]) ? '<span class="field__error">' . e($errors[$k]) . '</span>' : '';
$field = function (string $group, string $key, string $label, bool $required = true, string $type = 'text', string $auto = '') use ($val, $err, $errors) {
    $name = $group . '[' . $key . ']';
    $invalid = isset($errors["$group.$key"]) ? ' is-invalid' : '';
    return '<label class="field' . $invalid . '"><span>' . e($label) . ($required ? ' *' : '') . '</span><input type="' . $type . '" name="' . $name . '" value="' . $val($group, $key) . '" ' . ($required ? 'required' : '') . ($auto ? ' autocomplete="' . $auto . '"' : '') . '>' . $err("$group.$key") . '</label>';
};
$selectedPay = $old['payment_method'] ?? (string) array_key_first($payments);
?>
<section class="page-head page-head--slim">
  <div class="container">
    <?= $this->partial('steps', ['step' => 2]) ?>
    <h1 class="h1"><?= e(t('checkout.title')) ?></h1>
  </div>
</section>

<form method="post" action="<?= url('/checkout') ?>" class="container checkout-layout" data-checkout novalidate>
  <?= csrf_field() ?>
  <div class="checkout">
    <?php if ($cancelled): ?><p class="flash flash--error"><?= e(t('payment.cancelled')) ?></p><?php endif ?>
    <?php if (isset($errors['minimum'])): ?><p class="flash flash--error"><?= e($errors['minimum']) ?></p><?php endif ?>

    <fieldset class="panel">
      <legend class="panel__title"><span>1</span><?= e(t('checkout.contact')) ?></legend>
      <?php if ($user): ?>
        <p class="muted"><?= e(t('checkout.logged_in_as', ['email' => $user['email']])) ?></p>
      <?php else: ?>
        <p class="muted"><?= t('checkout.have_account', ['link' => '<a href="' . url('/login') . '">' . e(t('auth.login')) . '</a>']) ?></p>
        <label class="field <?= isset($errors['email']) ? 'is-invalid' : '' ?>"><span><?= e(t('form.email')) ?> *</span>
          <input type="email" name="email" value="<?= e($old['email'] ?? '') ?>" required autocomplete="email"><?= $err('email') ?></label>
      <?php endif ?>
    </fieldset>

    <fieldset class="panel">
      <legend class="panel__title"><span>2</span><?= e(t('checkout.billing')) ?></legend>
      <div class="form-grid">
        <?= $field('billing', 'company', t('form.company'), $isB2B, 'text', 'organization') ?>
        <?= $field('billing', 'name', t('form.name'), true, 'text', 'name') ?>
        <div class="span-2"><?= $field('billing', 'street', t('form.street'), true, 'text', 'street-address') ?></div>
        <?= $field('billing', 'zip', t('form.zip'), true, 'text', 'postal-code') ?>
        <?= $field('billing', 'city', t('form.city'), true, 'text', 'address-level2') ?>
        <label class="field"><span><?= e(t('form.country')) ?></span>
          <select name="billing[country]" autocomplete="country">
            <?php foreach (['CH' => 'Schweiz / Suisse / Svizzera', 'LI' => 'Liechtenstein'] as $c => $n): ?>
              <option value="<?= $c ?>" <?= $val('billing', 'country') === $c ? 'selected' : '' ?>><?= e($n) ?></option>
            <?php endforeach ?>
          </select>
        </label>
        <?= $field('billing', 'phone', t('form.phone'), false, 'tel', 'tel') ?>
      </div>
      <label class="check"><input type="checkbox" name="ship_different" value="1" data-toggle="#ship-addr" <?= !empty($old['ship_different']) ? 'checked' : '' ?>> <?= e(t('checkout.ship_different')) ?></label>
      <div id="ship-addr" class="form-grid" <?= empty($old['ship_different']) ? 'hidden' : '' ?>>
        <?= $field('shipping', 'company', t('form.company'), false) ?>
        <?= $field('shipping', 'name', t('form.name')) ?>
        <div class="span-2"><?= $field('shipping', 'street', t('form.street')) ?></div>
        <?= $field('shipping', 'zip', t('form.zip')) ?>
        <?= $field('shipping', 'city', t('form.city')) ?>
        <input type="hidden" name="shipping[country]" value="CH">
      </div>
    </fieldset>

    <fieldset class="panel">
      <legend class="panel__title"><span>3</span><?= e(t('checkout.shipping')) ?></legend>
      <div class="options">
        <?php foreach ($summary['shipping_methods'] as $code => $m): if (!$m['available']) continue; ?>
          <label class="option">
            <input type="radio" name="shipping_method" value="<?= e($code) ?>" <?= $summary['shipping_method'] === $code ? 'checked' : '' ?> data-shipping-radio>
            <span class="option__body"><strong><?= e($m['label']) ?></strong><small><?= e($m['description']) ?></small></span>
            <span class="option__price"><?= $m['price'] > 0 ? money($m['price']) : e(t('shipping.free')) ?></span>
          </label>
        <?php endforeach ?>
      </div>
      <?php if ($isB2B): ?>
        <div class="form-grid">
          <label class="field"><span><?= e(t('checkout.po_number')) ?></span><input type="text" name="po_number" value="<?= e($old['po_number'] ?? '') ?>" maxlength="80"></label>
          <label class="field"><span><?= e(t('checkout.delivery_date')) ?></span><input type="date" name="delivery_date" min="<?= date('Y-m-d', strtotime('+2 weekdays')) ?>" value="<?= e($old['delivery_date'] ?? '') ?>"></label>
        </div>
      <?php endif ?>
    </fieldset>

    <fieldset class="panel">
      <legend class="panel__title"><span>4</span><?= e(t('checkout.payment')) ?></legend>
      <?php if (isset($errors['payment_method'])): ?><p class="field__error"><?= e($errors['payment_method']) ?></p><?php endif ?>
      <div class="options">
        <?php foreach ($payments as $code => $pm): ?>
          <label class="option">
            <input type="radio" name="payment_method" value="<?= e($code) ?>" <?= $selectedPay === $code ? 'checked' : '' ?>>
            <span class="option__body"><strong><?= e($pm->label()) ?></strong><small><?= e($pm->description()) ?></small></span>
          </label>
        <?php endforeach ?>
      </div>
    </fieldset>

    <fieldset class="panel">
      <legend class="panel__title"><span>5</span><?= e(t('checkout.finish')) ?></legend>
      <label class="field"><span><?= e(t('checkout.notes')) ?></span><textarea name="notes" rows="3" maxlength="2000"><?= e($old['notes'] ?? '') ?></textarea></label>
      <?php if (!$user): ?>
        <label class="check"><input type="checkbox" name="create_account" value="1" data-toggle="#acc-pw" <?= !empty($old['create_account']) ? 'checked' : '' ?>> <?= e(t('checkout.create_account')) ?></label>
        <div id="acc-pw" <?= empty($old['create_account']) ? 'hidden' : '' ?>>
          <label class="field <?= isset($errors['password']) ? 'is-invalid' : '' ?>"><span><?= e(t('form.password')) ?></span><input type="password" name="password" minlength="8" autocomplete="new-password"><?= $err('password') ?></label>
          <label class="check"><input type="checkbox" name="newsletter" value="1"> <?= e(t('newsletter.optin')) ?></label>
        </div>
      <?php else: ?>
        <label class="check"><input type="checkbox" name="save_address" value="1" checked> <?= e(t('checkout.save_address')) ?></label>
      <?php endif ?>
      <?php if ($summary['age_restricted'] && config('shop.age_gate', true)): ?>
        <label class="check <?= isset($errors['age']) ? 'is-invalid' : '' ?>"><input type="checkbox" name="age" value="1" required <?= !empty($old['age']) ? 'checked' : '' ?>> <?= e(t('checkout.age', ['age' => (string) config('shop.min_age', 18)])) ?></label><?= $err('age') ?>
      <?php endif ?>
      <label class="check <?= isset($errors['terms']) ? 'is-invalid' : '' ?>"><input type="checkbox" name="terms" value="1" required <?= !empty($old['terms']) ? 'checked' : '' ?>> <span><?= t('checkout.terms', ['terms' => '<a href="' . url('/page/terms') . '" target="_blank">' . e(t('page.terms')) . '</a>', 'privacy' => '<a href="' . url('/page/privacy') . '" target="_blank">' . e(t('page.privacy')) . '</a>']) ?></span></label><?= $err('terms') ?>
    </fieldset>
  </div>

  <aside class="summary summary--sticky">
    <h2><?= e(t('cart.summary')) ?></h2>
    <ul class="summary__lines">
      <?php foreach ($summary['lines'] as $l): $p = $l['product']; ?>
        <li><span class="summary__qty"><?= (int) $l['qty'] ?>×</span><span><?= e(tf($p['name_json'])) ?> <small class="muted"><?= e($p['vintage']) ?></small></span><span><?= money($summary['display_mode'] === 'net' ? $l['line_net'] : $l['line_gross']) ?></span></li>
      <?php endforeach ?>
    </ul>
    <div data-totals><?= $this->partial('totals', ['summary' => $summary]) ?></div>
    <button class="btn btn--primary btn--lg btn--block" <?= $summary['below_minimum'] ? 'disabled' : '' ?>><?= e(t('checkout.place_order')) ?></button>
    <p class="muted small"><?= e(t('checkout.binding')) ?></p>
  </aside>
</form>
