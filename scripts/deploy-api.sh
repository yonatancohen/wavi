#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# scripts/deploy-api.sh — Deploy API to Railway
# Usage: ./scripts/deploy-api.sh [--env]
# ─────────────────────────────────────────────────────────────
set -e

GREEN="\033[0;32m"; YELLOW="\033[0;33m"
RED="\033[0;31m"; CYAN="\033[0;36m"; RESET="\033[0m"; BOLD="\033[1m"

step()  { echo -e "\n${CYAN}▶ $1${RESET}"; }
ok()    { echo -e "${GREEN}✓ $1${RESET}"; }
warn()  { echo -e "${YELLOW}⚠ $1${RESET}"; }
error() { echo -e "${RED}✗ $1${RESET}"; exit 1; }

export PATH="$HOME/.bun/bin:$PATH"
ENV_ONLY=false
[[ "$1" == "--env" ]] && ENV_ONLY=true

echo -e "${BOLD}Wavi — Deploy API to Railway${RESET}\n"

! command -v railway &>/dev/null && bun add -g @railway/cli
! railway whoami &>/dev/null && railway login
ok "Logged in: $(railway whoami 2>/dev/null)"

[[ ! -f apps/api/.env ]] && error "apps/api/.env not found"
export $(grep -v '^#' apps/api/.env | xargs)

step "Syncing env vars to Railway"
push_var() { local k=$1; local v="${!k}"; [[ -n "$v" ]] && railway variables set "${k}=${v}" --yes 2>/dev/null && ok "  $k" || true; }
push_var SUPABASE_URL; push_var SUPABASE_SERVICE_ROLE_KEY
push_var ANTHROPIC_API_KEY; push_var OPENAI_API_KEY
push_var UPSTASH_REDIS_REST_URL; push_var UPSTASH_REDIS_REST_TOKEN
push_var WA_AGENT_NAME; push_var AGENT_ID
railway variables set "PORT=3000" --yes 2>/dev/null || true
railway variables set "NODE_ENV=production" --yes 2>/dev/null || true

[[ "$ENV_ONLY" == true ]] && { ok "Env vars synced"; exit 0; }

step "Type checking"
bun run --cwd apps/api typecheck || { warn "Type errors — continue? (y/N)"; read -r a; [[ "$a" == "y" ]] || exit 1; }

step "Deploying to Railway"
railway up --detach
ok "Deploy triggered"

echo -e "\n${CYAN}Tailing logs...${RESET}\n"
railway logs --tail 50 || true
echo -e "\n${GREEN}${BOLD}API deployed!${RESET}\n"
