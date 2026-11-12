# Deployment

Requirements: **PHP 8.1+** with `pdo_sqlite` or `pdo_mysql`, `curl`, `mbstring` and `json` (`intl` is recommended). Nothing else.

## A. Shared hosting (Hostpoint, Infomaniak, cyon, Metanet, cPanel/Plesk)
1. Upload the whole folder by FTP or SFTP.
2. Point the domain's **document root to `/public`**. If your host doesn't allow that, keep the root and the included root `.htaccess` routes everything into `public/` and blocks the internal folders.
3. Copy `.env.example` to `.env` (or `config/config.example.php` to `config/config.php`) and set at least `APP_URL`, `CRON_KEY` and the mail settings. For MySQL, also set `DB_DRIVER=mysql` and the credentials from the host panel.
4. Open the site. The schema and demo data install themselves. Read the admin password from `storage/ADMIN_PASSWORD.txt`, then delete that file.
5. Production: `DEMO_DATA=false` before the first request (or delete the DB and reinstall), and enable HTTPS (Let's Encrypt in the host panel). Uncomment the HTTPS redirect in `public/.htaccess`.
6. Cron: add `php ~/path/bin/console vinx:sync` every 10 minutes in the panel, or use web-cron with `https://shop.ch/cron.php?key=CRON_KEY`.
7. Make sure `storage/` is writable by PHP.

## B. VPS (nginx + PHP-FPM)
Use `deploy/nginx.conf`, set the document root to `public/`, run `php bin/console install --no-demo` and add a system cron for `bin/console vinx:sync`.

## C. Docker
```bash
cp .env.example .env
docker compose up -d --build   # shop + MariaDB + sync worker → http://localhost:8080
```
The image is a standard `php:8.3-apache`, so it deploys unchanged to Fly.io, Render, Railway, Azure App Service, AWS or Google Cloud Run. Mount `/var/www/html/storage` as a persistent volume.

## D. Cloudflare (Workers / Pages)
Workers don't run PHP. Two options:
1. **Recommended**: host the PHP shop anywhere (A–C) and put Cloudflare in front as a proxy/CDN (cache `/assets/*`, WAF, TLS).
2. **Headless**: keep this app as the backend (admin, checkout, B2B, vinX sync) and build a marketing or catalog front end on Workers/Pages that reads `/api/v1/products` (set `API_CORS=https://your-worker.workers.dev`). Link to the backend for cart and checkout, or extend the API.

## Go-live checklist
- [ ] `APP_DEBUG=false`, `DEMO_DATA=false`, strong `ADMIN_PASSWORD`, `storage/ADMIN_PASSWORD.txt` deleted
- [ ] HTTPS + redirect, `APP_URL` set
- [ ] Mail via SMTP tested (order confirmation, password reset)
- [ ] Bank details (IBAN) in `config.payment`; Stripe live keys + webhook `…/api/payment/stripe/webhook`
- [ ] vinX: driver configured, `bin/console vinx:ping` OK, mapping checked against a real export, full article import done
- [ ] Legal texts (AGB, privacy, imprint) replaced in `app/lang/*.php` and reviewed
- [ ] Shipping rates and free-shipping threshold in `config.shipping`
- [ ] Product images uploaded (`public/uploads/…`) and the `image` path set per product
