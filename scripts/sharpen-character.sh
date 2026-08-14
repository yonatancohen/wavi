#!/usr/bin/env bash
# One-shot: backfill group_events, then re-synthesize character.
# Requires group_events table (scripts/sql/group-events.sql) and apps/api/.env.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib/env.sh"
require_env_file "$ROOT/apps/api/.env" "apps/api/.env"
load_env_file "$ROOT/apps/api/.env"

echo "── 1/2 Backfill events"
bash "$ROOT/scripts/backfill-events.sh" "$@"
echo
echo "── 2/2 Re-synthesize character"
bash "$ROOT/scripts/resynthesize-character.sh" "$@"
echo
echo "Done. Check the Character tab, then replay an opinion vs a recall question."
