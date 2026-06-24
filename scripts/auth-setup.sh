#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# scripts/auth-setup.sh
# Configure Supabase Auth (Google OAuth + redirect URLs) for the dashboard login screen.
#
# Prerequisites:
#   1. Google OAuth credentials (Client ID + Secret) from Google Cloud Console
#   2. Supabase personal access token from https://supabase.com/dashboard/account/tokens
#   3. apps/api/.env with SUPABASE_URL (and ideally DASHBOARD_URL for prod redirects)
#
# Usage:
#   export SUPABASE_ACCESS_TOKEN="sbp_..."
#   export GOOGLE_CLIENT_ID="....apps.googleusercontent.com"
#   export GOOGLE_CLIENT_SECRET="GOCSPX-..."
#   ./scripts/auth-setup.sh
#
# Or add the three vars above to apps/api/.env and run ./scripts/auth-setup.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
BOLD="\033[1m"
RESET="\033[0m"

step()  { echo -e "\n${CYAN}▶ $1${RESET}"; }
ok()    { echo -e "${GREEN}✓ $1${RESET}"; }
warn()  { echo -e "${YELLOW}⚠ $1${RESET}"; }
error() { echo -e "${RED}✗ $1${RESET}"; exit 1; }

json_get() {
  local payload="$1"
  local key="$2"
  if command -v jq &>/dev/null; then
    echo "$payload" | jq -r "$key"
  else
    PAYLOAD="$payload" KEY="$key" python3 - <<'PY'
import json, os
data = json.loads(os.environ["PAYLOAD"])
key = os.environ["KEY"]
parts = key.split(".")
cur = data
for part in parts:
    if part.endswith("]"):
        name, idx = part[:-1], int(part[-2])
        cur = cur[name][idx]
    else:
        cur = cur[part]
print(cur)
PY
  fi
}

echo -e "${BOLD}Wavi — Supabase Auth Setup${RESET}\n"

# ── Load env ──────────────────────────────────────────────────
if [[ ! -f apps/api/.env ]]; then
  error "apps/api/.env not found. Run ./scripts/setup.sh first, then fill in SUPABASE_URL."
fi

# shellcheck disable=SC1091
source scripts/lib/env.sh
load_env_file apps/api/.env
load_env_file apps/dashboard/.env 2>/dev/null || true

[[ -n "${SUPABASE_URL:-}" ]] || error "SUPABASE_URL not set in apps/api/.env"
[[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]] || error "SUPABASE_ACCESS_TOKEN not set. Create one at https://supabase.com/dashboard/account/tokens"

PROJECT_REF=$(echo "$SUPABASE_URL" | sed 's|https://||' | cut -d'.' -f1)
SUPABASE_CALLBACK_URL="${SUPABASE_URL%/}/auth/v1/callback"

step "Target project: ${PROJECT_REF} (${SUPABASE_URL})"

# ── Google OAuth credentials ──────────────────────────────────
if [[ -z "${GOOGLE_CLIENT_ID:-}" || -z "${GOOGLE_CLIENT_SECRET:-}" ]]; then
  echo ""
  warn "Google OAuth credentials are missing."
  echo ""
  echo -e "${BOLD}Create them in Google Cloud Console:${RESET}"
  echo "  1. https://console.cloud.google.com/apis/credentials"
  echo "  2. Create OAuth client ID → Web application"
  echo "  3. Authorized JavaScript origins:"
  echo "       http://localhost:5173"
  if [[ -n "${DASHBOARD_URL:-}" ]]; then
    echo "       ${DASHBOARD_URL%/}"
  else
    echo "       https://your-app.vercel.app"
  fi
  echo "  4. Authorized redirect URIs (required):"
  echo "       ${SUPABASE_CALLBACK_URL}"
  echo ""
  echo "Then export or add to apps/api/.env:"
  echo "  GOOGLE_CLIENT_ID=....apps.googleusercontent.com"
  echo "  GOOGLE_CLIENT_SECRET=GOCSPX-..."
  echo ""
  echo "Re-run: ./scripts/auth-setup.sh"
  exit 1
fi

# ── Build redirect allow-list ─────────────────────────────────
REDIRECT_URLS=(
  "http://localhost:5173/login"
  "http://127.0.0.1:5173/login"
  "https://*-*.vercel.app/login"
)

