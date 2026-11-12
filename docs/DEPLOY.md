# Deployment

Requirements: **Node.js ≥ 20.19** (22 LTS recommended). Database: any **PostgreSQL ≥ 14**, or none for the embedded PGlite (single server).

```bash
npm ci && npm run build
DATABASE_URL=postgres://… SESSION_SECRET=… npm start      # port 3000 (PORT=…)
```

Migrations run automatically on start. With `DEMO_DATA=false` an empty database gets only the neutral base (customer groups, admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD`, legal-page stubs).

## Where it runs

| Target | How |
|---|---|
| **Docker** (VPS, Hetzner, Infomaniak, Exoscale, Fly.io, Railway, Render, Cloud Run, Azure, AWS) | `docker compose up -d` (app + Postgres + scheduler) or `docker build .` |
| **Node hosting** (Swiss hosts with Node.js support, Plesk/cPanel Node apps, PM2/systemd) | `npm run build && npm start` |
| **Vercel / Netlify** | Add the official React Router preset/adapter (`@vercel/react-router`, `@netlify/vite-plugin-react-router`) and use a managed Postgres (`DATABASE_URL`) plus `STORAGE_DRIVER=s3` |
| **Cloudflare Workers** | `@react-router/cloudflare` with Hyperdrive in front of Postgres and R2 via `STORAGE_DRIVER=s3`. Mail via an HTTP provider (SMTP is not available on Workers) |

PHP-only shared hosting is not supported. The platform's requirements (server rendering, live ERP calls, background jobs) need Node or a container runtime.

## Scheduled jobs

Call `POST /api/cron` with `Authorization: Bearer $CRON_SECRET` every 5–15 minutes. It runs the outbox, stock, prices and article delta (`?jobs=outbox,stock` to choose). Any scheduler works: the platform's cron, systemd timers, docker-compose `cron`, or cron-job.org. On a VPS, `npm run jobs` works too.

## Production checklist

- [ ] `SESSION_SECRET` (long random), `NODE_ENV=production`, HTTPS in front
- [ ] `DATABASE_URL` (Postgres) and backups; `STORAGE_DRIVER=s3` when running more than one instance
- [ ] `DEMO_DATA=false`, own `ADMIN_EMAIL` / `ADMIN_PASSWORD`, then change the password
- [ ] `MAIL_DRIVER=smtp`, `SMTP_URL`, `MAIL_FROM`; test the order email
- [ ] Payments: bank details (Admin → Settings); Stripe keys and webhook `/api/payments/stripe`
- [ ] vinX: see [VINX.md](VINX.md); `CRON_SECRET` scheduler active
- [ ] Brand, content, legal pages (AGB, privacy, imprint) reviewed in admin
