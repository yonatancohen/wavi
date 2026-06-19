#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# scripts/deploy.sh
# Full production deploy: sync secrets → API (Railway) → Dashboard (Vercel)
# Usage:
#   ./scripts/deploy.sh           → preview dashboard + deploy api
#   ./scripts/deploy.sh --prod    → production for both
# ─────────────────────────────────────────────────────────────
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GREEN="\033[0;32m"; YELLOW="\033[0;33m"; CYAN="\033[0;36m"; RESET="\033[0m"; BOLD="\033[1m"

IS_PROD=false
if [[ "$1" == "--prod" ]] || [[ "$1" == "-p" ]]; then IS_PROD=true; fi

echo -e "${BOLD}Wavi — Full Deploy${RESET}"
echo -e "Mode: ${IS_PROD:+${GREEN}Production${RESET}}${IS_PROD:-${YELLOW}Preview${RESET}}"
echo -e "${YELLOW}Dev and prod share the same Supabase + Redis (from your local .env).${RESET}\n"

if [[ "$IS_PROD" == true ]]; then
  echo -e "${YELLOW}${BOLD}Production deploy — continue? (y/N)${RESET}"
  read -r confirm
  [[ "$confirm" == "y" ]] || { echo "Cancelled."; exit 0; }
fi

echo -e "\n${CYAN}═══ 1/2 API → Railway ═══${RESET}"
bash "$ROOT/scripts/preflight-deploy.sh"
bash "$ROOT/scripts/deploy-api.sh"

echo -e "\n${CYAN}═══ 2/2 Dashboard → Vercel ═══${RESET}"
if [[ "$IS_PROD" == true ]]; then
  bash "$ROOT/scripts/deploy-dashboard.sh" --prod
else
  bash "$ROOT/scripts/deploy-dashboard.sh"
fi

echo -e "\n${GREEN}${BOLD}Deploy complete!${RESET}"
[[ -f "$ROOT/.deploy-api-url" ]] && echo -e "  API:       $(cat "$ROOT/.deploy-api-url")"
[[ -f "$ROOT/.deploy-dashboard-url" ]] && echo -e "  Dashboard: $(cat "$ROOT/.deploy-dashboard-url")"
echo -e "\n  Next: open dashboard → WhatsApp → scan QR to connect production agent.\n"
