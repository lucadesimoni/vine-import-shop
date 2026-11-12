<?php
declare(strict_types=1);

namespace App\Core;

/**
 * cURL-based JSON client (cURL is available on virtually every hoster).
 */
final class HttpClient
{
    public function __construct(private int $timeout = 20)
    {
    }

    /** @return array{status:int, body:string, json:mixed, headers:array} */
    public function request(string $method, string $url, array $headers = [], mixed $body = null, bool $form = false): array
    {
        $ch = curl_init($url);
        $hdrs = [];
        foreach ($headers as $k => $v) {
            $hdrs[] = "$k: $v";
        }
        if ($body !== null) {
            if ($form) {
                $payload = is_array($body) ? http_build_query($body) : (string) $body;
                $hdrs[] = 'Content-Type: application/x-www-form-urlencoded';
            } else {
                $payload = is_string($body) ? $body : (string) json_encode($body, JSON_UNESCAPED_UNICODE);
                $hdrs[] = 'Content-Type: application/json';
            }
            curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        }
        $respHeaders = [];
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => strtoupper($method),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_HTTPHEADER => array_merge(['Accept: application/json'], $hdrs),
            CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$respHeaders) {
                if (str_contains($line, ':')) {
                    [$k, $v] = explode(':', $line, 2);
                    $respHeaders[strtolower(trim($k))] = trim($v);
                }
                return strlen($line);
            },
        ]);
        $resp = curl_exec($ch);
        if ($resp === false) {
            $err = curl_error($ch);
            curl_close($ch);
            throw new \RuntimeException("HTTP request failed: $err");
        }
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return [
            'status' => $status,
            'body' => (string) $resp,
            'json' => json_decode((string) $resp, true),
            'headers' => $respHeaders,
        ];
    }
}
