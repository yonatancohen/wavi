#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# scripts/db-reset.sh
# ⚠ DESTRUCTIVE — drops all Wavi tables and re-applies schema.
# Dev use only. Never run against production data.
# Usage: ./scripts/db-reset.sh
# ─────────────────────────────────────────────────────────────
set -e

RED="\033[0;31m"
YELLOW="\033[0;33m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
RESET="\033[0m"
BOLD="\033[1m"

error() { echo -e "${RED}✗ $1${RESET}"; exit 1; }
ok()    { echo -e "${GREEN}✓ $1${RESET}"; }
step()  { echo -e "\n${CYAN}▶ $1${RESET}"; }

echo -e "${RED}${BOLD}⚠  DATABASE RESET${RESET}"
echo -e "This will ${RED}DELETE ALL DATA${RESET} in the Wavi tables.\n"
echo -e "Type ${BOLD}reset${RESET} to confirm: "
read -r confirm

if [[ "$confirm" != "reset" ]]; then
  echo "Cancelled."
  exit 0
fi

# ── Load env ──────────────────────────────────────────────────
[[ -f apps/api/.env ]] || error "apps/api/.env not found"
export $(grep -v '^#' apps/api/.env | xargs)
[[ -n "$SUPABASE_URL" ]] || error "SUPABASE_URL not set"
[[ -n "$SUPABASE_SERVICE_ROLE_KEY" ]] || error "SUPABASE_SERVICE_ROLE_KEY not set"

# ── Drop tables ───────────────────────────────────────────────
step "Dropping all Wavi tables"

DROP_SQL=$(cat <<'SQL'
DROP TABLE IF EXISTS replies           CASCADE;
DROP TABLE IF EXISTS group_memories    CASCADE;
DROP TABLE IF EXISTS group_contexts    CASCADE;
DROP TABLE IF EXISTS relationship_map  CASCADE;
DROP TABLE IF EXISTS user_profiles     CASCADE;
DROP TABLE IF EXISTS episode_summaries CASCADE;
DROP TABLE IF EXISTS message_chunks    CASCADE;
DROP TABLE IF EXISTS messages          CASCADE;
DROP TABLE IF EXISTS groups            CASCADE;
DROP TABLE IF EXISTS agents            CASCADE;
DROP TABLE IF EXISTS owners            CASCADE;
DROP FUNCTION IF EXISTS search_message_chunks;
DROP FUNCTION IF EXISTS search_episode_summaries;
SQL
)

# Use psql if available, else warn
if command -v psql &>/dev/null && [[ -n "$SUPABASE_DB_PASSWORD" ]]; then
  PROJECT_REF=$(echo "$SUPABASE_URL" | sed 's|https://||' | cut -d'.' -f1)
  DB_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.${PROJECT_REF}.supabase.co:5432/postgres"
  echo "$DROP_SQL" | psql "$DB_URL"
  ok "Tables dropped"

  step "Re-applying schema"
  psql "$DB_URL" -f supabase-schema.sql
  ok "Schema applied"
else
  echo -e "${YELLOW}psql not available. Run this SQL in Supabase SQL Editor:${RESET}\n"
  echo "$DROP_SQL"
  echo ""
  echo -e "Then run: ${BOLD}./scripts/db-setup.sh${RESET}"
  exit 0
fi

# ── Re-seed agent ─────────────────────────────────────────────
step "Re-seeding initial data"
bash scripts/db-setup.sh

echo -e "\n${GREEN}${BOLD}Database reset complete.${RESET}\n"
