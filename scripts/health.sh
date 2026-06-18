#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# scripts/health.sh
# Check all services are reachable and configured correctly.
# Usage: ./scripts/health.sh [--prod]
# ─────────────────────────────────────────────────────────────
set -e

GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
RESET="\033[0m"
BOLD="\033[1m"

ok()   { echo -e "  ${GREEN}✓${RESET} $1"; }
fail() { echo -e "  ${RED}✗${RESET} $1"; FAILED=true; }
warn() { echo -e "  ${YELLOW}⚠${RESET} $1"; }

FAILED=false
IS_PROD=false
[[ "$1" == "--prod" ]] && IS_PROD=true

echo -e "${BOLD}Wavi — Health Check${RESET}"
echo -e "Mode: ${IS_PROD:+Production}${IS_PROD:-Local}\n"

# ── Load env ──────────────────────────────────────────────────
[[ -f apps/api/.env ]] || { echo "apps/api/.env not found"; exit 1; }
export $(grep -v '^#' apps/api/.env | xargs 2>/dev/null)

# ── API health ────────────────────────────────────────────────
echo -e "${CYAN}API Server${RESET}"
API_URL=${IS_PROD:+"https://$(railway domain 2>/dev/null || echo 'unknown')"}
API_URL=${API_URL:-"http://localhost:3000"}

HEALTH=$(curl -s --max-time 5 "${API_URL}/health" 2>/dev/null)
if echo "$HEALTH" | grep -q '"ok":true'; then
  ok "API responding at $API_URL"
else
  fail "API not responding at $API_URL"
fi

# ── Supabase ──────────────────────────────────────────────────
echo -e "\n${CYAN}Supabase${RESET}"
if [[ -z "$SUPABASE_URL" ]]; then
  fail "SUPABASE_URL not set"
else
  SB_RESP=$(curl -s --max-time 5 \
    "${SUPABASE_URL}/rest/v1/groups?select=id&limit=1" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" 2>/dev/null)

  if echo "$SB_RESP" | grep -qE '^\['; then
    ok "Supabase reachable"
    GROUP_COUNT=$(echo "$SB_RESP" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "?")
    ok "Groups table accessible"
  else
    fail "Supabase not reachable or schema not applied"
    warn "Run ./scripts/db-setup.sh to apply schema"
  fi
fi

# ── Redis ─────────────────────────────────────────────────────
echo -e "\n${CYAN}Upstash Redis${RESET}"
if [[ -z "$UPSTASH_REDIS_REST_URL" ]]; then
  fail "UPSTASH_REDIS_REST_URL not set"
else
  REDIS_RESP=$(curl -s --max-time 5 \
    "${UPSTASH_REDIS_REST_URL}/ping" \
    -H "Authorization: Bearer ${UPSTASH_REDIS_REST_TOKEN}" 2>/dev/null)

  if echo "$REDIS_RESP" | grep -q "PONG"; then
    ok "Redis reachable"
  else
    fail "Redis not responding"
  fi
fi

# ── Anthropic API ─────────────────────────────────────────────
echo -e "\n${CYAN}Anthropic API${RESET}"
if [[ -z "$ANTHROPIC_API_KEY" ]]; then
  fail "ANTHROPIC_API_KEY not set"
else
  ANT_RESP=$(curl -s --max-time 10 \
    "https://api.anthropic.com/v1/models" \
    -H "x-api-key: ${ANTHROPIC_API_KEY}" \
    -H "anthropic-version: 2023-06-01" 2>/dev/null)

  if echo "$ANT_RESP" | grep -q '"data"'; then
    ok "Anthropic API key valid"
  else
    fail "Anthropic API key invalid or unreachable"
  fi
fi

# ── OpenAI API ────────────────────────────────────────────────
echo -e "\n${CYAN}OpenAI API${RESET}"
if [[ -z "$OPENAI_API_KEY" ]]; then
  fail "OPENAI_API_KEY not set"
else
  OAI_RESP=$(curl -s --max-time 10 \
    "https://api.openai.com/v1/models/text-embedding-3-small" \
    -H "Authorization: Bearer ${OPENAI_API_KEY}" 2>/dev/null)

  if echo "$OAI_RESP" | grep -q '"id"'; then
    ok "OpenAI API key valid"
    ok "text-embedding-3-small available"
  else
    fail "OpenAI API key invalid or unreachable"
  fi
fi

# ── WhatsApp ──────────────────────────────────────────────────
echo -e "\n${CYAN}WhatsApp${RESET}"
WA_STATUS=$(curl -s --max-time 5 "${API_URL}/api/agent/status" 2>/dev/null)
if echo "$WA_STATUS" | grep -q '"connected":true'; then
  PHONE=$(echo "$WA_STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('phone_number',''))" 2>/dev/null)
  ok "WhatsApp connected (phone: +${PHONE})"
else
  warn "WhatsApp not connected — go to dashboard → WhatsApp to scan QR"
fi

# ── Summary ───────────────────────────────────────────────────
echo ""
if [[ "$FAILED" == true ]]; then
  echo -e "${RED}${BOLD}Some checks failed. See above for details.${RESET}\n"
  exit 1
else
  echo -e "${GREEN}${BOLD}All systems healthy ✓${RESET}\n"
fi
