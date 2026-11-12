<?php
declare(strict_types=1);

namespace App\Core;

final class Request
{
    public static string $basePath = '';

    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly string $uri,
        public readonly array $query,
        public readonly array $post,
        public readonly array $server,
        public readonly string $body = '',
    ) {
    }

    public static function fromGlobals(): self
    {
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $path = parse_url($uri, PHP_URL_PATH) ?: '/';

        // Support installs in a sub-folder and hosts where the document root
        // cannot point at /public (root .htaccess rewrites into public/).
        $script = (string) ($_SERVER['SCRIPT_NAME'] ?? '/index.php');
        if (!str_ends_with($script, '.php')) {
            // PHP's built-in server reports the request path for URLs with an extension.
            $script = '/index.php';
        }
        $base = str_replace('\\', '/', dirname($script));
        $base = rtrim($base, '/');
        if ($base !== '' && !str_starts_with($path, $base) && str_ends_with($base, '/public')) {
            $base = substr($base, 0, -7);
        }
        if ($base !== '' && str_starts_with($path, $base)) {
            $path = substr($path, strlen($base)) ?: '/';
        }
        self::$basePath = $base;

        $body = (string) file_get_contents('php://input');
        $post = $_POST;
        if ($post === [] && str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) {
            $post = json_decode($body, true) ?: [];
        }

        return new self(
            strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            '/' . ltrim($path, '/'),
            $uri,
            $_GET,
            $post,
            $_SERVER,
            $body
        );
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->post[$key] ?? $this->query[$key] ?? $default;
    }

    public function str(string $key, string $default = ''): string
    {
        $v = $this->input($key, $default);
        return is_scalar($v) ? trim((string) $v) : $default;
    }

    public function int(string $key, int $default = 0): int
    {
        $v = $this->input($key);
        return is_numeric($v) ? (int) $v : $default;
    }

    public function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        return $this->server[$key] ?? null;
    }

    public function isAjax(): bool
    {
        return ($this->header('X-Requested-With') === 'XMLHttpRequest');
    }

    public function wantsJson(): bool
    {
        return $this->isAjax()
            || str_starts_with($this->path, '/api/')
            || str_contains((string) $this->header('Accept'), 'application/json');
    }

    public function isHttps(): bool
    {
        return (!empty($this->server['HTTPS']) && $this->server['HTTPS'] !== 'off')
            || ($this->server['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    }

    public function ip(): string
    {
        return (string) ($this->server['REMOTE_ADDR'] ?? '0.0.0.0');
    }
}
