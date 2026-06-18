#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# scripts/deploy.sh
# Deploy both API (Railway) and Dashboard (Vercel) together.
# Usage:
#   ./scripts/deploy.sh           → preview dashboard + deploy api
#   ./scripts/deploy.sh --prod    → production for both
# ─────────────────────────────────────────────────────────────
set -e

GREEN="\033[0;32m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
RESET="\033[0m"
BOLD="\033[1m"

IS_PROD=false
if [[ "$1" == "--prod" ]] || [[ "$1" == "-p" ]]; then IS_PROD=true; fi

echo -e "${BOLD}Wavi — Full Deploy${RESET}"
echo -e "Mode: ${IS_PROD:+${GREEN}Production${RESET}}${IS_PROD:-${YELLOW}Preview${RESET}}\n"

if [[ "$IS_PROD" == true ]]; then
  echo -e "${YELLOW}${BOLD}Production deploy — this affects real users. Continue? (y/N)${RESET}"
  read -r confirm
  [[ "$confirm" == "y" ]] || { echo "Cancelled."; exit 0; }
fi

# ── Deploy API ────────────────────────────────────────────────
echo -e "\n${CYAN}═══ Deploying API → Railway ═══${RESET}"
bash scripts/deploy-api.sh
echo ""

# ── Deploy Dashboard ──────────────────────────────────────────
echo -e "\n${CYAN}═══ Deploying Dashboard → Vercel ═══${RESET}"
if [[ "$IS_PROD" == true ]]; then
  bash scripts/deploy-dashboard.sh --prod
else
  bash scripts/deploy-dashboard.sh
fi

echo -e "\n${GREEN}${BOLD}Full deploy complete!${RESET}\n"
