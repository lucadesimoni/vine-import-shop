<?php
declare(strict_types=1);

namespace App\Core;

use Throwable;

/**
 * Application kernel: service container, module registry and HTTP dispatch.
 */
final class App
{
    private static ?App $instance = null;

    public readonly Router $router;
    public readonly Events $events;
    public readonly View $view;
    public readonly I18n $i18n;

    /** @var array<string, Module> */
    private array $modules = [];
    /** @var array<string, callable> */
    private array $factories = [];
    /** @var array<string, mixed> */
    private array $services = [];
    /** @var array<int, array{label:string,url:string,icon:string}> */
    public array $adminMenu = [];

    public function __construct(public readonly Config $config)
    {
        $this->router = new Router();
        $this->events = new Events();
        $this->view = new View(BASE_PATH . '/app/views');
        $this->i18n = new I18n(
            BASE_PATH . '/app/lang',
            (array) $config->get('app.locales', ['de']),
            (string) $config->get('app.default_locale', 'de')
        );

        $this->set(DB::class, fn () => new DB((array) $config->get('db', [])));
        $this->set(Mailer::class, fn () => new Mailer((array) $config->get('mail', []), $this->view));
    }

    public static function setInstance(App $app): void
    {
        self::$instance = $app;
    }

    public static function instance(): App
    {
        if (!self::$instance) {
            throw new \RuntimeException('App not bootstrapped');
        }
        return self::$instance;
    }

    // ---- container -------------------------------------------------------

    public function set(string $id, callable $factory): void
    {
        $this->factories[$id] = $factory;
        unset($this->services[$id]);
    }

    public function get(string $id): mixed
    {
        if (!array_key_exists($id, $this->services)) {
            if (!isset($this->factories[$id])) {
                throw new \RuntimeException("Service not registered: $id");
            }
            $this->services[$id] = ($this->factories[$id])($this);
        }
        return $this->services[$id];
    }

    public function has(string $id): bool
    {
        return isset($this->factories[$id]);
    }

    public function db(): DB
    {
        return $this->get(DB::class);
    }

    // ---- modules ---------------------------------------------------------

    public function bootModules(): void
    {
        \App\Shop\ShopServices::register($this);
        foreach ((array) $this->config->get('modules', []) as $class) {
            if (!class_exists($class)) {
                continue;
            }
            /** @var Module $module */
            $module = new $class();
            $module->register($this);
            $this->modules[$module->name()] = $module;
        }
    }

    public function hasModule(string $name): bool
    {
        return isset($this->modules[$name]);
    }

    /** @return array<string, Module> */
    public function modules(): array
    {
        return $this->modules;
    }

    // ---- HTTP ------------------------------------------------------------

    public function handle(Request $request): Response
    {
        try {
            Session::start((bool) $this->config->get('app.secure_cookies', $request->isHttps()));
            Installer::ensure($this);
            $this->i18n->detect($request);

            $match = $this->router->match($request->method, $request->path);
            if ($match === null) {
                throw new HttpException(404);
            }
            [$handler, $params, $middleware] = $match;

            if ($request->method === 'POST' && !in_array('nocsrf', $middleware, true)) {
                Csrf::verify($request);
            }
            foreach ($middleware as $mw) {
                $result = $this->runMiddleware($mw, $request);
                if ($result instanceof Response) {
                    return $result;
                }
            }

            $result = $handler($request, $params);
            return $result instanceof Response ? $result : Response::html((string) $result);
        } catch (HttpException $e) {
            if ($request->wantsJson()) {
                return Response::json(['error' => $e->getMessage() ?: 'error'], $e->status);
            }
            $tpl = $e->status === 404 ? 'errors/404' : 'errors/error';
            return Response::html($this->view->render($tpl, ['status' => $e->status, 'message' => $e->getMessage()]), $e->status);
        } catch (Throwable $e) {
            error_log((string) $e);
            $debug = (bool) $this->config->get('app.debug', false);
            if ($request->wantsJson()) {
                return Response::json(['error' => $debug ? $e->getMessage() : 'server_error'], 500);
            }
            try {
                $html = $this->view->render('errors/error', ['status' => 500, 'message' => $debug ? (string) $e : '']);
            } catch (Throwable) {
                $html = '<h1>500</h1>' . ($debug ? '<pre>' . htmlspecialchars((string) $e) . '</pre>' : '');
            }
            return Response::html($html, 500);
        }
    }

    private function runMiddleware(string $name, Request $request): ?Response
    {
        $auth = Auth::instance();
        switch ($name) {
            case 'auth':
                if (!$auth->check()) {
                    Session::set('intended', $request->uri);
                    return Response::redirect(url('/login'));
                }
                return null;
            case 'admin':
                if (!$auth->isAdmin()) {
                    if (!$auth->check()) {
                        Session::set('intended', $request->uri);
                        return Response::redirect(url('/login'));
                    }
                    throw new HttpException(403);
                }
                return null;
            case 'b2b':
                if (!$auth->isB2B()) {
                    return Response::redirect(url('/b2b'));
                }
                return null;
            case 'guest':
                if ($auth->check()) {
                    return Response::redirect(url('/account'));
                }
                return null;
            default:
                return null;
        }
    }
}
