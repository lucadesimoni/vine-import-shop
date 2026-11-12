<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Plain-PHP templates. Templates call $this->partial(), $this->layout(),
 * and the global helpers (e(), t(), url(), money() ...).
 *
 * Theme override: put a file with the same relative path in
 * app/views/theme/ and it wins — handy to restyle without touching core views.
 */
final class View
{
    private ?string $layout = null;
    private array $sections = [];
    private array $shared = [];

    public function __construct(private string $path)
    {
    }

    public function share(string $key, mixed $value): void
    {
        $this->shared[$key] = $value;
    }

    public function render(string $template, array $data = [], string $layout = 'layouts/main'): string
    {
        $this->layout = $layout;
        $content = $this->capture($template, $data);
        if ($this->layout === null || $this->layout === '') {
            return $content;
        }
        $layoutName = $this->layout;
        $this->layout = null;
        return $this->capture($layoutName, $data + ['content' => $content]);
    }

    /** Called from a template to change/disable the layout. */
    public function layout(?string $name): void
    {
        $this->layout = $name;
    }

    public function partial(string $template, array $data = []): string
    {
        return $this->capture('partials/' . $template, $data);
    }

    public function section(string $name, ?string $value = null): string
    {
        if ($value !== null) {
            $this->sections[$name] = $value;
            return '';
        }
        return $this->sections[$name] ?? '';
    }

    private function resolve(string $template): string
    {
        $theme = $this->path . '/theme/' . $template . '.php';
        if (is_file($theme)) {
            return $theme;
        }
        $file = $this->path . '/' . $template . '.php';
        if (!is_file($file)) {
            throw new \RuntimeException("View not found: $template");
        }
        return $file;
    }

    private function capture(string $template, array $data): string
    {
        $__file = $this->resolve($template);
        extract($this->shared + $data, EXTR_SKIP);
        ob_start();
        try {
            include $__file;
        } catch (\Throwable $e) {
            ob_end_clean();
            throw $e;
        }
        return (string) ob_get_clean();
    }
}
