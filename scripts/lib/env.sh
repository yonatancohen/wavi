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

# Strip whitespace and fix accidental double schemes (e.g. https://https://host).
normalize_url() {
  local url="$1"
  url="$(echo "$url" | tr -d '[:space:]')"
  url="${url%/}"
  while [[ "$url" =~ ^https?://https?:// ]]; do
    url="${url#https://}"
    url="${url#http://}"
    url="https://${url}"
  done
  if [[ "$url" =~ ^https?:// ]]; then
    echo "$url"
  elif [[ -n "$url" ]]; then
    echo "https://${url}"
  fi
}

is_local_url() {
  local url="$1"
  [[ "$url" == http://localhost:* || "$url" == http://127.0.0.1:* || "$url" == /api ]]
}

# Production API origin (no path) for Railway / Vercel sync.
resolve_api_base_url() {
  local root="${1:-}"
  local url=""

  if [[ -n "$root" && -f "$root/.deploy-api-url" ]]; then
    url="$(normalize_url "$(cat "$root/.deploy-api-url")")"
  fi

  if [[ -z "$url" && -n "${VITE_API_URL:-}" ]] && ! is_local_url "$VITE_API_URL"; then
    url="$(normalize_url "${VITE_API_URL%/api}")"
  fi

  echo "$url"
}

# Production dashboard origin for Railway CORS (local dev uses built-in localhost origins).
resolve_dashboard_url() {
  local root="${1:-}"
  local url=""

  if [[ -n "${DASHBOARD_URL:-}" ]] && ! is_local_url "$DASHBOARD_URL"; then
    url="$(normalize_url "$DASHBOARD_URL")"
  elif [[ -n "$root" && -f "$root/.deploy-dashboard-url" ]]; then
    url="$(normalize_url "$(cat "$root/.deploy-dashboard-url")")"
  fi

  echo "$url"
}
