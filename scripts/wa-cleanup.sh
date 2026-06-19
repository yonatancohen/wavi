#!/usr/bin/env bash
# Stop orphaned Puppeteer browsers left behind by bun --watch restarts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SESSION_DIR="${WA_SESSION_PATH:-$ROOT/apps/api/.wwebjs_auth/session}"

if [[ ! -d "$SESSION_DIR" ]]; then
  echo "No WhatsApp session directory at $SESSION_DIR"
  exit 0
fi

PIDS=$(pgrep -f "$SESSION_DIR" || true)
if [[ -z "$PIDS" ]]; then
  echo "No stale browser processes for $SESSION_DIR"
else
  echo "Stopping browser PIDs: $PIDS"
  kill -TERM $PIDS 2>/dev/null || true
  sleep 1
fi

for lock in SingletonLock SingletonCookie SingletonSocket; do
  if [[ -e "$SESSION_DIR/$lock" ]]; then
    rm -f "$SESSION_DIR/$lock"
    echo "Removed $lock"
  fi
done

echo "WhatsApp browser cleanup done."
