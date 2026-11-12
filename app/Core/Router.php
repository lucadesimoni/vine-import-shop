<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Minimal pattern router: '/p/{slug}' → ['slug' => '...'].
 * Middleware names: auth, admin, b2b, guest, nocsrf.
 */
final class Router
{
    /** @var array<int, array{0:string,1:string,2:callable,3:array}> */
    private array $routes = [];

    public function get(string $pattern, callable $handler, array $middleware = []): void
    {
        $this->add('GET', $pattern, $handler, $middleware);
    }

    public function post(string $pattern, callable $handler, array $middleware = []): void
    {
        $this->add('POST', $pattern, $handler, $middleware);
    }

    public function add(string $method, string $pattern, callable $handler, array $middleware = []): void
    {
        $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', rtrim($pattern, '/') ?: '/') . '$#';
        $this->routes[] = [$method, $regex, $handler, $middleware];
    }

    /** @return array{0:callable,1:array<string,string>,2:array}|null */
    public function match(string $method, string $path): ?array
    {
        $path = rtrim($path, '/') ?: '/';
        if ($method === 'HEAD') {
            $method = 'GET';
        }
        foreach ($this->routes as [$m, $regex, $handler, $mw]) {
            if ($m === $method && preg_match($regex, $path, $matches)) {
                $params = array_map('rawurldecode', array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY));
                return [$handler, $params, $mw];
            }
        }
        return null;
    }
}
