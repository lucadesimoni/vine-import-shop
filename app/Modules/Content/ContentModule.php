<?php
declare(strict_types=1);

namespace App\Modules\Content;

use App\Core\App;
use App\Core\DB;
use App\Core\HttpException;
use App\Core\Mailer;
use App\Core\Module;
use App\Core\Request;
use App\Core\Response;
use App\Shop\Catalog;
use App\Shop\Pricing;

final class ContentModule implements Module
{
    /** Static pages: slug → translation key prefix. Content lives in app/views/content/pages/{slug}.php */
    private const PAGES = ['about', 'shipping', 'terms', 'privacy', 'imprint'];

    public function name(): string
    {
        return 'content';
    }

    public function register(App $app): void
    {
        $r = $app->router;

        $r->get('/', function () use ($app) {
            $catalog = $app->get(Catalog::class);
            $featured = $catalog->featured(8);
            $app->get(Pricing::class)->preload(array_column($featured, 'id'), (int) (auth()->group()['id'] ?? 0));
            return view('content/home', [
                'featured' => $featured,
                'categories' => $catalog->categories(),
                'producers' => array_slice($catalog->producers(), 0, 6),
            ]);
        });

        $r->get('/page/{slug}', function (Request $req, array $p) {
            if (!in_array($p['slug'], self::PAGES, true)) {
                throw new HttpException(404);
            }
            return view('content/page', ['slug' => $p['slug']]);
        });

        $r->get('/contact', fn () => view('content/contact'));
        $r->post('/contact', function (Request $req) use ($app) {
            $email = filter_var($req->str('email'), FILTER_VALIDATE_EMAIL);
            if (!$email || $req->str('message') === '' || $req->str('website') !== '') { // 'website' = honeypot
                flash('error', t('form.invalid'));
                return redirect('/contact');
            }
            $html = '<p><strong>' . e($req->str('name')) . '</strong> &lt;' . e($email) . '&gt;</p><p>' . nl2br(e($req->str('message'))) . '</p>';
            $app->get(Mailer::class)->send((string) config('shop.email'), 'Kontaktanfrage: ' . $req->str('subject', 'Web'), $html, $email);
            flash('success', t('contact.sent'));
            return redirect('/contact');
        });

        $r->post('/newsletter', function (Request $req) use ($app) {
            $email = filter_var($req->str('email'), FILTER_VALIDATE_EMAIL);
            if ($email) {
                $db = $app->db();
                if (!$db->value('SELECT id FROM newsletter WHERE email = ?', [mb_strtolower($email)])) {
                    $db->insert('newsletter', ['email' => mb_strtolower($email), 'locale' => locale(), 'created_at' => DB::now()]);
                    $app->events->emit('newsletter.subscribed', ['email' => $email]);
                }
                flash('success', t('newsletter.thanks'));
            }
            return $req->isAjax() ? Response::json(['ok' => (bool) $email, 'message' => t('newsletter.thanks')]) : back($req);
        });

        $r->get('/robots.txt', fn () => Response::text("User-agent: *\nDisallow: /admin\nDisallow: /account\nDisallow: /checkout\nDisallow: /cart\nSitemap: " . absolute_url('/sitemap.xml') . "\n"));

        $r->get('/sitemap.xml', function () use ($app) {
            $db = $app->db();
            $urls = ['/', '/shop', '/producers', '/b2b', '/contact'];
            foreach ($db->all('SELECT slug FROM categories') as $c) {
                $urls[] = '/shop/' . $c['slug'];
            }
            foreach ($db->all('SELECT slug FROM producers') as $c) {
                $urls[] = '/producers/' . $c['slug'];
            }
            foreach ($db->all('SELECT slug FROM products WHERE active = 1 AND b2b_only = 0') as $c) {
                $urls[] = '/p/' . $c['slug'];
            }
            $xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">';
            foreach ($urls as $u) {
                $xml .= '<url><loc>' . e(absolute_url($u)) . '</loc>';
                foreach ((array) config('app.locales') as $l) {
                    $xml .= '<xhtml:link rel="alternate" hreflang="' . $l . '" href="' . e(absolute_url($u) . '?lang=' . $l) . '"/>';
                }
                $xml .= '</url>';
            }
            return Response::text($xml . '</urlset>', 'application/xml');
        });

        $r->post('/age-confirm', function (Request $req) {
            setcookie('age_ok', '1', ['expires' => time() + 86400 * 90, 'path' => '/', 'samesite' => 'Lax']);
            return Response::json(['ok' => true]);
        });
    }
}
