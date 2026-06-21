#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# scripts/sync-secrets.sh
# Push local .env values to Railway (API) and Vercel (dashboard).
# Dev and prod share the same Supabase + Redis for now — same secrets everywhere.
#
# Usage:
#   ./scripts/sync-secrets.sh           # sync both
#   ./scripts/sync-secrets.sh api       # Railway only
#   ./scripts/sync-secrets.sh dashboard # Vercel only
# ─────────────────────────────────────────────────────────────
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib/env.sh"

GREEN="\033[0;32m"; YELLOW="\033[0;33m"; RED="\033[0;31m"; CYAN="\033[0;36m"; RESET="\033[0m"; BOLD="\033[1m"
TARGET="${1:-all}"

RAILWAY_FAILS=0
VERCEL_FAILS=0

ok()   { echo -e "${GREEN}✓${RESET} $1"; }
warn() { echo -e "${YELLOW}⚠${RESET} $1"; }
fail() { echo -e "${RED}✗${RESET} $1"; exit 1; }

export PATH="$HOME/.bun/bin:$PATH"

ensure_railway_service() {
  cd "$ROOT/apps/api"
  railway status &>/dev/null || fail "No Railway project linked. Run: cd apps/api && railway init --name wavi-api"

  if railway status 2>&1 | grep -q "Service:         None"; then
    local svc
    svc=$(railway service list 2>/dev/null | awk 'NF && $1 != "Services" && $1 != "in" && $1 != "wavi-api:" { print $1; exit }')
    svc=${svc:-wavi-api}
    warn "No service linked — linking to: $svc"
    railway service link "$svc" 2>&1 || fail "Could not link service. Run: cd apps/api && railway service link wavi-api"
    ok "Linked service: $svc"
  fi
}

set_railway_var() {
  local key="$1"
  local value="${!key}"
  local err

  if [[ -z "$value" ]]; then
    warn "skipped (empty): $key"
    return
  fi

  if err=$(printf '%s' "$value" | railway variable set "$key" --stdin --skip-deploys 2>&1); then
    ok "$key"
  else
    warn "failed: $key"
    [[ -n "$err" ]] && echo -e "    ${RED}${err}${RESET}"
    RAILWAY_FAILS=$((RAILWAY_FAILS + 1))
  fi
}

set_railway_literal() {
  local pair="$1"
  local key="${pair%%=*}"
  local err

  if err=$(railway variable set "$pair" --skip-deploys 2>&1); then
    ok "$key"
  else
    warn "failed: $key"
    [[ -n "$err" ]] && echo -e "    ${RED}${err}${RESET}"
    RAILWAY_FAILS=$((RAILWAY_FAILS + 1))
  fi
}

sync_railway() {
  echo -e "\n${CYAN}${BOLD}Railway (API secrets)${RESET}"
  require_env_file "$ROOT/apps/api/.env" "API env" || exit 1
  load_env_file "$ROOT/apps/api/.env"

  command -v railway &>/dev/null || fail "Railway CLI not installed. Run: bun add -g @railway/cli"
  railway whoami &>/dev/null || fail "Not logged in to Railway. Run: railway login"

  ensure_railway_service

  set_railway_var SUPABASE_URL
  set_railway_var SUPABASE_SERVICE_ROLE_KEY
  set_railway_var ANTHROPIC_API_KEY
  set_railway_var OPENAI_API_KEY
  set_railway_var UPSTASH_REDIS_REST_URL
  set_railway_var UPSTASH_REDIS_REST_TOKEN
  set_railway_var WA_AGENT_NAME
  set_railway_var AGENT_ID
  set_railway_var TWILIO_ACCOUNT_SID
  set_railway_var TWILIO_AUTH_TOKEN
  set_railway_var TWILIO_WHATSAPP_NUMBER

  resolved_dashboard="$(resolve_dashboard_url "$ROOT")"
  if [[ -n "$resolved_dashboard" ]]; then
    export DASHBOARD_URL="$resolved_dashboard"
    if err=$(railway variable set "DASHBOARD_URL=${DASHBOARD_URL}" 2>&1); then
      ok "DASHBOARD_URL → $DASHBOARD_URL"
    else
      warn "failed: DASHBOARD_URL"
      [[ -n "$err" ]] && echo -e "    ${RED}${err}${RESET}"
      RAILWAY_FAILS=$((RAILWAY_FAILS + 1))
    fi
  else
    warn "skipped DASHBOARD_URL — set production URL in apps/api/.env or run deploy:dashboard:prod first"
  fi

  set_railway_literal "PORT=3000"
  set_railway_literal "NODE_ENV=production"
  set_railway_literal "WA_SESSION_PATH=/data/.wwebjs_auth"
  set_railway_literal "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true"
  set_railway_literal "PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium"
  set_railway_literal "WA_PROTOCOL_TIMEOUT_MS=300000"

  cd "$ROOT"

  if [[ "$RAILWAY_FAILS" -gt 0 ]]; then
    fail "$RAILWAY_FAILS Railway variable(s) failed — nothing was fully synced. Fix errors above and retry."
  fi

  ok "Railway secrets synced"
}