if [[ -n "${DASHBOARD_URL:-}" ]]; then
  REDIRECT_URLS+=("${DASHBOARD_URL%/}/login")
fi

URI_ALLOW_LIST=$(
  IFS=,
  echo "${REDIRECT_URLS[*]}"
)

SITE_URL="${DASHBOARD_URL:-http://localhost:5173}"
SITE_URL="${SITE_URL%/}"

step "Configuring Supabase Auth (Google + redirect URLs)"

PATCH_BODY=$(cat <<EOF
{
  "external_google_enabled": true,
  "external_google_client_id": "${GOOGLE_CLIENT_ID}",
  "external_google_secret": "${GOOGLE_CLIENT_SECRET}",
  "site_url": "${SITE_URL}",
  "uri_allow_list": "${URI_ALLOW_LIST}"
}
EOF
)

RESPONSE=$(curl -sS -w "\n%{http_code}" -X PATCH \
  "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$PATCH_BODY")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" != "200" ]]; then
  error "Supabase API returned HTTP ${HTTP_CODE}: ${BODY}"
fi

ok "Google OAuth enabled on Supabase"
ok "Site URL: ${SITE_URL}"
ok "Redirect URLs: ${REDIRECT_URLS[*]}"

# ── Sync anon key to dashboard .env ───────────────────────────
step "Syncing dashboard env vars"

KEYS_RESPONSE=$(curl -sS -w "\n%{http_code}" \
  "https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys?reveal=true" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}")

KEYS_HTTP=$(echo "$KEYS_RESPONSE" | tail -n1)
KEYS_BODY=$(echo "$KEYS_RESPONSE" | sed '$d')

if [[ "$KEYS_HTTP" == "200" ]]; then
  if command -v jq &>/dev/null; then
    ANON_KEY=$(echo "$KEYS_BODY" | jq -r '.[] | select(.name == "anon" or .type == "anon") | .api_key' | head -n1)
    if [[ -z "$ANON_KEY" || "$ANON_KEY" == "null" ]]; then
      ANON_KEY=$(echo "$KEYS_BODY" | jq -r '.[] | select(.name == "anon") | .api_key' | head -n1)
    fi
  else
    ANON_KEY=$(KEYS_BODY="$KEYS_BODY" python3 - <<'PY'
import json, os
keys = json.loads(os.environ["KEYS_BODY"])
for item in keys:
    if item.get("name") == "anon":
        print(item.get("api_key", ""))
        break
PY
)
  fi

  if [[ -n "$ANON_KEY" && "$ANON_KEY" != "null" ]]; then
    [[ -f apps/dashboard/.env ]] || cp apps/dashboard/.env.example apps/dashboard/.env

    set_env_var() {
      local file="$1" key="$2" value="$3"
      if grep -q "^${key}=" "$file"; then
        sed -i.bak "s|^${key}=.*|${key}=${value}|" "$file" && rm -f "${file}.bak"
      else
        echo "${key}=${value}" >>"$file"
      fi
    }

    set_env_var apps/dashboard/.env VITE_SUPABASE_URL "$SUPABASE_URL"
    set_env_var apps/dashboard/.env VITE_SUPABASE_ANON_KEY "$ANON_KEY"
    ok "Updated apps/dashboard/.env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)"
  else
    warn "Could not fetch anon key — copy it manually from Supabase → Settings → API"
  fi
else
  warn "Could not fetch API keys (HTTP ${KEYS_HTTP}) — copy anon key manually"
fi

# ── Summary ───────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}Auth setup complete!${RESET}\n"
echo "Verify in Supabase dashboard:"
echo "  https://supabase.com/dashboard/project/${PROJECT_REF}/auth/providers"
echo "  https://supabase.com/dashboard/project/${PROJECT_REF}/auth/url-configuration"
echo ""
echo "Google Cloud redirect URI must include:"
echo "  ${SUPABASE_CALLBACK_URL}"
echo ""
echo "Local dev:"
echo "  bun run dev"
echo "  Open http://localhost:5173 → you should be redirected to /login"
echo ""
echo "Production (after deploy):"
echo "  Set AUTH_REQUIRED=true in apps/api/.env and VITE_AUTH_REQUIRED=true in apps/dashboard/.env"
echo "  Run bun run sync-secrets:api"
