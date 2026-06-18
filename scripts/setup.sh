#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# scripts/setup.sh — First-time project bootstrap
# Usage: ./scripts/setup.sh
# ─────────────────────────────────────────────────────────────
set -e

BOLD="\033[1m"; GREEN="\033[0;32m"; YELLOW="\033[0;33m"
RED="\033[0;31m"; CYAN="\033[0;36m"; RESET="\033[0m"

step()  { echo -e "\n${CYAN}▶ $1${RESET}"; }
ok()    { echo -e "${GREEN}✓ $1${RESET}"; }
warn()  { echo -e "${YELLOW}⚠ $1${RESET}"; }
error() { echo -e "${RED}✗ $1${RESET}"; exit 1; }

echo -e "${BOLD}  Wavi — Setup${RESET}\n"

# ── Check Bun ─────────────────────────────────────────────────
step "Checking prerequisites"
if ! command -v bun &>/dev/null; then
  warn "Bun not found — installing..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi
ok "Bun $(bun --version)"

if ! command -v git &>/dev/null; then error "git not found"; fi
ok "git $(git --version | awk '{print $3}')"

# ── Install dependencies ──────────────────────────────────────
step "Installing dependencies"
bun install
ok "Dependencies installed"

# ── Copy env files ────────────────────────────────────────────
step "Setting up environment files"
[[ ! -f apps/api/.env ]]       && cp apps/api/.env.example apps/api/.env       && warn "Created apps/api/.env — fill in credentials" || ok "apps/api/.env exists"
[[ ! -f apps/dashboard/.env ]] && cp apps/dashboard/.env.example apps/dashboard/.env && warn "Created apps/dashboard/.env — fill in credentials" || ok "apps/dashboard/.env exists"

# ── Build shared ──────────────────────────────────────────────
step "Building shared package"
bun run --cwd packages/shared build
ok "Shared types built"

# ── Optional CLI tools ────────────────────────────────────────
step "Checking optional CLI tools"
command -v vercel &>/dev/null && ok "Vercel CLI $(vercel --version 2>/dev/null | head -1)" || warn "Vercel CLI not installed — run: bun add -g vercel"
command -v railway &>/dev/null && ok "Railway CLI" || warn "Railway CLI not installed — run: bun add -g @railway/cli"

echo -e "\n${GREEN}${BOLD}Setup complete!${RESET}"
echo -e "\n  1. Fill in ${BOLD}apps/api/.env${RESET}"
echo -e "  2. Fill in ${BOLD}apps/dashboard/.env${RESET}"
echo -e "  3. Run ${BOLD}./scripts/db-setup.sh${RESET}"
echo -e "  4. Run ${BOLD}./scripts/dev.sh${RESET}\n"
