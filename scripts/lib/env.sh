#!/usr/bin/env bash
# Shared helpers for loading local .env files and resolving production URLs.

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

# True when a value must not be baked into a Vercel production build.
is_local_vite_api_url() {
  local url="$1"
  is_local_url "$url" || [[ "$url" == /api/* ]]
}

# Read Railway public domain (no trailing path).
fetch_railway_api_url() {
  local root="${1:-}"
  local domain=""

  [[ -n "$root" ]] || return 1
  [[ -x "$(command -v railway)" ]] || return 1

  (
    cd "$root/apps/api" || exit 1
    railway status &>/dev/null || exit 1
    domain=$(railway domain 2>/dev/null | grep -Eo '[^[:space:]]+\.(railway\.app|up\.railway\.app)' | head -1 || true)
    if [[ -z "$domain" ]]; then
      domain=$(railway domain 2>/dev/null | grep -Eo 'https?://[^[:space:]]+' | head -1 | sed 's|^https://||;s|http://||;s|/.*$||')
    fi
    [[ -n "$domain" ]] && normalize_url "$domain"
  )
}

# Persist the latest Railway API origin for downstream dashboard sync/build.
refresh_deploy_api_url() {
  local root="${1:-}"
  local url

  url="$(fetch_railway_api_url "$root")"
  [[ -z "$url" && -f "$root/.deploy-api-url" ]] && url="$(normalize_url "$(cat "$root/.deploy-api-url")")"
  [[ -z "$url" ]] && return 1

  echo "$url" > "$root/.deploy-api-url"
  echo "$url"
}

# Production API origin (no /api path) for Railway / Vercel sync.
resolve_api_base_url() {
  local root="${1:-}"
  local url=""

  if [[ -n "$root" && -f "$root/.deploy-api-url" ]]; then
    url="$(normalize_url "$(cat "$root/.deploy-api-url")")"
  fi

  if [[ -z "$url" ]]; then
    url="$(fetch_railway_api_url "$root")"
    [[ -n "$url" && -n "$root" ]] && echo "$url" > "$root/.deploy-api-url"
  fi

  if [[ -z "$url" && -n "${VITE_API_URL:-}" ]] && ! is_local_vite_api_url "$VITE_API_URL"; then
    url="$(normalize_url "${VITE_API_URL%/api}")"
  fi

  echo "$url"
}

# Pick the stable Vercel production alias (not the ephemeral deploy URL).
fetch_vercel_production_alias() {
  local deploy_url="$1"
  local aliases best="" alias host

  [[ -z "$deploy_url" ]] && return 1
  [[ -x "$(command -v vercel)" ]] || return 1

  aliases=$(vercel inspect "$deploy_url" 2>/dev/null | grep '╶' | grep -Eo 'https://[^[:space:]]+' || true)
  [[ -z "$aliases" ]] && return 1

  while IFS= read -r alias; do
    host="${alias#https://}"
    host="${host%/}"
    # Skip ephemeral deployment URLs and team-scoped aliases.
    [[ "$host" =~ -[a-z0-9]{8,}- ]] && continue
    [[ "$host" == *"-projects.vercel.app" ]] && continue
    best="$(normalize_url "$alias")"
    break
  done <<< "$aliases"

  [[ -z "$best" ]] && best="$(normalize_url "$(echo "$aliases" | head -1)")"
  echo "$best"
}

# Save stable dashboard origin after a prod deploy (used for Railway CORS).
save_dashboard_alias() {
  local root="$1"
  local deploy_url="$2"
  local alias

  alias="$(fetch_vercel_production_alias "$deploy_url")"
  [[ -z "$alias" ]] && return 1
  echo "$alias" > "$root/.deploy-dashboard-alias"
  echo "$alias"
}

# Production dashboard origin for Railway CORS.
resolve_dashboard_url() {
  local root="${1:-}"
  local url="" deploy_url

  if [[ -n "${DASHBOARD_URL:-}" ]] && ! is_local_url "$DASHBOARD_URL"; then
    url="$(normalize_url "$DASHBOARD_URL")"
  elif [[ -n "$root" && -f "$root/.deploy-dashboard-alias" ]]; then
    url="$(normalize_url "$(cat "$root/.deploy-dashboard-alias")")"
  elif [[ -n "$root" && -f "$root/.deploy-dashboard-url" ]]; then
    deploy_url="$(normalize_url "$(cat "$root/.deploy-dashboard-url")")"
    url="$(fetch_vercel_production_alias "$deploy_url")"
    [[ -z "$url" ]] && url="$deploy_url"
  fi

  echo "$url"
}

# Export VITE_* for dashboard builds and Vercel sync.
# Priority: SYNC_VITE_API_URL → Railway domain → non-local dashboard .env value.
prepare_dashboard_vite_env() {
  local root="${1:-}"
  local api_base=""

  require_env_file "$root/apps/dashboard/.env" "Dashboard env" || return 1
  load_env_file "$root/apps/dashboard/.env"

  if [[ -n "${SYNC_VITE_API_URL:-}" ]]; then
    export VITE_API_URL="$SYNC_VITE_API_URL"
  else
    api_base="$(resolve_api_base_url "$root")"
    if [[ -n "$api_base" ]]; then
      export VITE_API_URL="${api_base}/api"
    elif ! is_local_vite_api_url "${VITE_API_URL:-}"; then
      export VITE_API_URL="${VITE_API_URL%/api}/api"
    fi
  fi

  if [[ -z "$VITE_API_URL" ]] || is_local_vite_api_url "$VITE_API_URL"; then
    echo "Could not resolve VITE_API_URL — deploy the API first or run sync-secrets after Railway is up." >&2
    return 1
  fi

  if [[ -z "$VITE_SUPABASE_URL" || -z "$VITE_SUPABASE_ANON_KEY" ]]; then
    echo "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in apps/dashboard/.env" >&2
    return 1
  fi

  return 0
}

# Confirm Vercel actually stored non-empty values (env pull is unreliable for VITE_*).
verify_vercel_env() {
  local root="${1:-}"
  local env_name="${2:-production}"
  local key val fails=0

  [[ -x "$(command -v vercel)" ]] || return 0

  for key in VITE_API_URL VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY; do
    val=$(cd "$root" && vercel env run --environment="$env_name" -- printenv "$key" 2>/dev/null | tail -1 || true)
    if [[ -z "$val" ]]; then
      echo "Vercel $env_name/$key is empty after sync" >&2
      fails=$((fails + 1))
    fi
  done

  [[ "$fails" -eq 0 ]]
}
