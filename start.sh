#!/usr/bin/env bash
# 星链智运 · 一键启动（macOS / Linux）
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo " [错误] 未检测到 Node.js，请先安装: https://nodejs.org/zh-cn (LTS 版)"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo " 首次运行，正在安装依赖…"
  npm install --no-audit --no-fund
fi

[ -f .env ] || cp .env.example .env

echo ""
echo " ══════════════════════════════════════════"
echo "  星链智运服务启动中…"
echo "  电脑访问: http://localhost:3000"
echo "  手机访问: http://本机局域网IP:3000 （同一 Wi-Fi）"
echo "  Ctrl+C 停止服务"
echo " ══════════════════════════════════════════"
echo ""

exec node server/index.js
