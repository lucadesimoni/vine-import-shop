<?php
declare(strict_types=1);

namespace App\Core;

/**
 * UI strings live in app/lang/{locale}.php.
 * Catalog content (product names, descriptions …) is stored as JSON
 * {"de": "...", "fr": "...", "it": "...", "en": "..."} and read via field().
 */
final class I18n
{
    private string $locale;
    private array $strings = [];

    public function __construct(private string $dir, private array $locales, private string $default)
    {
        $this->locale = $default;
    }

    public function detect(Request $request): void
    {
        $lang = $request->query['lang'] ?? null;
        if (is_string($lang) && in_array($lang, $this->locales, true)) {
            Session::set('locale', $lang);
            if (PHP_SAPI !== 'cli' && !headers_sent()) {
                setcookie('locale', $lang, ['expires' => time() + 31536000, 'path' => '/', 'samesite' => 'Lax']);
            }
            $this->setLocale($lang);
            return;
        }
        $candidates = [Session::get('locale'), $_COOKIE['locale'] ?? null];
        foreach (explode(',', (string) $request->header('Accept-Language')) as $part) {
            $candidates[] = strtolower(substr(trim($part), 0, 2));
        }
        foreach ($candidates as $c) {
            if (is_string($c) && in_array($c, $this->locales, true)) {
                $this->setLocale($c);
                return;
            }
        }
        $this->setLocale($this->default);
    }

    public function setLocale(string $locale): void
    {
        $this->locale = in_array($locale, $this->locales, true) ? $locale : $this->default;
    }

    public function locale(): string
    {
        return $this->locale;
    }

    public function locales(): array
    {
        return $this->locales;
    }

    private function load(string $locale): array
    {
        if (!isset($this->strings[$locale])) {
            $file = $this->dir . '/' . $locale . '.php';
            $this->strings[$locale] = is_file($file) ? (array) require $file : [];
        }
        return $this->strings[$locale];
    }

    public function t(string $key, array $replace = []): string
    {
        $s = $this->load($this->locale)[$key]
            ?? $this->load($this->default)[$key]
            ?? $this->load('en')[$key]
            ?? $key;
        foreach ($replace as $k => $v) {
            $s = str_replace(':' . $k, (string) $v, $s);
        }
        return $s;
    }

    /** Resolve a translated JSON field with fallback chain locale → default → first. */
    public function field(mixed $value): string
    {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            if (!is_array($decoded)) {
                return $value;
            }
            $value = $decoded;
        }
        if (!is_array($value) || $value === []) {
            return '';
        }
        return (string) ($value[$this->locale] ?? $value[$this->default] ?? reset($value));
    }
}
