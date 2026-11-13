# Deployment

**Simplest:** `docker compose up -d`, or `npm run up` without Docker.
- One process, with the database built in and secrets generated into `data/`. No configuration is needed.
- Back up the `data/` folder (or the `shop-data` volume), and you have backed up everything.

**One app, any host.** You only need Node.js ≥ 20.19 (22 LTS recommended).
- **Database:** the embedded database (PGlite, a single server, no DB server needed) or any PostgreSQL ≥ 14 (`DATABASE_URL`).
- **Automatic on start:** migrations, the first-run seed and the scheduler.

```bash
npm ci && npm run setup && npm run build && npm start     # → http://localhost:3000
```

- `npm run setup` writes `.env` with strong secrets. Use `npm run setup -- --production` for a clean, non-demo install.
- The server loads `.env` by itself. Real environment variables always take precedence.
- `npm run release` creates `release/shop-<version>.tar.gz` for hosts where you can't build: unpack, run `npm ci --omit=dev`, then `npm start`.

## Hosting with data in Switzerland

| Provider | Product | How | Recipe |
|---|---|---|---|
| **Hostpoint** | Managed Flex Server (M+) | Release, CSC/supervisord, nginx proxy on `127.0.0.1:8080` | [deploy/hostpoint](../deploy/hostpoint/README.md) |
| **Infomaniak** | Jelastic Cloud (Node.js or Docker), VPS Cloud, Public Cloud (Kubernetes) | Node: `npm start`. Docker: the image. K8s: manifest | below |
| **Exoscale** (Geneva / Zurich) | Compute, SKS (Kubernetes), DBaaS PostgreSQL, SOS (S3) | Docker or [deploy/k8s](../deploy/k8s/shop.yaml); `DATABASE_URL` + `STORAGE_DRIVER=s3` | below |
| **Nine** (Deploio) and other buildpack PaaS | Git-push PaaS, managed PostgreSQL | `Procfile` (`web: npm start`); `npm run build` runs automatically | below |
| **Hidora** and other Jelastic PaaS | Node.js or Docker nodes | as Infomaniak Jelastic | below |
| **Swiss cloud regions:** Azure Switzerland North, AWS Europe (Zurich), Google Cloud europe-west6 (Zurich) | Containers, Kubernetes, managed PostgreSQL, object storage | Docker image or [deploy/k8s](../deploy/k8s/shop.yaml) | below |
| **cPanel / Plesk hosts with Node.js** | Passenger | Startup file `passenger.cjs` | [deploy/passenger](../deploy/passenger/README.md) |
| **Any VPS** (Linux) | systemd + nginx | [deploy/vps](../deploy/vps/) | below |

PHP-only shared hosting (for example classic web hosting without Node) is not supported. The platform needs server rendering, live ERP calls and background jobs.

## One-click platforms

### Elestio
The button in the README opens Elestio's CI/CD deploy for this repository, configured by `elestio.yml`:
- It uses the Docker Compose runtime with `docker-compose.elestio.yml` (app + Postgres 17, data in `./storage`).
- HTTPS on 443 is mapped to `172.17.0.1:3000`.
- `SESSION_SECRET`, `CRON_SECRET`, `POSTGRES_PASSWORD` and `ADMIN_PASSWORD` are generated (`random_password`). `ADMIN_EMAIL` is your Elestio account email.
- Every push redeploys automatically.
- Pick a Swiss/EU provider and region in the Elestio wizard if data residency matters.

### Vercel
- Uses the official `@vercel/react-router` preset (enabled automatically when `VERCEL=1`). `.npmrc` sets `legacy-peer-deps` because the preset still declares React Router 7 as its peer; it builds and runs with React Router 8.
- **Database:** add Neon (Vercel Marketplace › Storage). It sets `DATABASE_URL`. Without it the app starts as an **ephemeral demo** (embedded DB in `/tmp`, reset on cold start).
- **Migrations** are bundled into the build and run on first request.
- **Uploads:** `STORAGE_DRIVER=s3` with Cloudflare R2, AWS S3, Exoscale SOS or another S3-compatible store.
- **Jobs (cron):** three ways to call `/api/cron` (each call needs `Authorization: Bearer $CRON_SECRET`):
  - **Vercel Cron** (`vercel.json`, daily at 04:00 — the Hobby plan allows nothing more frequent). On Pro, set `*/10 * * * *` in `vercel.json`.
  - **GitHub Actions** (`.github/workflows/cron.yml`, every 15 min, any plan): set the repository secrets `SHOP_URL` and `CRON_SECRET`.
  - Any external scheduler (cron-job.org, UptimeRobot, server cron) with a `POST`.
  - Orders and new customers are pushed to the ERP **inline** when they are placed, so they don't wait for the cron.
