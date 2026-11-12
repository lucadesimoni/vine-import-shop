<?php
declare(strict_types=1);

/*
 * Web-cron for hosters without CLI cron: call
 *   https://your-shop.ch/cron.php?key=YOUR_CRON_KEY[&jobs=outbox,stock]
 * every 5–15 minutes (e.g. from the hoster panel or cron-job.org).
 * Disabled unless app.cron_key is set.
 */

/** @var App\Core\App $app */
$app = require dirname(__DIR__) . '/app/bootstrap.php';

$key = (string) $app->config->get('app.cron_key', '');
header('Content-Type: application/json');
if ($key === '' || !hash_equals($key, (string) ($_GET['key'] ?? ''))) {
    http_response_code(403);
    echo json_encode(['error' => 'forbidden']);
    exit;
}
App\Core\Installer::ensure($app);
@set_time_limit(300);
$jobs = isset($_GET['jobs']) ? explode(',', (string) $_GET['jobs']) : ['outbox', 'stock', 'prices', 'articles'];
echo json_encode(App\Modules\Vinx\VinxModule::runScheduled($app, $jobs), JSON_PRETTY_PRINT);
