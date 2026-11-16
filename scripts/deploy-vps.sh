#!/usr/bin/env bash
# 卡序 KAXU · Debian 12 一键部署
# 用法：sudo bash deploy-vps.sh
set -euo pipefail

APP_DIR="/opt/kaxu-card-shop"
APP_USER="kaxu"
REPO_URL="https://github.com/qwerty959284/kaxu-card-shop.git"
NODE_MAJOR="22"

ADMIN_PASS="${ADMIN_PASS:-}"
EPAY_KEY="${EPAY_KEY:-}"
EPAY_PID="${EPAY_PID:-}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "请用 root 运行：sudo bash deploy-vps.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "== 1/6 更新系统并安装基础工具 =="
apt-get update -y
apt-get install -y ca-certificates curl gnupg git ufw

echo "== 2/6 安装 Node.js ${NODE_MAJOR} =="
CURRENT_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [[ "${CURRENT_MAJOR}" -lt "${NODE_MAJOR}" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v

echo "== 3/6 安装 Caddy（自动 HTTPS） =="
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -y
  apt-get install -y caddy
fi
caddy version

echo "== 4/6 拉取代码 =="
if [[ -d "${APP_DIR}/.git" ]]; then
  git -C "${APP_DIR}" pull --ff-only
else
  git clone --depth 1 "${REPO_URL}" "${APP_DIR}"
fi

echo "== 5/6 配置管理员密码和支付密钥 =="
echo "提示：下面输入的内容会显示在屏幕上，这是为了方便确认输入；输完按回车。"
echo

if [[ -z "${ADMIN_PASS}" ]]; then
  read -rp "后台管理员密码（至少 8 位）: " ADMIN_PASS || {
    echo
    echo "读取输入失败，请重新运行脚本。"
    exit 1
  }
fi
if [[ ${#ADMIN_PASS} -lt 8 ]]; then
  echo "密码至少 8 位，部署中止。"
  exit 1
fi

if [[ -z "${EPAY_KEY}" ]]; then
  read -rp "易彩豆商户密钥 EPAY_KEY: " EPAY_KEY || {
    echo
    echo "读取输入失败，请重新运行脚本。"
    exit 1
  }
fi
if [[ -z "${EPAY_KEY}" ]]; then
  echo "EPAY_KEY 不能为空，部署中止。"
  exit 1
fi

if [[ -z "${EPAY_PID}" ]]; then
  read -rp "易彩豆商户 PID [10169]: " EPAY_PID || true
fi
EPAY_PID="${EPAY_PID:-10169}"

IP="$(curl -4 -fsS --max-time 10 https://api.ipify.org 2>/dev/null || true)"
if [[ -z "${IP}" ]]; then
  IP="$(hostname -I | awk '{print $1}')"
fi
DOMAIN="${IP//./-}.sslip.io"
echo "将使用免费域名：https://${DOMAIN}"

umask 077
{
  printf 'PORT=8787\n'
  printf 'PUBLIC_BASE_URL=https://%s\n' "${DOMAIN}"
  printf 'ADMIN_USER=ADMIN\n'
  printf 'ADMIN_INITIAL_PASSWORD=%s\n' "${ADMIN_PASS}"
  printf 'EPAY_GATEWAY=https://pay.521cd.cn/xpay/epay\n'
  printf 'EPAY_PID=%s\n' "${EPAY_PID}"
  printf 'EPAY_KEY=%s\n' "${EPAY_KEY}"
} > "${APP_DIR}/.env"

if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --home "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi
mkdir -p "${APP_DIR}/data"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
chmod 600 "${APP_DIR}/.env"

echo "== 6/6 配置 systemd 和 Caddy =="
cat > /etc/systemd/system/kaxu.service <<EOF
[Unit]
Description=KAXU Card Shop
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now kaxu

for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8787/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS http://127.0.0.1:8787/api/health >/dev/null 2>&1; then
  echo "应用启动失败，查看日志：journalctl -u kaxu -n 80 --no-pager"
  exit 1
fi

cat > /etc/caddy/Caddyfile <<EOF
${DOMAIN} {
  encode gzip
  reverse_proxy 127.0.0.1:8787
}
EOF

systemctl enable caddy >/dev/null 2>&1 || true
systemctl reload caddy 2>/dev/null || systemctl restart caddy

if ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
fi

echo "等待 HTTPS 证书（最多 60 秒）..."
for i in $(seq 1 30); do
  if curl -fsS "https://${DOMAIN}/api/health" >/dev/null 2>&1; then
    echo
    echo "=========================================="
    echo " 部署成功"
    echo " 前台：https://${DOMAIN}"
    echo " 后台：https://${DOMAIN}/admin"
    echo " 账号：ADMIN"
    echo " 回调：https://${DOMAIN}/api/pay/notify"
    echo "=========================================="
    exit 0
  fi
  sleep 2
done

echo
echo "应用已启动，但 HTTPS 证书可能还没签发成功。"
echo "请检查："
echo "1. 商家面板/防火墙是否放行 80、443 端口"
echo "2. journalctl -u caddy -n 80 --no-pager"
echo "3. curl http://127.0.0.1:8787/api/health"
exit 1
