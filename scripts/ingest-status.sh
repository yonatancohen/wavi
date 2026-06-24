#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# scripts/ingest-status.sh
# Explain current ingest/rebuild progress for a group.
# Usage:
#   bun run ingest:status
#   bun run ingest:status -- --group-id <uuid>
#   bun run ingest:status -- --name "אדיר"
# ─────────────────────────────────────────────────────────────
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib/env.sh"
require_env_file "$ROOT/apps/api/.env" "apps/api/.env"
load_env_file "$ROOT/apps/api/.env"

cd "$ROOT/apps/api"
exec bun scripts/ingest-status.ts "$@"
