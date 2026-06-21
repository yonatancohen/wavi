#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# scripts/deploy-dashboard.sh — Deploy dashboard to Vercel
# Usage:
#   ./scripts/deploy-dashboard.sh [--prod] [--env]
# ─────────────────────────────────────────────────────────────
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib/env.sh"

GREEN="\033[0;32m"; YELLOW="\033[0;33m"; RED="\033[0;31m"; CYAN="\033[0;36m"; RESET="\033[0m"; BOLD="\033[1m"
IS_PROD=false
ENV_ONLY=false
[[ "$1" == "--prod" ]] || [[ "$1" == "-p" ]] || [[ "$2" == "--prod" ]] || [[ "$2" == "-p" ]] && IS_PROD=true
[[ "$1" == "--env" ]] || [[ "$2" == "--env" ]] && ENV_ONLY=true

step()  { echo -e "\n${CYAN}▶ $1${RESET}"; }
ok()    { echo -e "${GREEN}✓ $1${RESET}"; }
warn()  { echo -e "${YELLOW}⚠ $1${RESET}"; }
error() { echo -e "${RED}✗ $1${RESET}"; exit 1; }

export PATH="$HOME/.bun/bin:$PATH"

echo -e "${BOLD}Wavi — Deploy Dashboard${RESET}"
echo -e "Target: ${IS_PROD:+${GREEN}Production${RESET}}${IS_PROD:-${YELLOW}Preview${RESET}}\n"

command -v vercel &>/dev/null || bun add -g vercel
vercel whoami &>/dev/null || error "Run: vercel login"
ok "Vercel: $(vercel whoami 2>/dev/null)"

require_env_file "$ROOT/apps/dashboard/.env" "Dashboard env" || error "Create apps/dashboard/.env from .env.example"
load_env_file "$ROOT/apps/dashboard/.env"

# If API was just deployed, use its public URL for the dashboard build + Vercel sync
if [[ -f "$ROOT/.deploy-api-url" ]]; then
  API_BASE="$(normalize_url "$(cat "$ROOT/.deploy-api-url")")"
  export SYNC_VITE_API_URL="${API_BASE}/api"
  ok "Using API URL from last deploy: $SYNC_VITE_API_URL"
fi

if [[ "$VITE_API_URL" == http://localhost:* ]]; then
  warn "VITE_API_URL still points to localhost — set it to your Railway API URL in apps/dashboard/.env"
fi

step "Syncing secrets to Vercel"
SYNC_VITE_API_URL="${SYNC_VITE_API_URL:-}" bash "$ROOT/scripts/sync-secrets.sh" dashboard

[[ "$ENV_ONLY" == true ]] && { ok "Secrets synced"; exit 0; }

[[ -n "${SYNC_VITE_API_URL:-}" ]] && export VITE_API_URL="$SYNC_VITE_API_URL"

step "Building shared"
bun run --cwd "$ROOT/packages/shared" build
ok "Shared built"

step "Type checking"
bun run --cwd "$ROOT/apps/dashboard" typecheck || { warn "Type errors — continue? (y/N)"; read -r a; [[ "$a" == "y" ]] || exit 1; }

step "Building dashboard"
bun run --cwd "$ROOT/apps/dashboard" build
ok "Build complete"

step "Deploying to Vercel (monorepo root)"
cd "$ROOT"
vercel link --yes 2>/dev/null || true

if [[ "$IS_PROD" == true ]]; then
  echo -e "\n${YELLOW}Deploy to PRODUCTION — confirm? (y/N)${RESET}"
  read -r c
  [[ "$c" == "y" ]] || exit 0
  DEPLOY_OUT=$(vercel deploy --prod --yes 2>&1) || error "Vercel deploy failed"
else
  DEPLOY_OUT=$(vercel deploy --yes 2>&1) || error "Vercel deploy failed"
fi

URL=$(echo "$DEPLOY_OUT" | grep -Eo 'https://[^[:space:]]+\.vercel\.app' | tail -1)
[[ -z "$URL" ]] && URL=$(echo "$DEPLOY_OUT" | grep -Eo 'https://[^[:space:]]+' | tail -1)
[[ -z "$URL" ]] && error "Could not parse deploy URL from Vercel output"

cd "$ROOT"
ok "Deployed: $URL"
echo "$URL" > "$ROOT/.deploy-dashboard-url"

# Wire CORS on API if we know the dashboard URL
if [[ "$IS_PROD" == true && -n "$URL" && -x "$(command -v railway)" ]]; then
  step "Setting DASHBOARD_URL on Railway for CORS"
  cd "$ROOT/apps/api"
  DASHBOARD_ORIGIN="$(normalize_url "$URL")"
  railway variable set "DASHBOARD_URL=${DASHBOARD_ORIGIN}" >/dev/null 2>&1 && ok "DASHBOARD_URL=${DASHBOARD_ORIGIN} (redeploy triggered)" || warn "Could not set DASHBOARD_URL"
  cd "$ROOT"
fi

echo ""
