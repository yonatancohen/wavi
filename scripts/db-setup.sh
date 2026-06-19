#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# scripts/db-setup.sh
# Push schema to Supabase. Requires SUPABASE_URL and
# SUPABASE_SERVICE_ROLE_KEY in apps/api/.env
# Usage: ./scripts/db-setup.sh
# ─────────────────────────────────────────────────────────────
set -e

GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
RESET="\033[0m"
BOLD="\033[1m"

step()  { echo -e "\n${CYAN}▶ $1${RESET}"; }
ok()    { echo -e "${GREEN}✓ $1${RESET}"; }
warn()  { echo -e "${YELLOW}⚠ $1${RESET}"; }
error() { echo -e "${RED}✗ $1${RESET}"; exit 1; }

echo -e "${BOLD}Wavi — Database Setup${RESET}\n"

# ── Load env ──────────────────────────────────────────────────
if [[ ! -f apps/api/.env ]]; then
  error "apps/api/.env not found. Run ./scripts/setup.sh first."
fi

export $(grep -v '^#' apps/api/.env | xargs)

if [[ -z "$SUPABASE_URL" ]]; then
  error "SUPABASE_URL not set in apps/api/.env"
fi
if [[ -z "$SUPABASE_SERVICE_ROLE_KEY" ]]; then
  error "SUPABASE_SERVICE_ROLE_KEY not set in apps/api/.env"
fi

# Extract project ref from URL (https://xxxxx.supabase.co)
PROJECT_REF=$(echo "$SUPABASE_URL" | sed 's|https://||' | cut -d'.' -f1)

step "Target: $SUPABASE_URL"

# ── Check for psql ────────────────────────────────────────────
if command -v psql &>/dev/null; then
  step "Pushing schema via psql"

  DB_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.${PROJECT_REF}.supabase.co:5432/postgres"

  if [[ -z "$SUPABASE_DB_PASSWORD" ]]; then
    warn "SUPABASE_DB_PASSWORD not set — add it to apps/api/.env for psql access"
    warn "Alternatively, run the SQL manually in the Supabase SQL Editor"
    echo ""
    echo -e "${BOLD}Manual instructions:${RESET}"
    echo "  1. Go to https://supabase.com/dashboard/project/${PROJECT_REF}/sql"
    echo "  2. Paste the contents of supabase-schema.sql"
    echo "  3. Click Run"
  else
    psql "$DB_URL" -f supabase-schema.sql
    ok "Schema applied"
  fi

else
  # Fall back to Supabase REST API (pg-meta)
  step "psql not found — using Supabase REST API"

  SQL=$(cat supabase-schema.sql)

  RESPONSE=$(curl -s -X POST \
    "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(echo "$SQL" | jq -Rs .)}")

  if echo "$RESPONSE" | grep -q '"error"'; then
    warn "REST API push may have failed. Check response:"
    echo "$RESPONSE"
    echo ""
    echo -e "${BOLD}Fallback: paste supabase-schema.sql into the Supabase SQL Editor manually.${RESET}"
    echo "  https://supabase.com/dashboard/project/${PROJECT_REF}/sql"
  else
    ok "Schema applied via REST"
  fi
fi

# ── Seed initial agent row ────────────────────────────────────
step "Creating initial agent row"

AGENT_NAME=${WA_AGENT_NAME:-"Wavi"}

# Check if we already have an agent
EXISTING=$(curl -s \
  "${SUPABASE_URL}/rest/v1/agents?select=id&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

if echo "$EXISTING" | grep -q '"id"'; then
  AGENT_ID=$(echo "$EXISTING" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])" 2>/dev/null)
  ok "Agent already exists: $AGENT_ID"
  if [[ -n "$AGENT_ID" ]]; then
    if grep -q "^AGENT_ID=" apps/api/.env; then
      sed -i '' "s/^AGENT_ID=.*/AGENT_ID=${AGENT_ID}/" apps/api/.env 2>/dev/null || sed -i "s/^AGENT_ID=.*/AGENT_ID=${AGENT_ID}/" apps/api/.env
    else
      echo "" >> apps/api/.env
      echo "AGENT_ID=${AGENT_ID}" >> apps/api/.env
    fi
    ok "AGENT_ID written to apps/api/.env"
  fi
else
  # Create owner + agent
  OWNER_EMAIL=${OWNER_EMAIL:-"owner@wavi.local"}

  OWNER_RESP=$(curl -s -X POST \
    "${SUPABASE_URL}/rest/v1/owners" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "{\"email\": \"${OWNER_EMAIL}\"}")

  OWNER_ID=$(echo "$OWNER_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])" 2>/dev/null)

  if [[ -z "$OWNER_ID" ]]; then
    warn "Could not create owner row — do it manually in Supabase"
  else
    ok "Owner created: $OWNER_ID"

    AGENT_RESP=$(curl -s -X POST \
      "${SUPABASE_URL}/rest/v1/agents" \
      -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=representation" \
      -d "{\"owner_id\": \"${OWNER_ID}\", \"agent_name\": \"${AGENT_NAME}\"}")

    AGENT_ID=$(echo "$AGENT_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])" 2>/dev/null)

    if [[ -n "$AGENT_ID" ]]; then
      ok "Agent created: $AGENT_ID"

      # Write AGENT_ID back to .env
      if grep -q "^AGENT_ID=" apps/api/.env; then
        sed -i '' "s/^AGENT_ID=.*/AGENT_ID=${AGENT_ID}/" apps/api/.env 2>/dev/null || sed -i "s/^AGENT_ID=.*/AGENT_ID=${AGENT_ID}/" apps/api/.env
      else
        echo "" >> apps/api/.env
        echo "AGENT_ID=${AGENT_ID}" >> apps/api/.env
      fi
      ok "AGENT_ID written to apps/api/.env"
    fi
  fi
fi

echo -e "\n${GREEN}${BOLD}Database ready!${RESET}"
echo -e "Run ${BOLD}./scripts/dev.sh${RESET} to start development\n"
