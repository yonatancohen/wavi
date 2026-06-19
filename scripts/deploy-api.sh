#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# scripts/deploy-api.sh — Deploy API to Railway (monorepo root)
# Usage:
#   ./scripts/deploy-api.sh           # deploy
#   ./scripts/deploy-api.sh --env     # sync secrets only
# ─────────────────────────────────────────────────────────────
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib/env.sh"

GREEN="\033[0;32m"; YELLOW="\033[0;33m"; RED="\033[0;31m"; CYAN="\033[0;36m"; RESET="\033[0m"; BOLD="\033[1m"
ENV_ONLY=false
[[ "$1" == "--env" ]] && ENV_ONLY=true

step()  { echo -e "\n${CYAN}▶ $1${RESET}"; }
ok()    { echo -e "${GREEN}✓ $1${RESET}"; }
warn()  { echo -e "${YELLOW}⚠ $1${RESET}"; }
error() { echo -e "${RED}✗ $1${RESET}"; exit 1; }

export PATH="$HOME/.bun/bin:$PATH"

link_railway_at_root() {
  cd "$ROOT/apps/api"
  railway status &>/dev/null || error "Initialize Railway first: cd apps/api && railway init --name wavi-api"

  local project_id
  project_id=$(railway status --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null) \
    || error "Could not read Railway project id"

  cd "$ROOT"
  if ! railway status &>/dev/null; then
    warn "Linking Railway at repo root (required for monorepo Docker build)..."
    railway link -p "$project_id" -s wavi-api --environment production
  fi

  if railway status 2>&1 | grep -q "Service:         None"; then
    railway service link wavi-api
  fi

  ok "Railway linked at repo root → wavi-api"
}

echo -e "${BOLD}Wavi — Deploy API to Railway${RESET}\n"

command -v railway &>/dev/null || bun add -g @railway/cli
railway whoami &>/dev/null || error "Run: railway login"
ok "Railway: $(railway whoami 2>/dev/null)"

require_env_file "$ROOT/apps/api/.env" "API env" || error "Create apps/api/.env from .env.example"
load_env_file "$ROOT/apps/api/.env"

[[ -z "$AGENT_ID" ]] && warn "AGENT_ID is empty — run ./scripts/db-setup.sh first"

step "Syncing secrets to Railway"
bash "$ROOT/scripts/sync-secrets.sh" api

[[ "$ENV_ONLY" == true ]] && { ok "Secrets synced"; exit 0; }

link_railway_at_root

step "Type checking"
bun run --cwd "$ROOT/apps/api" typecheck || { warn "Type errors — continue? (y/N)"; read -r a; [[ "$a" == "y" ]] || exit 1; }

step "Deploying to Railway (monorepo root + Dockerfile)"
cd "$ROOT"
railway up --detach
ok "Deploy triggered"

cd "$ROOT/apps/api"
DOMAIN=$(railway domain 2>/dev/null | grep -Eo '[^[:space:]]+\.(railway\.app|up\.railway\.app)' | head -1 || true)
if [[ -z "$DOMAIN" ]]; then
  DOMAIN=$(railway domain 2>/dev/null | grep -Eo 'https?://[^[:space:]]+' | head -1 | sed 's|^https://||;s|/.*$||')
fi
if [[ -n "$DOMAIN" ]]; then
  ok "API URL: https://${DOMAIN}"
  echo "https://${DOMAIN}" > "$ROOT/.deploy-api-url"
else
  warn "No public domain yet — run: cd apps/api && railway domain"
fi

echo -e "\n${CYAN}Recent logs:${RESET}\n"
railway logs --tail 30 2>/dev/null || true
echo -e "\n${GREEN}${BOLD}API deployed!${RESET}"
echo -e "Attach a ${BOLD}Volume${RESET} at ${BOLD}/data${RESET} in Railway so WhatsApp session survives redeploys.\n"
