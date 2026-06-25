#!/usr/bin/env bash
# Merge phantom colon-suffixed user profiles into canonical members.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/api"
exec bun scripts/merge-colon-profiles.ts "$@"
