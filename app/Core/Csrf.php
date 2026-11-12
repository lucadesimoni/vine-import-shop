<?php
declare(strict_types=1);

namespace App\Core;

final class Csrf
{
    public static function token(): string
    {
        $t = Session::get('_csrf');
        if (!is_string($t)) {
            $t = bin2hex(random_bytes(32));
            Session::set('_csrf', $t);
        }
        return $t;
    }

    public static function verify(Request $request): void
    {
        $sent = (string) ($request->post['_token'] ?? $request->header('X-CSRF-Token') ?? '');
        if ($sent === '' || !hash_equals(self::token(), $sent)) {
            throw new HttpException(419, 'Session expired — please reload the page.');
        }
    }
}
