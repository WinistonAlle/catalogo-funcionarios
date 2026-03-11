#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

WEB_PORT="${PORT:-4174}"
WEBHOOK_PORT="${SAIBWEB_WEBHOOK_PORT:-3333}"

echo "Subindo preview em http://0.0.0.0:${WEB_PORT}"
echo "Subindo webhook da automacao em http://0.0.0.0:${WEBHOOK_PORT}"

trap 'kill 0' INT TERM EXIT

npm run preview -- --host 0.0.0.0 --port "${WEB_PORT}" &
npx tsx automation/saibweb-webhook.ts &

wait
