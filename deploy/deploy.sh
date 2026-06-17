#!/usr/bin/env bash
# 서버에서 실행: 코드 업로드(/opt/axedu) 후 빌드·구동
set -euo pipefail
APP_DIR="${1:-/opt/axedu}"
cd "$APP_DIR"

echo "[deploy] npm install"
npm install

echo "[deploy] build client"
npm run build

if [ ! -f .env ]; then
  cp .env.example .env
  echo "[deploy] .env 생성됨 — 실제 키를 채운 뒤 'pm2 restart axedu' 하세요."
fi

echo "[deploy] (re)start with pm2"
pm2 delete axedu >/dev/null 2>&1 || true
pm2 start "npm start" --name axedu --cwd "$APP_DIR"
pm2 save
# 부팅 시 자동 시작 (systemd)
pm2 startup systemd -u "$(whoami)" --hp "$HOME" | tail -1 | sudo bash || true

echo "[deploy] done. 상태:"
pm2 status
echo "[deploy] http://<공인IP>/ 로 접속 (nginx → :8787)"
