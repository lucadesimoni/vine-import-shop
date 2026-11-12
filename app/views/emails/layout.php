<?php /** @var string $content @var string $subject */ ?><!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title><?= e($subject) ?></title></head>
<body style="margin:0;background:#f4f1eb;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1b1917">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1eb;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:6px;overflow:hidden">
<tr><td style="background:#1b1917;padding:24px 32px;color:#f4f1eb;font-family:Georgia,serif;font-size:22px;letter-spacing:.02em"><?= e(config('app.name')) ?></td></tr>
<tr><td style="padding:32px;font-size:15px;line-height:1.6"><?= $content ?></td></tr>
<tr><td style="padding:20px 32px;background:#faf8f4;color:#6f6a63;font-size:12px;line-height:1.5">
<?= e(config('app.name')) ?> · <?= e(implode(', ', (array) config('shop.address', []))) ?><br><?= e(config('shop.email')) ?> · <?= e(config('shop.uid')) ?>
</td></tr></table></td></tr></table></body></html>
