#!/usr/bin/env bash
# One-command install / update. Run inside the unpacked release (or a git checkout):
#   ./deploy/install.sh                 # demo data
#   ./deploy/install.sh --production    # clean install, no demo data
# Detects: Hostpoint Managed Flex (CSC) · Linux with systemd (root) · anything else (prints start command).
set -euo pipefail
cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"
NAME="${APP_NAME:-shop}"
PROFILE="${1:-}"
say() { printf '\033[1m▸ %s\033[0m\n' "$*"; }

# 1 · Node.js ≥ 20.19
command -v node >/dev/null || { echo "Node.js is missing (need ≥ 20.19)."; exit 1; }
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=19)?0:1)' \
  || { echo "Node.js $(node -v) is too old (need ≥ 20.19). On Hostpoint use e.g. /usr/local/bin/node22 or set PATH."; exit 1; }

# 2 · Dependencies + build (release archives are pre-built)
if [ -d build/server ]; then
  say "Installing production dependencies"; npm ci --omit=dev --no-audit --no-fund
else
  say "Building from source"; npm ci --no-audit --no-fund && npm run build && npm prune --omit=dev
fi

# 3 · Configuration (.env with generated secrets; kept on updates)
[ -f .env ] && say ".env kept" || { say "Writing .env"; node scripts/setup.mjs ${PROFILE:+$PROFILE}; }
mkdir -p data

# 4 · Process manager
if command -v hpservices >/dev/null 2>&1; then
  PORT="${PORT:-8080}"
  say "Hostpoint Managed Flex: Custom Service Control on 127.0.0.1:${PORT}"
  hpservices supervisord start >/dev/null 2>&1 || true
  [ -d "$HOME/.services/supervisord/$NAME" ] || hpservices supervisord add "$NAME" >/dev/null
  NODE_BIN="$(command -v node)"
  sed -e "s#^\[program:shop\]#[program:${NAME}]#" \
      -e "s#^command=.*#command=${NODE_BIN} ${APP_DIR}/server.js#" \
      -e "s#^directory=.*#directory=${APP_DIR}/#" \
      -e "s#PORT=\"8080\"#PORT=\"${PORT}\"#" \
      -e "s#/supervisord/shop/#/supervisord/${NAME}/#g" \
      deploy/hostpoint/service.conf > "$HOME/.services/supervisord/$NAME/service.conf"
  supervisorctl update >/dev/null
  supervisorctl restart "$NAME" >/dev/null 2>&1 || true
  say "Done. Control Panel › Websites › «Nginx Custom Mode (Proxy auf eigene Applikation)» › Port ${PORT}, then enable SSL."
elif command -v systemctl >/dev/null 2>&1 && [ "$(id -u)" = "0" ]; then
  PORT="${PORT:-3000}"
  say "systemd service ${NAME} on 127.0.0.1:${PORT}"
  id -u shop >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin shop
  chown -R shop:shop "$APP_DIR/data" "$APP_DIR/.env"
  sed -e "s#/srv/shop#${APP_DIR}#g" -e "s#PORT=3000#PORT=${PORT}#" -e "s#/usr/bin/node#$(command -v node)#" deploy/vps/shop.service > "/etc/systemd/system/${NAME}.service"
  systemctl daemon-reload && systemctl enable --now "$NAME" && systemctl restart "$NAME"
  say "Done. Put nginx/Caddy in front (deploy/vps/nginx.conf) → http://127.0.0.1:${PORT}"
else
  say "Ready. Start with:  npm start   (PORT/HOST via .env; behind Passenger use startup file passenger.cjs)"
fi
