<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Loads `.env` (optional) and then `config/config.php`
 * (falls back to `config/config.example.php` so a fresh checkout runs).
 * Values are read with dot notation: config('vinx.rest.base_url').
 */
final class Config
{
    public function __construct(private array $items)
    {
    }

    public static function load(string $basePath): self
    {
        self::loadEnv($basePath . '/.env');
        $file = is_file($basePath . '/config/config.php')
            ? $basePath . '/config/config.php'
            : $basePath . '/config/config.example.php';
        $items = require $file;
        return new self(is_array($items) ? $items : []);
    }

    private static function loadEnv(string $file): void
    {
        if (!is_file($file)) {
            return;
        }
        foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                continue;
            }
            [$k, $v] = array_map('trim', explode('=', $line, 2));
            $v = trim($v, "\"'");
            if (getenv($k) === false) {
                putenv("$k=$v");
                $_ENV[$k] = $v;
            }
        }
    }

    public function get(string $key, mixed $default = null): mixed
    {
        $value = $this->items;
        foreach (explode('.', $key) as $segment) {
            if (!is_array($value) || !array_key_exists($segment, $value)) {
                return $default;
            }
            $value = $value[$segment];
        }
        return $value;
    }

    public function set(string $key, mixed $value): void
    {
        $ref = &$this->items;
        foreach (explode('.', $key) as $segment) {
            if (!isset($ref[$segment]) || !is_array($ref[$segment])) {
                $ref[$segment] = [];
            }
            $ref = &$ref[$segment];
        }
        $ref = $value;
    }

    public function all(): array
    {
        return $this->items;
    }
}
