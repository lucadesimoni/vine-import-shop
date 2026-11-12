<?php
declare(strict_types=1);

// Serve static files directly when using PHP's built-in server.
if (PHP_SAPI === 'cli-server') {
    $file = __DIR__ . parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if ($file !== __DIR__ . '/' && is_file($file)) {
        return false;
    }
}

/** @var App\Core\App $app */
$app = require dirname(__DIR__) . '/app/bootstrap.php';
$app->handle(App\Core\Request::fromGlobals())->send();
