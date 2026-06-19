#!/usr/bin/env bash
# Validate local env files before deploy. Does not print secret values.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib/env.sh"

GREEN="\033[0;32m"; YELLOW="\033[0;33m"; RED="\033[0;31m"; CYAN="\033[0;36m"; RESET="\033[0m"; BOLD="\033[1m"
FAILED=false

ok()   { echo -e "  ${GREEN}✓${RESET} $1"; }
fail() { echo -e "  ${RED}✗${RESET} $1"; FAILED=true; }
warn() { echo -e "  ${YELLOW}⚠${RESET} $1"; }

require_key() {
  local label="$1"
  local key="$2"
  local value="${!key}"
  if [[ -n "$value" ]]; then
    ok "$label"
  else
    fail "$label is missing ($key)"
  fi
}

echo -e "${BOLD}Wavi — Deploy preflight${RESET}\n"

# ── API env ───────────────────────────────────────────────────
echo -e "${CYAN}API (apps/api/.env)${RESET}"
if [[ ! -f "$ROOT/apps/api/.env" ]]; then
  fail "apps/api/.env not found — copy from apps/api/.env.example"
else
  load_env_file "$ROOT/apps/api/.env"
  require_key "Supabase URL" SUPABASE_URL
  require_key "Supabase service role key" SUPABASE_SERVICE_ROLE_KEY
  require_key "Anthropic API key" ANTHROPIC_API_KEY
  require_key "OpenAI API key" OPENAI_API_KEY
  require_key "Upstash Redis URL" UPSTASH_REDIS_REST_URL
  require_key "Upstash Redis token" UPSTASH_REDIS_REST_TOKEN
  require_key "Agent ID" AGENT_ID
  require_key "Agent name" WA_AGENT_NAME

  if [[ -n "$TWILIO_ACCOUNT_SID" || -n "$TWILIO_AUTH_TOKEN" || -n "$TWILIO_WHATSAPP_NUMBER" ]]; then
    require_key "Twilio account SID" TWILIO_ACCOUNT_SID
    require_key "Twilio auth token" TWILIO_AUTH_TOKEN
    require_key "Twilio WhatsApp number" TWILIO_WHATSAPP_NUMBER
  else
    warn "Twilio not configured (optional — only needed for DM bot path)"
  fi

  [[ -z "$DASHBOARD_URL" ]] && warn "DASHBOARD_URL empty — deploy script sets this after Vercel prod deploy"
fi

# ── Dashboard env ─────────────────────────────────────────────
echo -e "\n${CYAN}Dashboard (apps/dashboard/.env)${RESET}"
if [[ ! -f "$ROOT/apps/dashboard/.env" ]]; then
  fail "apps/dashboard/.env not found — copy from apps/dashboard/.env.example"
else
  load_env_file "$ROOT/apps/dashboard/.env"
  require_key "Supabase URL" VITE_SUPABASE_URL
  require_key "Supabase anon key" VITE_SUPABASE_ANON_KEY

  if [[ "$VITE_API_URL" == http://localhost:* ]]; then
    warn "VITE_API_URL is localhost — OK for dev; deploy:prod will set Railway URL automatically"
  elif [[ -n "$VITE_API_URL" ]]; then
    ok "API URL configured"
  else
    fail "VITE_API_URL is missing"
  fi
fi

# ── CLI tools ─────────────────────────────────────────────────
echo -e "\n${CYAN}CLI tools${RESET}"
export PATH="$HOME/.bun/bin:$PATH"
command -v bun &>/dev/null && ok "bun $(bun --version)" || fail "bun not installed"
command -v railway &>/dev/null && ok "Railway CLI" || warn "Railway CLI missing — run: bun add -g @railway/cli"
command -v vercel &>/dev/null && ok "Vercel CLI" || warn "Vercel CLI missing — run: bun add -g vercel"
railway whoami &>/dev/null && ok "Railway logged in" || warn "Not logged in to Railway — run: railway login"
vercel whoami &>/dev/null && ok "Vercel logged in" || warn "Not logged in to Vercel — run: vercel login"

if [[ -f "$ROOT/apps/api/railway.toml" ]]; then
  if (cd "$ROOT/apps/api" && railway status &>/dev/null); then
    if (cd "$ROOT/apps/api" && railway status 2>&1 | grep -q "Service:         None"); then
      warn "Railway service not linked — sync will auto-link, or run: cd apps/api && railway service link wavi-api"
    else
      ok "Railway project linked (apps/api)"
    fi
  else
    warn "Railway not linked — run: cd apps/api && railway init --name wavi-api"
  fi
fi

# ── Summary ───────────────────────────────────────────────────
echo ""
if [[ "$FAILED" == true ]]; then
  echo -e "${RED}${BOLD}Preflight failed — fix the items above before deploying.${RESET}\n"
  exit 1
fi

echo -e "${GREEN}${BOLD}Preflight passed.${RESET} You can run:${RESET}"
echo -e "  ${BOLD}bun run deploy:prod${RESET}\n"
