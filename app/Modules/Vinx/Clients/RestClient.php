<?php
declare(strict_types=1);

namespace App\Modules\Vinx\Clients;

use App\Core\HttpClient;
use App\Modules\Vinx\ErpClient;

/**
 * Generic REST/JSON driver for the vinX web interface.
 *
 * Endpoints, auth scheme, pagination and field names are all configuration
 * (config['vinx']['rest'] + ['mapping']) because the exact interface depends
 * on your vinX version/modules. Ask your vinX partner for the API spec and
 * adjust config only — no code changes needed for typical variants.
 */
final class RestClient implements ErpClient
{
    private HttpClient $http;

    public function __construct(private array $cfg)
    {
        $this->http = new HttpClient((int) ($cfg['rest']['timeout'] ?? 30));
    }

    private function rest(string $key, mixed $default = null): mixed
    {
        return $this->cfg['rest'][$key] ?? $default;
    }

    private function headers(): array
    {
        $auth = (string) $this->rest('auth', 'bearer');
        $h = [];
        if ($auth === 'bearer') {
            $h['Authorization'] = 'Bearer ' . $this->rest('token');
        } elseif ($auth === 'basic') {
            $h['Authorization'] = 'Basic ' . base64_encode($this->rest('user') . ':' . $this->rest('pass'));
        } elseif (str_starts_with($auth, 'header:')) {
            $h[substr($auth, 7)] = (string) $this->rest('token');
        }
        if ($this->rest('mandant')) {
            $h['X-Mandant'] = (string) $this->rest('mandant');
        }
        return $h;
    }

    /** @return array{0:string,1:string} [method, url] */
    private function endpoint(string $name): array
    {
        $def = (string) ($this->rest('endpoints')[$name] ?? '');
        if ($def === '') {
            throw new \RuntimeException("vinX endpoint '$name' not configured");
        }
        [$method, $path] = str_contains($def, ' ') ? explode(' ', $def, 2) : ['GET', $def];
        $base = rtrim((string) $this->rest('base_url'), '/');
        if ($base === '') {
            throw new \RuntimeException('vinx.rest.base_url not configured');
        }
        return [$method, $base . '/' . ltrim($path, '/')];
    }

    private function call(string $name, array $query = [], mixed $body = null): array
    {
        [$method, $url] = $this->endpoint($name);
        if ($query) {
            $url .= (str_contains($url, '?') ? '&' : '?') . http_build_query($query);
        }
        $res = $this->http->request($method, $url, $this->headers(), $body);
        if ($res['status'] >= 400) {
            throw new \RuntimeException("vinX $name failed: HTTP {$res['status']} " . mb_substr($res['body'], 0, 500));
        }
        return is_array($res['json']) ? $res['json'] : [];
    }

    /** Iterate all pages of a list endpoint. */
    private function paginate(string $name, array $query = []): iterable
    {
        $pageParam = (string) $this->rest('page_param', 'page');
        $sizeParam = (string) $this->rest('page_size_param', 'pageSize');
        $size = (int) $this->rest('page_size', 200);
        $dataKey = (string) $this->rest('data_key', 'data');
        for ($page = 1; $page < 10000; $page++) {
            $json = $this->call($name, $query + [$pageParam => $page, $sizeParam => $size]);
            $rows = $dataKey !== '' ? ($json[$dataKey] ?? []) : $json;
            if (!is_array($rows) || $rows === []) {
                return;
            }
            yield from $rows;
            if (count($rows) < $size) {
                return;
            }
        }
    }

    public function ping(): string
    {
        $this->call('ping');
        return 'vinX REST OK: ' . $this->rest('base_url');
    }

    public function articles(?string $since = null): iterable
    {
        $q = $since ? [(string) $this->rest('since_param', 'modifiedSince') => $since] : [];
        yield from $this->paginate('articles', $q);
    }

    public function stock(): iterable
    {
        yield from $this->paginate('stock');
    }

    public function prices(): iterable
    {
        yield from $this->paginate('prices');
    }

    public function pushOrder(array $payload): string
    {
        $json = $this->call('order_create', [], $payload);
        return (string) ($json['id'] ?? $json['orderNumber'] ?? $json['number'] ?? $json['data']['id'] ?? '');
    }

    public function pushCustomer(array $payload): string
    {
        $json = $this->call('customer_create', [], $payload);
        return (string) ($json['id'] ?? $json['customerNumber'] ?? $json['data']['id'] ?? '');
    }
}