- **Time limits:** jobs run within a budget below the function limit, controlled by `JOB_BUDGET_SECONDS`. The default on Vercel is 50 s, which fits every plan.
  - With Fluid Compute (Settings › Functions, max. duration 300 s) set `JOB_BUDGET_SECONDS=270`.
  - Order: orders → vinX, order status, stock, prices, special prices, articles, customers, images.
  - What does not fit is reported as `deferred` and runs next time.
  - Long jobs (article delta/full sync, stock, price lists, customer pull, receipts, customer import, images) stop cleanly and continue at the same record in the next call. Each run makes progress.
  - Delta syncs keep the start of the first partial run, so nothing is missed.
  - Price lists are written per complete article, never half.
  - Every vinX request has a timeout inside the budget.
- **Do not use per-route `export const config`** without `DATABASE_URL`: Vercel would build a separate function with its own temporary database.
- **Backups:** automatic file backups are off on Vercel (`/tmp` is temporary). Use the managed Postgres backups (Neon: point-in-time restore).
- **Image optimizer:** runs on Vercel only with `STORAGE_DRIVER=s3`; without it the job skips itself (files in `/tmp` would vanish).
- **vinX firewall:** if vinX only accepts known IP addresses, Vercel needs Static IPs (Pro / Secure Compute), or use a host with a fixed IP.

### Render
`render.yaml` creates the web service (Node, `npm start`, health check `/api/health`) and a Postgres database, and generates the secrets. Uploads persist only with `STORAGE_DRIVER=s3` or a Render disk.

### Railway · Coolify · Dokploy · CapRover · Portainer
Point them at the repository. They build the `Dockerfile` (`railway.json` sets the health check) or use `docker-compose.yml`. Add Postgres in the dashboard and set `DATABASE_URL`, or mount a volume at `/app/data` for the embedded DB.

## Typical setups

| Setup | Command / files | Notes |
|---|---|---|
| **Single server** (Hostpoint, VPS, Jelastic node) | `npm start` behind nginx or the panel proxy | Embedded DB in `./data` (back it up) or `DATABASE_URL`. Built-in scheduler |
| **Docker / Compose** | `docker compose up -d` (single container, built-in DB) · `docker compose -f docker-compose.postgres.yml up -d` (app + Postgres) | Image with healthcheck (`/api/health`), graceful shutdown |
| **Buildpack PaaS** | `Procfile`; set env vars in the dashboard | Add managed Postgres. Use `STORAGE_DRIVER=s3` if the disk is ephemeral |
| **Kubernetes** | `deploy/k8s/shop.yaml` (Deployment ×2, Service, Ingress, CronJob) | `JOBS_INTERVAL_MINUTES=0` in pods; the CronJob calls `/api/cron` once for the cluster |
| **Serverless** (Vercel, Netlify, Cloudflare) | React Router adapters | Possible with managed Postgres and S3, but the outbox and scheduler need an external cron. A long-running Node is recommended |

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `PORT` / `HOST` | `3000` / `0.0.0.0` | `HOST=127.0.0.1` behind a local proxy (Hostpoint, nginx) |
| `SESSION_SECRET`, `CRON_SECRET` | generated into `data/secrets.json` | set explicitly when running several instances or serverless |
| `DATABASE_URL` | embedded DB in `./data` | PostgreSQL connection string |
| `DEMO_DATA`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | demo on | First start on an empty DB |
| `JOBS_INTERVAL_MINUTES` | `10` | Built-in scheduler. Use `0` with several instances, and use the platform cron → `POST /api/cron` (`Authorization: Bearer $CRON_SECRET`) |
| `STORAGE_DRIVER=s3` + `S3_*` | local `./data/uploads` | Any S3-compatible store (Exoscale SOS, Infomaniak Swiss Backup/Object Storage, AWS, R2 …) |
| `MAIL_DRIVER=smtp`, `SMTP_URL`, `MAIL_FROM` | log | Order mails |
| Payments, vinX, extensions | — | See `.env.example`, [VINX.md](VINX.md), [EXTENDING.md](EXTENDING.md) |

## Production checklist

- [ ] HTTPS. HSTS is sent automatically when `NODE_ENV=production`.
- [ ] `npm run setup -- --production`, then set your own `ADMIN_EMAIL` and change the admin password after the first login.
- [ ] Backups: the PostgreSQL dump, or the `./data` folder for the embedded DB, plus uploads.
- [ ] Mail tested (order confirmation).
- [ ] Payments: bank details, and provider keys plus webhooks at `/api/payments/<provider>`.
- [ ] vinX: driver, mapping check (`npm run vinx:spec -- <url> && npm test`), customer links.
- [ ] Brand, content and legal pages (AGB, privacy, imprint) reviewed in admin.
