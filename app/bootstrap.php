<?php
declare(strict_types=1);

/*
 * Bootstrap — shared by the web front controller (public/index.php),
 * the CLI (bin/console) and the web-cron endpoint (public/cron.php).
 * No Composer required: a tiny PSR-4 autoloader maps App\ → app/.
 */

if (PHP_VERSION_ID < 80100) {
    http_response_code(500);
    exit('This shop requires PHP 8.1 or newer. Current: ' . PHP_VERSION);
}

define('BASE_PATH', dirname(__DIR__));

spl_autoload_register(static function (string $class): void {
    if (str_starts_with($class, 'App\\')) {
        $file = BASE_PATH . '/app/' . str_replace('\\', '/', substr($class, 4)) . '.php';
        if (is_file($file)) {
            require $file;
        }
    }
});

// Optional Composer packages (not required to run).
if (is_file(BASE_PATH . '/vendor/autoload.php')) {
    require BASE_PATH . '/vendor/autoload.php';
}

require BASE_PATH . '/app/helpers.php';

$config = App\Core\Config::load(BASE_PATH);
date_default_timezone_set((string) $config->get('app.timezone', 'Europe/Zurich'));

$debug = (bool) $config->get('app.debug', false);
error_reporting(E_ALL);
ini_set('display_errors', $debug ? '1' : '0');
ini_set('log_errors', '1');
ini_set('error_log', BASE_PATH . '/storage/logs/php-error.log');

$app = new App\Core\App($config);
App\Core\App::setInstance($app);
$app->bootModules();

return $app;
