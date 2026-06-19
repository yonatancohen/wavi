#!/usr/bin/env bash
# Reset activity data, registered groups, and WhatsApp session for a clean start.
# Keeps owners/agents rows (same AGENT_ID).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

YELLOW="\033[0;33m"
RED="\033[0;31m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
RESET="\033[0m"
BOLD="\033[1m"

error() { echo -e "${RED}✗ $1${RESET}"; exit 1; }
ok()    { echo -e "${GREEN}✓ $1${RESET}"; }
warn()  { echo -e "${YELLOW}⚠ $1${RESET}"; }
step()  { echo -e "\n${CYAN}▶ $1${RESET}"; }

echo -e "${BOLD}Wavi — Fresh start reset${RESET}"
echo "Clears: replies, messages, groups, RAG data, Redis queues, local WhatsApp session"
echo -e "Keeps: owner + agent rows (${BOLD}AGENT_ID unchanged${RESET})\n"

[[ -f apps/api/.env ]] || error "apps/api/.env not found"
export $(grep -v '^#' apps/api/.env | xargs)

[[ -n "${SUPABASE_URL:-}" ]] || error "SUPABASE_URL not set"
[[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]] || error "SUPABASE_SERVICE_ROLE_KEY not set"

step "Clearing database activity + groups"
SQL=$(cat <<'SQL'
TRUNCATE TABLE
  replies,
  group_memories,
  group_contexts,
  relationship_map,
  user_profiles,
  episode_summaries,
  message_chunks,
  messages,
  groups
RESTART IDENTITY CASCADE;

UPDATE agents
SET phone_number = NULL,
    wa_session_data = NULL;
SQL
)

if command -v psql &>/dev/null && [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  PROJECT_REF=$(echo "$SUPABASE_URL" | sed 's|https://||' | cut -d'.' -f1)
  DB_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.${PROJECT_REF}.supabase.co:5432/postgres"
  echo "$SQL" | psql "$DB_URL" -q
else
  # Supabase SQL via Management API is not always available — use REST deletes in dependency order
  auth_hdr=(-H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")
  del_all() {
    local table="$1"
    curl -sS -X DELETE "${SUPABASE_URL}/rest/v1/${table}?id=not.is.null" "${auth_hdr[@]}" -H "Prefer: return=minimal" -o /dev/null -w "%{http_code}"
  }
  for table in replies group_memories group_contexts relationship_map user_profiles episode_summaries message_chunks messages groups; do
    code=$(del_all "$table")
    [[ "$code" == "204" || "$code" == "200" ]] || error "Failed to clear ${table} (HTTP ${code})"
  done
  curl -sS -X PATCH "${SUPABASE_URL}/rest/v1/agents?id=not.is.null" \
    "${auth_hdr[@]}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d '{"phone_number":null,"wa_session_data":null}' \
    -o /dev/null
fi
ok "Database cleared"

step "Flushing Redis queues and caches"
if [[ -n "${UPSTASH_REDIS_REST_URL:-}" && -n "${UPSTASH_REDIS_REST_TOKEN:-}" ]]; then
  (cd apps/api && bun -e "
import { Redis } from '@upstash/redis'
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})
const patterns = ['chunk_buffer:*', 'ratelimit:*', 'pending_reaction:*', 'ingestion_progress:*', 'chunk_counter:*']
let total = 0
for (const pattern of patterns) {
  for (const key of await redis.keys(pattern)) {
    await redis.del(key)
    total++
  }
}
while (await redis.rpop('reply_jobs')) total++
console.log('Redis keys cleared:', total)
")
  ok "Redis flushed"
else
  warn "Redis flush skipped (UPSTASH_* not set)"
fi

step "Removing local WhatsApp session"
if [[ -d apps/api/.wwebjs_auth ]]; then
  rm -rf apps/api/.wwebjs_auth
  ok "Removed apps/api/.wwebjs_auth"
else
  ok "No local session directory"
fi

if [[ -x scripts/wa-cleanup.sh ]]; then
  bash scripts/wa-cleanup.sh >/dev/null 2>&1 || true
  ok "Stale browser processes cleaned"
fi

echo -e "\n${GREEN}${BOLD}Fresh start complete.${RESET}"
echo "Restart the API (bun run dev), open /connect, and scan a new QR code.\n"
