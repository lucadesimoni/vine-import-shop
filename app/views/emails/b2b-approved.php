<?php /** @var array $user */ ?>
<h1 style="font-family:Georgia,serif;font-weight:400;font-size:24px;margin:0 0 12px"><?= e(t('mail.b2b_approved_subject')) ?></h1>
<p><?= e(t('mail.b2b_approved_text', ['company' => (string) ($user['company'] ?? '')])) ?></p>
<p><a href="<?= e(absolute_url('/b2b/portal')) ?>" style="display:inline-block;background:#6d1a2a;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none"><?= e(t('nav.portal')) ?></a></p>
