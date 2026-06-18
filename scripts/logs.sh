#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# scripts/logs.sh
# Tail production logs from Railway.
# Usage:
#   ./scripts/logs.sh          → last 100 lines + follow
#   ./scripts/logs.sh --lines 50
# ─────────────────────────────────────────────────────────────

LINES=100
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --lines|-n) LINES="$2"; shift ;;
  esac
  shift
done

if ! command -v railway &>/dev/null; then
  echo "Railway CLI not found. Run: npm install -g @railway/cli"
  exit 1
fi

echo "Tailing Railway logs (last $LINES lines)... Ctrl+C to stop"
echo ""
railway logs --tail "$LINES"
