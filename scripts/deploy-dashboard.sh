#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# scripts/deploy-dashboard.sh — Deploy dashboard to Vercel
# Usage: ./scripts/deploy-dashboard.sh [--prod]
# ─────────────────────────────────────────────────────────────
set -e

GREEN="\033[0;32m"; YELLOW="\033[0;33m"
RED="\033[0;31m"; CYAN="\033[0;36m"; RESET="\033[0m"; BOLD="\033[1m"

step()  { echo -e "\n${CYAN}▶ $1${RESET}"; }
ok()    { echo -e "${GREEN}✓ $1${RESET}"; }
warn()  { echo -e "${YELLOW}⚠ $1${RESET}"; }
error() { echo -e "${RED}✗ $1${RESET}"; exit 1; }

export PATH="$HOME/.bun/bin:$PATH"
IS_PROD=false
[[ "$1" == "--prod" ]] || [[ "$1" == "-p" ]] && IS_PROD=true

echo -e "${BOLD}Wavi — Deploy Dashboard${RESET}"
echo -e "Target: ${IS_PROD:+${GREEN}Production${RESET}}${IS_PROD:-${YELLOW}Preview${RESET}}\n"

! command -v vercel &>/dev/null && bun add -g vercel
ok "Vercel CLI ready"

[[ ! -f apps/dashboard/.env ]] && error "apps/dashboard/.env not found"
export $(grep -v '^#' apps/dashboard/.env | xargs)

step "Building shared"
bun run --cwd packages/shared build
ok "Shared built"

step "Type checking"
bun run --cwd apps/dashboard typecheck || { warn "Type errors — continue? (y/N)"; read -r a; [[ "$a" == "y" ]] || exit 1; }

step "Building dashboard"
bun run --cwd apps/dashboard build
ok "Build complete"

step "Deploying to Vercel"
cd apps/dashboard
ARGS="--yes"
[[ -n "$VITE_API_URL" ]]           && ARGS="$ARGS -e VITE_API_URL=$VITE_API_URL"
[[ -n "$VITE_SUPABASE_URL" ]]      && ARGS="$ARGS -e VITE_SUPABASE_URL=$VITE_SUPABASE_URL"
[[ -n "$VITE_SUPABASE_ANON_KEY" ]] && ARGS="$ARGS -e VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY"

if [[ "$IS_PROD" == true ]]; then
  echo -e "\n${YELLOW}Deploy to PRODUCTION — confirm? (y/N)${RESET}"; read -r c; [[ "$c" == "y" ]] || exit 0
  URL=$(vercel deploy --prod $ARGS 2>&1 | tail -1)
else
  URL=$(vercel deploy $ARGS 2>&1 | tail -1)
fi
cd ../..

ok "Deployed: $URL"
echo ""
