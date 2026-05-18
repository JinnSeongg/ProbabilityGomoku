#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/ProbabilityGomoku"
APP_NAME="probability-gomoku"
PORT="${PORT:-3002}"

cd "$APP_DIR"
npm ci --omit=dev
npm install --no-save tsx

if command -v pm2 >/dev/null 2>&1; then
  pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
  PORT="$PORT" pm2 start "npx tsx server/src/index.ts" --name "$APP_NAME" --cwd "$APP_DIR"
  pm2 save
else
  echo "pm2 is not installed. Install it with: sudo npm install -g pm2"
  exit 1
fi
