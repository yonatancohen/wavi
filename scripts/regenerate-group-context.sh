#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib/env.sh"
require_env_file "$ROOT/apps/api/.env" "apps/api/.env"
load_env_file "$ROOT/apps/api/.env"
cd "$ROOT/apps/api"
exec bun scripts/regenerate-group-context.ts "$@"
