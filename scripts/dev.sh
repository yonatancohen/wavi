#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# scripts/dev.sh — Start dev servers
# Usage: ./scripts/dev.sh [api|dashboard|all]
# ─────────────────────────────────────────────────────────────
set -e

GREEN="\033[0;32m"; BLUE="\033[0;34m"
RESET="\033[0m"; BOLD="\033[1m"

TARGET=${1:-"all"}
export PATH="$HOME/.bun/bin:$PATH"

echo -e "${BOLD}Wavi Dev${RESET}\n"

case "$TARGET" in
  api)
    echo -e "${GREEN}▶ API${RESET} → http://localhost:3000"
    bun run --cwd apps/api dev
    ;;
  dashboard)
    echo -e "${BLUE}▶ Dashboard${RESET} → http://localhost:5173"
    bun run --cwd apps/dashboard dev
    ;;
  all|*)
    echo -e "${GREEN}▶ API${RESET}       → http://localhost:3000"
    echo -e "${BLUE}▶ Dashboard${RESET}  → http://localhost:5173"
    echo -e "\nCtrl+C to stop\n"
    # Build shared first
    bun run --cwd packages/shared build 2>/dev/null || true
    # Run both in parallel using bun's concurrently
    bun run --cwd apps/api dev &
    bun run --cwd apps/dashboard dev &
    wait
    ;;
esac
