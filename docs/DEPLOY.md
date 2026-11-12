# Deployment

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

## Typical setups

| Setup | Command / files | Notes |
|---|---|---|
| **Single server** (Hostpoint, VPS, Jelastic node) | `npm start` behind nginx or the panel proxy | Embedded DB in `./data` (back it up) or `DATABASE_URL`. Built-in scheduler |
| **Docker / Compose** | `docker compose up -d` (app + Postgres) | Image with healthcheck (`/api/health`), graceful shutdown |
| **Buildpack PaaS** | `Procfile`; set env vars in the dashboard | Add managed Postgres. Use `STORAGE_DRIVER=s3` if the disk is ephemeral |
| **Kubernetes** | `deploy/k8s/shop.yaml` (Deployment ×2, Service, Ingress, CronJob) | `JOBS_INTERVAL_MINUTES=0` in pods; the CronJob calls `/api/cron` once for the cluster |
| **Serverless** (Vercel, Netlify, Cloudflare) | React Router adapters | Possible with managed Postgres and S3, but the outbox and scheduler need an external cron. A long-running Node is recommended |

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `PORT` / `HOST` | `3000` / `0.0.0.0` | `HOST=127.0.0.1` behind a local proxy (Hostpoint, nginx) |
| `SESSION_SECRET` | — | **required in production** (`npm run setup` generates it) |
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
