#!/usr/bin/env bash
# Shared helpers for loading local .env files in deploy scripts.

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 1

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    line="${line#export }"
    local key="${line%%=*}"
    local value="${line#*=}"
    key="$(echo "$key" | xargs)"
    value="$(echo "$value" | sed -e 's/^["'\''"]//' -e 's/["'\''"]$//')"
    [[ -n "$key" ]] && export "$key=$value"
  done < "$file"
}

require_env_file() {
  local file="$1"
  local label="$2"
  if [[ ! -f "$file" ]]; then
    echo "Missing $label ($file). Copy from .env.example and fill in values."
    return 1
  fi
}