sync_vercel() {
  echo -e "\n${CYAN}${BOLD}Vercel (dashboard secrets)${RESET}"
  require_env_file "$ROOT/apps/dashboard/.env" "Dashboard env" || exit 1

  if ! prepare_dashboard_vite_env "$ROOT"; then
    fail "Could not resolve dashboard VITE_* vars — deploy API first"
  fi
  ok "VITE_API_URL → $VITE_API_URL"

  command -v vercel &>/dev/null || fail "Vercel CLI not installed. Run: bun add -g vercel"
  vercel whoami &>/dev/null || fail "Not logged in to Vercel. Run: vercel login"

  cd "$ROOT"
  vercel link --yes 2>/dev/null || true

  push_vercel_env() {
    local key="$1"
    local value="${!key}"
    local env="${2:-production}"
    local err

    [[ -z "$value" ]] && { warn "skipped (empty): $key"; return; }

    if err=$(printf '%s' "$value" | vercel env update "$key" "$env" --yes 2>&1); then
      ok "$key ($env)"
    elif err=$(printf '%s' "$value" | vercel env add "$key" "$env" --yes 2>&1); then
      ok "$key ($env, added)"
    else
      warn "failed: $key ($env)"
      [[ -n "$err" ]] && echo -e "    ${RED}${err}${RESET}"
      VERCEL_FAILS=$((VERCEL_FAILS + 1))
    fi
  }

  push_vercel_env VITE_API_URL production
  push_vercel_env VITE_SUPABASE_URL production
  push_vercel_env VITE_SUPABASE_ANON_KEY production
  push_vercel_env VITE_API_URL preview
  push_vercel_env VITE_SUPABASE_URL preview
  push_vercel_env VITE_SUPABASE_ANON_KEY preview

  cd "$ROOT"

  if [[ "$VERCEL_FAILS" -gt 0 ]]; then
    fail "$VERCEL_FAILS Vercel variable(s) failed — fix errors above and retry."
  fi

  step_verify="Verifying Vercel env"
  echo -e "\n${CYAN}${step_verify}${RESET}"
  if verify_vercel_env "$ROOT" production; then
    ok "Vercel production env verified"
  else
    fail "Vercel production env verification failed — VITE_* vars are empty on Vercel"
  fi

  ok "Vercel secrets synced"
}

echo -e "${BOLD}Wavi — Sync secrets to production${RESET}"
echo -e "${YELLOW}Using local .env files as source of truth (same DB/Redis for dev + prod).${RESET}\n"

case "$TARGET" in
  api) sync_railway ;;
  dashboard) sync_vercel ;;
  all) sync_railway; sync_vercel ;;
  *) fail "Unknown target: $TARGET (use api | dashboard | all)" ;;
esac

echo -e "\n${GREEN}${BOLD}Done.${RESET} Verify Railway: ${BOLD}cd apps/api && railway variable list --kv${RESET}\n"
