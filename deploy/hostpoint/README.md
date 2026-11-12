# Hostpoint · Managed Flex Server

Hostpoint runs Node.js apps on **Managed Flex Server M and higher**. Classic web hosting has no Node runtime.
The steps follow Hostpoint's guides "Node.js auf Managed Flex Server" and "Custom Service Control" (support.hostpoint.ch).

```bash
# on your machine
npm run release                                   # → release/shop-<version>.tar.gz
scp release/shop-*.tar.gz <user>@<server>:~/      # or upload via SFTP

# on the Flex Server (SSH)
mkdir -p ~/app && tar xzf ~/shop-*.tar.gz -C ~/app && cd ~/app/shop
npm ci --omit=dev
npm run setup                                     # writes .env with secrets (add mail, payment keys …)
hpservices supervisord start                      # once per server
hpservices supervisord add shop
cp deploy/hostpoint/service.conf ~/.services/supervisord/shop/service.conf
supervisorctl update                              # starts the shop on 127.0.0.1:8080
```

**Control Panel** › Websites › create the site with the base setting **"Nginx Custom Mode (Proxy auf eigene Applikation)"**, port **8080**. Then enable Let's Encrypt.

- **Database:** keep the embedded database (data in `~/app/shop/data`, include it in backups), or set `DATABASE_URL` to a PostgreSQL server.
- **Jobs:** the built-in scheduler runs vinX sync and the outbox every 10 minutes (`JOBS_INTERVAL_MINUTES`). No cron is needed.
- **Updates:** upload the new release, `npm ci --omit=dev`, then `supervisorctl restart shop`. Migrations run automatically.
- **Logs:** `~/.services/supervisord/shop/log/`.
