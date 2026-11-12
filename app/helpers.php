<?php
declare(strict_types=1);

use App\Core\App;
use App\Core\Auth;
use App\Core\Csrf;
use App\Core\Request;
use App\Core\Response;
use App\Core\Session;

function app(): App
{
    return App::instance();
}

function config(string $key, mixed $default = null): mixed
{
    return App::instance()->config->get($key, $default);
}

function env(string $key, mixed $default = null): mixed
{
    $v = getenv($key);
    if ($v === false || $v === '') {
        return $default;
    }
    return match (strtolower($v)) {
        'true' => true,
        'false' => false,
        'null' => null,
        default => $v,
    };
}

function auth(): Auth
{
    return Auth::instance();
}

function e(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function t(string $key, array $replace = []): string
{
    return App::instance()->i18n->t($key, $replace);
}

/** Translated JSON content field. */
function tf(mixed $json): string
{
    return App::instance()->i18n->field($json);
}

function locale(): string
{
    return App::instance()->i18n->locale();
}

function url(string $path = '/', array $query = []): string
{
    $u = Request::$basePath . '/' . ltrim($path, '/');
    if ($query) {
        $u .= (str_contains($u, '?') ? '&' : '?') . http_build_query($query);
    }
    return $u;
}

function absolute_url(string $path = '/'): string
{
    $base = rtrim((string) config('app.url', ''), '/');
    if ($base === '' && isset($_SERVER['HTTP_HOST'])) {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $base = $scheme . '://' . $_SERVER['HTTP_HOST'];
    }
    return $base . url($path);
}

function asset(string $path): string
{
    $file = BASE_PATH . '/public/assets/' . ltrim($path, '/');
    $v = is_file($file) ? substr((string) filemtime($file), -6) : '1';
    return url('/assets/' . ltrim($path, '/')) . '?v=' . $v;
}

/** Swiss formatting: CHF 1'234.50 */
function money(int|float|null $cents, bool $currency = true): string
{
    $s = number_format(((int) $cents) / 100, 2, '.', "'");
    return $currency ? config('app.currency', 'CHF') . ' ' . $s : $s;
}

/** Round to 5 Rappen (Swiss cash rounding) */
function round5(int $cents): int
{
    return (int) (round($cents / 5) * 5);
}

function csrf_token(): string
{
    return Csrf::token();
}

function csrf_field(): string
{
    return '<input type="hidden" name="_token" value="' . e(Csrf::token()) . '">';
}

function redirect(string $path, array $query = []): Response
{
    return Response::redirect(url($path, $query));
}

function back(Request $request, string $fallback = '/'): Response
{
    $ref = $request->header('Referer');
    $host = $request->server['HTTP_HOST'] ?? '';
    if ($ref && $host && parse_url($ref, PHP_URL_HOST) === $host) {
        return Response::redirect($ref);
    }
    return redirect($fallback);
}

function flash(string $type, string $message): void
{
    Session::flash($type, $message);
}

function old(string $key, string $default = ''): string
{
    $old = Session::get('_old', []);
    return e($old[$key] ?? $default);
}

function view(string $template, array $data = [], string $layout = 'layouts/main'): Response
{
    return Response::html(App::instance()->view->render($template, $data, $layout));
}

function json_field(?string $json): array
{
    $d = $json ? json_decode($json, true) : null;
    return is_array($d) ? $d : [];
}

function product_url(array $p): string
{
    return url('/p/' . $p['slug']);
}

function current_path(): string
{
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    return rtrim(substr($path, strlen(Request::$basePath)) ?: '/', '/') ?: '/';
}

function is_path(string $prefix): bool
{
    $path = current_path();
    return $prefix === '/' ? $path === '/' : str_starts_with($path, $prefix);
}

function slugify(string $s): string
{
    $s = strtr(mb_strtolower($s), ['ä' => 'ae', 'ö' => 'oe', 'ü' => 'ue', 'ß' => 'ss', 'é' => 'e', 'è' => 'e', 'à' => 'a', 'ì' => 'i', 'ò' => 'o', 'ù' => 'u']);
    $s = (string) preg_replace('/[^a-z0-9]+/', '-', $s);
    return trim($s, '-') ?: bin2hex(random_bytes(4));
}

/**
 * Elegant placeholder artwork until real packshots are uploaded:
 * a bottle silhouette tinted by wine colour, or a jar/tin for specialities.
 */
function product_art(array $p, string $class = ''): string
{
    if (!empty($p['image'])) {
        $src = str_starts_with($p['image'], 'http') ? $p['image'] : url('/' . ltrim($p['image'], '/'));
        return '<img class="' . e($class) . '" src="' . e($src) . '" alt="' . e(tf($p['name_json'] ?? '')) . '" loading="lazy">';
    }
    $palette = [
        'red' => ['#5b1424', '#3a0b16'],
        'white' => ['#d9c27a', '#a8904a'],
        'rose' => ['#e3a39a', '#c27b72'],
        'sparkling' => ['#c9cf9a', '#8f9560'],
        'sweet' => ['#c98a2b', '#8f5c14'],
    ];
    $label = e(mb_strtoupper(mb_substr((string) ($p['vintage'] ?? ''), 0, 4)));
    $type = $p['type'] ?? 'wine';
    if ($type === 'speciality') {
        $tone = ['olivenoel' => '#6b7a3a', 'aceto' => '#3b2418', 'pasta-reis' => '#d8c39a', 'feinkost' => '#b0472e'][$p['category_slug'] ?? ''] ?? '#8a7a5a';
        return '<svg class="art ' . e($class) . '" viewBox="0 0 200 300" role="img" aria-hidden="true">'
            . '<rect x="62" y="70" width="76" height="16" rx="4" fill="#2a2622"/>'
            . '<rect x="56" y="86" width="88" height="160" rx="14" fill="' . $tone . '"/>'
            . '<rect x="56" y="86" width="88" height="160" rx="14" fill="url(#gl)" opacity=".35"/>'
            . '<rect x="66" y="140" width="68" height="56" rx="3" fill="#f6f1e7"/>'
            . '<line x1="76" y1="160" x2="124" y2="160" stroke="#2a2622" stroke-width="2"/>'
            . '<line x1="82" y1="172" x2="118" y2="172" stroke="#b08d57" stroke-width="1.5"/>'
            . '<defs><linearGradient id="gl" x1="0" x2="1"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>'
            . '</svg>';
    }
    [$c1, $c2] = $palette[$p['color'] ?? 'red'] ?? ['#3d3d3d', '#1f1f1f'];
    if ($type === 'spirit') {
        [$c1, $c2] = ['#e8dcc0', '#b9a678'];
    }
    $uid = 'g' . substr(md5(($p['sku'] ?? '') . $class), 0, 6);
    return '<svg class="art ' . e($class) . '" viewBox="0 0 200 300" role="img" aria-hidden="true">'
        . '<defs><linearGradient id="' . $uid . '" x1="0" x2="1"><stop offset="0" stop-color="' . $c2 . '"/><stop offset=".45" stop-color="' . $c1 . '"/><stop offset="1" stop-color="' . $c2 . '"/></linearGradient></defs>'
        . '<path d="M90 20h20v62c0 10 26 22 26 52v146c0 6-4 10-10 10H74c-6 0-10-4-10-10V134c0-30 26-42 26-52z" fill="url(#' . $uid . ')"/>'
        . '<rect x="88" y="14" width="24" height="26" rx="3" fill="#1c1a18"/>'
        . '<rect x="70" y="170" width="60" height="70" rx="2" fill="#f6f1e7"/>'
        . '<line x1="80" y1="190" x2="120" y2="190" stroke="#1c1a18" stroke-width="2"/>'
        . '<line x1="86" y1="202" x2="114" y2="202" stroke="#b08d57" stroke-width="1.5"/>'
        . '<text x="100" y="226" text-anchor="middle" font-family="Georgia,serif" font-size="12" fill="#1c1a18">' . $label . '</text>'
        . '<path d="M78 120c4-14 10-20 12-30" stroke="#fff" stroke-opacity=".25" stroke-width="5" fill="none" stroke-linecap="round"/>'
        . '</svg>';
}

function icon(string $name, int $size = 20): string
{
    $paths = [
        'cart' => '<path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2"/><circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
        'user' => '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
        'search' => '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
        'heart' => '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
        'menu' => '<path d="M4 7h16M4 12h16M4 17h16"/>',
        'close' => '<path d="M6 6l12 12M18 6 6 18"/>',
        'arrow' => '<path d="M5 12h14M13 6l6 6-6 6"/>',
        'truck' => '<path d="M3 6h11v9H3zM14 9h4l3 3v3h-7"/><circle cx="7" cy="17" r="1.6"/><circle cx="17" cy="17" r="1.6"/>',
        'leaf' => '<path d="M5 19C5 10 10 5 20 4c-1 10-6 15-15 15z"/><path d="M5 19 13 11"/>',
        'shield' => '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
        'box' => '<path d="M3 7 12 3l9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
        'glass' => '<path d="M7 3h10c0 6-2 9-5 9s-5-3-5-9zM12 12v8M8 21h8"/>',
        'building' => '<path d="M4 21V5l8-2v18M12 8h8v13M8 8v.01M8 12v.01M8 16v.01M16 12v.01M16 16v.01"/>',
        'filter' => '<path d="M4 5h16l-6 7v6l-4 2v-8z"/>',
        'plus' => '<path d="M12 5v14M5 12h14"/>',
        'minus' => '<path d="M5 12h14"/>',
        'check' => '<path d="m5 12 5 5L20 7"/>',
        'refresh' => '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
        'file' => '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
        'logout' => '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
    ];
    return '<svg class="ico" width="' . $size . '" height="' . $size . '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        . ($paths[$name] ?? '') . '</svg>';
}
