#!/usr/bin/env bash
# Installs or updates the Gloamwood server on a Debian/Ubuntu machine and runs it as a service.
# Usage:  sudo bash install.sh          Options (env):  PORT=8080  GM_NAMES=yourname  BRANCH=...
set -euo pipefail

REPO=https://github.com/ian-dungan/cozy-game.git
BRANCH=${BRANCH:-claude/zealous-goldberg-rzi65r}
PORT=${PORT:-8080}
GM_NAMES=${GM_NAMES:-}
SRC=/opt/gloamwood
DATA=/var/lib/gloamwood

[ "$(id -u)" = 0 ] || { echo "Please run with sudo."; exit 1; }
command -v apt-get >/dev/null || { echo "This installer supports Debian and Ubuntu only."; exit 1; }

apt-get update -qq
apt-get install -y -qq git curl ca-certificates
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch --depth 1 origin "$BRANCH"
  git -C "$SRC" checkout -q -B deploy FETCH_HEAD
else
  git clone -q --depth 1 --branch "$BRANCH" "$REPO" "$SRC"
fi
(cd "$SRC/gloamwood" && npm ci --omit=dev --silent)

id gloamwood >/dev/null 2>&1 || useradd --system --home-dir "$DATA" --shell /usr/sbin/nologin gloamwood
mkdir -p "$DATA"
chown -R gloamwood:gloamwood "$DATA"

cat > /etc/systemd/system/gloamwood.service <<UNIT
[Unit]
Description=Gloamwood game server
After=network.target

[Service]
User=gloamwood
WorkingDirectory=$SRC/gloamwood
Environment=PORT=$PORT
Environment=DATA_DIR=$DATA
Environment=GM_NAMES=$GM_NAMES
ExecStart=$(command -v node) server/server.js
Restart=always
RestartSec=3
AmbientCapabilities=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable -q gloamwood
systemctl restart gloamwood
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow "$PORT/tcp" >/dev/null; fi

sleep 2
if systemctl is-active -q gloamwood; then
  echo
  echo "Gloamwood is running. Open:  http://$(hostname -I | awk '{print $1}'):$PORT"
  echo "Characters are saved in $DATA/characters.json"
  echo "Logs: journalctl -u gloamwood -f     Update later: run this installer again."
else
  echo "The service failed to start. See: journalctl -u gloamwood -n 50"; exit 1
fi
