#!/usr/bin/env bash
# Set up a fresh server (Debian 12 / Ubuntu 22.04+, 2–4 GB RAM) as a shop host, once, as root:
#
#   git clone … && sudo ./deploy/host/bootstrap.sh          (or copy deploy/host/ to the server)
#
# Installs Docker, rclone (off-site backups) and a firewall (22/80/443), puts shopctl in /usr/local/bin,
# enables the timers (monitor every 2 min, backups 02:30, updates 04:15) and starts Caddy + PostgreSQL.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="${SHOPCTL_ROOT:-/srv/shophost}"
say() { printf '\033[1m▸ %s\033[0m\n' "$*"; }

say "packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl openssl rclone ufw unattended-upgrades >/dev/null
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh >/dev/null
systemctl enable --now docker >/dev/null

say "firewall: ssh, http, https"
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443 >/dev/null; ufw --force enable >/dev/null
# Docker publishes 80/443 itself; the database is never exposed (internal network only)

say "shopctl → /usr/local/bin, files → $ROOT/infra"
mkdir -p "$ROOT/infra"
cp "$HERE/compose.yml" "$HERE/Caddyfile" "$HERE/shopctl.env.example" "$HERE/shopctl" "$ROOT/infra/"
chmod +x "$ROOT/infra/shopctl"
ln -sf "$ROOT/infra/shopctl" /usr/local/bin/shopctl
cp "$HERE"/systemd/shopctl-* /etc/systemd/system/
[ "$ROOT" = /srv/shophost ] || sed -i "s#^ExecStart=/usr/local/bin/shopctl#Environment=SHOPCTL_ROOT=$ROOT\nExecStart=/usr/local/bin/shopctl#" /etc/systemd/system/shopctl-*.service
systemctl daemon-reload
systemctl enable --now shopctl-monitor.timer shopctl-backup.timer shopctl-update.timer >/dev/null

# security updates of the OS itself (the shops are updated by shopctl)
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true

SHOPCTL_ROOT="$ROOT" shopctl init
cat <<'NEXT'

Next:
  1. nano /srv/shophost/shopctl.env       e-mail, status domain, SMTP for alerts, off-site bucket + passphrase
  2. shopctl init                         applies it (prints the status page password once)
  3. docker login ghcr.io                 read-only token for the private image
  4. from your machine: npm run customer:new -- …   (or here: shopctl new NAME --domains … --admin …)
NEXT
