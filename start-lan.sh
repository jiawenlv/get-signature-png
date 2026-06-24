#!/usr/bin/env bash
#
# 一键启动「印章提取工具」并共享给局域网内的同伴使用。
#
#   ./start-lan.sh
#
# 脚本会：
#   1. 自动探测本机当前局域网 IP
#   2. 若 mkcert 证书缺失或不包含当前 IP，则自动重新签发（HTTPS 安全上下文需要）
#   3. 按需安装前后端依赖（node_modules / .venv）
#   4. 启动后端 (FastAPI :8090) 与前端 (Vite :5173)
#   5. 打印发给同伴的访问地址
#
# 按 Ctrl+C 同时停止前后端。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

# ---- 探测局域网 IP ----------------------------------------------------------
detect_ip() {
  local iface ip
  iface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')"
  [ -n "$iface" ] && ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
  [ -z "${ip:-}" ] && ip="$(ipconfig getifaddr en0 2>/dev/null || true)"
  [ -z "${ip:-}" ] && ip="$(ipconfig getifaddr en1 2>/dev/null || true)"
  echo "${ip:-}"
}

LAN_IP="$(detect_ip)"
if [ -z "$LAN_IP" ]; then
  echo "⚠️  未能自动探测局域网 IP，请确认已连接网络。"
  exit 1
fi
echo "🌐 当前局域网 IP：$LAN_IP"

# ---- 证书（HTTPS）----------------------------------------------------------
CERT="$FRONTEND/localhost+3.pem"
KEY="$FRONTEND/localhost+3-key.pem"

cert_has_ip() {
  [ -f "$CERT" ] || return 1
  openssl x509 -in "$CERT" -noout -text 2>/dev/null | grep -q "IP Address:$LAN_IP\b"
}

if cert_has_ip; then
  echo "🔐 证书已包含当前 IP，跳过重新签发。"
else
  if command -v mkcert >/dev/null 2>&1; then
    echo "🔐 证书缺失或 IP 不匹配，重新签发（含 $LAN_IP）…"
    rm -f "$CERT" "$KEY"
    ( cd "$FRONTEND" && mkcert localhost 127.0.0.1 ::1 "$LAN_IP" >/dev/null 2>&1 )
    echo "🔐 证书已生成：localhost+3.pem"
  else
    echo "⚠️  未安装 mkcert，将以 HTTP 启动（取色 / 另存为等安全上下文 API 不可用）。"
    echo "    安装后可启用 HTTPS：brew install mkcert && mkcert -install"
  fi
fi

# ---- 依赖检查 --------------------------------------------------------------
if [ ! -d "$FRONTEND/node_modules" ]; then
  echo "📦 安装前端依赖…"
  ( cd "$FRONTEND" && npm install )
fi
if [ ! -d "$BACKEND/.venv" ]; then
  echo "📦 同步后端依赖…"
  ( cd "$BACKEND" && uv sync )
fi

# ---- 启动 ------------------------------------------------------------------
PIDS=()
cleanup() {
  echo
  echo "🛑 正在停止服务…"
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

echo "🚀 启动后端 (FastAPI :8090)…"
( cd "$BACKEND" && exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8090 ) &
PIDS+=("$!")

echo "🚀 启动前端 (Vite :5173)…"
( cd "$FRONTEND" && exec npm run dev ) &
PIDS+=("$!")

SCHEME="https"
command -v mkcert >/dev/null 2>&1 || SCHEME="http"

sleep 3
cat <<EOF

════════════════════════════════════════════════════════════
  ✅ 服务已启动，发给同伴的访问地址：

      $SCHEME://$LAN_IP:5173/

  • 同伴需与本机处于同一局域网 / WiFi
  • 首次打开会提示证书不被信任（同伴设备不认识本机 mkcert 根证书），
    点「高级」→「继续访问」即可，功能不受影响
  • 后端首次提取会懒加载 AI 模型，第一次出图较慢属正常

  按 Ctrl+C 停止全部服务
════════════════════════════════════════════════════════════
EOF

wait
