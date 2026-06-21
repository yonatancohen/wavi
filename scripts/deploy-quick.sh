#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# scripts/deploy-quick.sh
# Deploy without syncing secrets (assumes Railway + Vercel already have up-to-date env vars)
# Usage:
#   ./scripts/deploy-quick.sh           → preview dashboard + deploy api
#   ./scripts/deploy-quick.sh --prod    → production for both
#   ./scripts/deploy-quick.sh --api     → api only
#   ./scripts/deploy-quick.sh --dash    → dashboard only
# ─────────────────────────────────────────────────────────────
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib/env.sh"

GREEN="\033[0;32m"; YELLOW="\033[0;33m"; RED="\033[0;31m"; CYAN="\033[0;36m"; RESET="\033[0m"; BOLD="\033[1m"

IS_PROD=false
API_ONLY=false
DASH_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --prod|-p) IS_PROD=true ;;
    --api)     API_ONLY=true ;;
    --dash)    DASH_ONLY=true ;;
  esac
done

step()  { echo -e "\n${CYAN}▶ $1${RESET}"; }
ok()    { echo -e "${GREEN}✓ $1${RESET}"; }
warn()  { echo -e "${YELLOW}⚠ $1${RESET}"; }
error() { echo -e "${RED}✗ $1${RESET}"; exit 1; }

export PATH="$HOME/.bun/bin:$PATH"

echo -e "${BOLD}Wavi — Quick Deploy (no secrets sync)${RESET}"
echo -e "Mode: ${IS_PROD:+${GREEN}Production${RESET}}${IS_PROD:-${YELLOW}Preview${RESET}}\n"

if [[ "$IS_PROD" == true ]]; then
  echo -e "${YELLOW}${BOLD}Production deploy — continue? (y/N)${RESET}"
  read -r confirm
  [[ "$confirm" == "y" ]] || { echo "Cancelled."; exit 0; }
fi

# ── API → Railway ─────────────────────────────────────────────
deploy_api() {
  echo -e "\n${CYAN}═══ API → Railway ═══${RESET}"

  command -v railway &>/dev/null || bun add -g @railway/cli
  railway whoami &>/dev/null || error "Run: railway login"
  ok "Railway: $(railway whoami 2>/dev/null)"

  require_env_file "$ROOT/apps/api/.env" "API env" || error "Create apps/api/.env from .env.example"

  # Ensure Railway linked at repo root
  cd "$ROOT/apps/api"
  railway status &>/dev/null || error "Initialize Railway first: cd apps/api && railway init --name wavi-api"

  local project_id
  project_id=$(railway status --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null) \
    || error "Could not read Railway project id"

  cd "$ROOT"
  if ! railway status &>/dev/null; then
    warn "Linking Railway at repo root..."
    railway link -p "$project_id" -s wavi-api --environment production
  fi
  if railway status 2>&1 | grep -q "Service:         None"; then
    railway service link wavi-api
  fi
  ok "Railway linked at repo root → wavi-api"

  step "Type checking"
  bun run --cwd "$ROOT/apps/api" typecheck || { warn "Type errors — continue? (y/N)"; read -r a; [[ "$a" == "y" ]] || exit 1; }

  step "Deploying to Railway"
  cd "$ROOT"
  railway up --detach
  ok "Deploy triggered"

  API_URL="$(refresh_deploy_api_url "$ROOT" || true)"
  if [[ -n "$API_URL" ]]; then
    ok "API URL: $API_URL"
  else
    warn "No public domain yet — run: cd apps/api && railway domain"
  fi

  echo -e "\n${CYAN}Recent logs:${RESET}\n"
  railway logs --tail 20 2>/dev/null || true
  echo -e "\n${GREEN}${BOLD}API deployed!${RESET}\n"
}

# ── Dashboard → Vercel ────────────────────────────────────────
deploy_dashboard() {
  echo -e "\n${CYAN}═══ Dashboard → Vercel ═══${RESET}"

  command -v vercel &>/dev/null || bun add -g vercel
  vercel whoami &>/dev/null || error "Run: vercel login"
  ok "Vercel: $(vercel whoami 2>/dev/null)"

  require_env_file "$ROOT/apps/dashboard/.env" "Dashboard env" || error "Create apps/dashboard/.env from .env.example"

  # Resolve API URL (no sync — just read from Railway / saved file)
  API_BASE="$(resolve_api_base_url "$ROOT")"
  [[ -z "$API_BASE" ]] && API_BASE="$(refresh_deploy_api_url "$ROOT" || true)"
  [[ -n "$API_BASE" ]] && export VITE_API_URL="${API_BASE}/api" && ok "API URL for build: $VITE_API_URL"

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

  step "Deploying to Vercel"
  cd "$ROOT"
  vercel link --yes 2>/dev/null || true

  local DEPLOY_OUT URL
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
        warn "DASHBOARD_URL not resolved — set it in apps/api/.env"
      fi
    fi
  fi
}

# ── Run ───────────────────────────────────────────────────────
if [[ "$DASH_ONLY" == true ]]; then
  deploy_dashboard
elif [[ "$API_ONLY" == true ]]; then
  deploy_api
else
  deploy_api
  deploy_dashboard
fi

echo -e "\n${GREEN}${BOLD}Done!${RESET}"
[[ -f "$ROOT/.deploy-api-url" ]] && echo -e "  API:       $(cat "$ROOT/.deploy-api-url")"
[[ -f "$ROOT/.deploy-dashboard-url" ]] && echo -e "  Dashboard: $(cat "$ROOT/.deploy-dashboard-url")"
echo ""
