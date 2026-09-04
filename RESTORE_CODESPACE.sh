#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$(pwd)}"
cd "$ROOT"

echo "== Kronos Self Pro 2.0 restore =="
python -m compileall app

echo "[1/5] Creating storage directories"
mkdir -p storage/sessions storage/media

echo "[2/5] Checking .env"
if [[ ! -f .env ]]; then
  echo "WARNING: .env does not exist. Copy .env.example to .env and fill your own values."
fi

echo "[3/5] Docker rebuild"
docker compose down || true
docker compose build --no-cache
echo "[4/5] Starting services"
docker compose up -d
sleep 4
echo "[5/5] Service status"
docker compose ps
echo
echo "Health:"
curl -fsS http://localhost:8000/health || true
echo
echo "Ready:"
curl -fsS http://localhost:8000/health/ready || true
echo
echo "Mini App:"
curl -fsSI http://localhost:8000/miniapp/ | head -n 5 || true
echo
echo "Done. Open the bot in Telegram only after bot/api/scheduler are Up."
