#!/usr/bin/env bash
# Merge same-display-name user_profiles (export label vs live phone id).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/api"
exec bun scripts/merge-duplicate-profiles.ts "$@"
