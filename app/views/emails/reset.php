<?php /** @var string $link */ ?>
<h1 style="font-family:Georgia,serif;font-weight:400;font-size:24px;margin:0 0 12px"><?= e(t('mail.reset_subject')) ?></h1>
<p><?= e(t('mail.reset_text')) ?></p>
<p><a href="<?= e($link) ?>" style="display:inline-block;background:#6d1a2a;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none"><?= e(t('auth.new_password')) ?></a></p>
<p style="color:#888;font-size:12px"><?= e(t('mail.reset_ignore')) ?></p>
