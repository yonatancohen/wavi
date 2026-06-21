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

# Always resolve API URL from Railway / last deploy — never rely on local /api for prod builds.
API_BASE="$(resolve_api_base_url "$ROOT")"
[[ -z "$API_BASE" ]] && API_BASE="$(refresh_deploy_api_url "$ROOT" || true)"
[[ -n "$API_BASE" ]] && export SYNC_VITE_API_URL="${API_BASE}/api"
[[ -n "${SYNC_VITE_API_URL:-}" ]] && ok "API URL for dashboard: $SYNC_VITE_API_URL"

step "Syncing secrets to Vercel"
SYNC_VITE_API_URL="${SYNC_VITE_API_URL:-}" bash "$ROOT/scripts/sync-secrets.sh" dashboard

[[ "$ENV_ONLY" == true ]] && { ok "Secrets synced"; exit 0; }

step "Preparing build environment"
prepare_dashboard_vite_env "$ROOT" || error "Could not resolve VITE_* vars for build"
ok "Build will use VITE_API_URL=$VITE_API_URL"

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

if [[ "$IS_PROD" == true ]]; then
  ALIAS="$(save_dashboard_alias "$ROOT" "$URL" || true)"
  [[ -n "$ALIAS" ]] && ok "Production alias: $ALIAS"

  if [[ -x "$(command -v railway)" ]]; then
    step "Syncing DASHBOARD_URL to Railway for CORS"
    load_env_file "$ROOT/apps/api/.env" 2>/dev/null || true
    DASHBOARD_ORIGIN="$(resolve_dashboard_url "$ROOT")"
    if [[ -n "$DASHBOARD_ORIGIN" ]]; then
      (
        cd "$ROOT/apps/api"
        railway variable set "DASHBOARD_URL=${DASHBOARD_ORIGIN}" >/dev/null 2>&1 \
          && ok "DASHBOARD_URL → $DASHBOARD_ORIGIN" \
          || warn "Could not set DASHBOARD_URL on Railway"
      )
    else
      warn "DASHBOARD_URL not resolved — set it in apps/api/.env (e.g. https://wavi-fawn.vercel.app)"
    fi
  fi
fi

echo ""
